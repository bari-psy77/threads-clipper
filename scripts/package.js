/**
 * 웹스토어 업로드용 zip 을 만든다.
 *
 *   npm run package   →  dist/threads-clipper-v<version>.zip
 *
 * 원칙
 * - **허용 목록 방식**: 담을 것을 명시적으로 나열한다(`manifest.json`, `src/`, `icons/`,
 *   있으면 `assets/`). 제외 목록 방식은 새 파일이 생길 때마다 조용히 새는 반면,
 *   허용 목록은 새 파일이 "빠지는" 쪽으로 실패하므로 사고가 눈에 띈다.
 *   그래서 매니페스트가 참조하는 파일이 실제로 담겼는지 별도로 검증한다.
 * - **테스트 게이트**: 스크립트가 vitest 를 직접 돌리고, 실패하면 zip 을 만들지 않는다.
 *   (`docs/packaging.md` 의 "테스트 게이트" 참고 — 우회 플래그는 일부러 두지 않았다.)
 * - **버전 필수**: `manifest.json` 의 version 이 없거나 Chrome 규격에 안 맞으면
 *   이름 없는 산출물을 만드는 대신 즉시 중단한다.
 *
 * 의존성은 Node 내장 모듈뿐이다.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildZip } from './zip.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(ROOT, 'dist');

/** zip 에 담을 최상위 항목. 여기 없는 것은 절대 들어가지 않는다. */
const INCLUDED_TOP_LEVEL = ['manifest.json', 'src', 'icons', 'assets'];

/** 허용 목록 안에 있더라도 걸러내는 OS/에디터 부산물. */
const EXCLUDED_BASENAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

/** 웹스토어 요약 설명 길이 상한. */
const DESCRIPTION_MAX = 132;

const warnings = [];

function fail(message) {
  console.error(`\n✗ 패키징 중단: ${message}\n`);
  process.exit(1);
}

function warn(message) {
  warnings.push(message);
}

/* ------------------------------------------------------------------ *
 * 1. 매니페스트 읽기 + 버전 검증
 * ------------------------------------------------------------------ */

function readManifest() {
  const manifestPath = path.join(ROOT, 'manifest.json');
  if (!existsSync(manifestPath)) {
    fail(`manifest.json 을 찾을 수 없습니다 (${manifestPath}).`);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`manifest.json 파싱 실패 — ${error.message}`);
  }
  return manifest;
}

/**
 * Chrome 확장 버전 규격 검증.
 * 점으로 구분된 1~4개의 정수, 각 0~65535, 0 이 아닌 값은 0 으로 시작 불가.
 * 어긋나면 던진다 — 버전 없는 zip 을 만드는 것보다 실패하는 편이 낫다.
 */
function assertValidVersion(version) {
  if (typeof version !== 'string' || version.trim() === '') {
    fail('manifest.json 에 version 이 없습니다. 스토어 업로드에는 버전이 반드시 필요합니다.');
  }
  const parts = version.split('.');
  if (parts.length < 1 || parts.length > 4) {
    fail(`manifest.json version "${version}" 형식 오류 — 점으로 구분된 정수 1~4개여야 합니다 (예: 0.1.0).`);
  }
  for (const part of parts) {
    if (!/^(0|[1-9]\d*)$/.test(part)) {
      fail(
        `manifest.json version "${version}" 형식 오류 — "${part}" 는 정수가 아니거나 0 으로 시작합니다 ` +
          '(Chrome 은 "01" 같은 앞자리 0 을 거부합니다).',
      );
    }
    if (Number(part) > 65535) {
      fail(`manifest.json version "${version}" 범위 오류 — "${part}" 가 65535 를 넘습니다.`);
    }
  }
  return version;
}

/* ------------------------------------------------------------------ *
 * 2. 테스트 게이트
 * ------------------------------------------------------------------ */

function runTests() {
  const vitestBin = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
  if (!existsSync(vitestBin)) {
    fail('vitest 를 찾을 수 없습니다. 먼저 `npm install` 을 실행하세요.');
  }
  console.log('▸ 테스트 실행 (vitest run) — 실패하면 zip 을 만들지 않습니다\n');
  // shell 없이 현재 node 로 직접 실행 — Windows/Unix 동일하게 동작한다.
  const result = spawnSync(process.execPath, [vitestBin, 'run'], { cwd: ROOT, stdio: 'inherit' });
  if (result.error) {
    fail(`테스트를 실행하지 못했습니다 — ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`테스트 실패 (exit ${result.status}). 테스트를 통과하지 않은 빌드는 배포하지 않습니다.`);
  }
  console.log('\n▸ 테스트 통과\n');
}

/* ------------------------------------------------------------------ *
 * 3. 파일 수집
 * ------------------------------------------------------------------ */

/**
 * 디렉터리를 재귀 순회해 `{ path, data }` 항목을 모은다.
 * 점으로 시작하는 이름과 OS 부산물은 건너뛴다.
 */
function collectDirectory(absoluteDir, archivePrefix, entries) {
  for (const name of readdirSync(absoluteDir).sort()) {
    if (name.startsWith('.') || EXCLUDED_BASENAMES.has(name)) continue;
    const absolute = path.join(absoluteDir, name);
    const archivePath = `${archivePrefix}/${name}`;
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      collectDirectory(absolute, archivePath, entries);
    } else if (stats.isFile()) {
      entries.push({ path: archivePath, data: readFileSync(absolute) });
    }
  }
}

function collectEntries() {
  const entries = [];
  for (const name of INCLUDED_TOP_LEVEL) {
    const absolute = path.join(ROOT, name);
    if (!existsSync(absolute)) continue; // assets/ 는 선택 사항
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      collectDirectory(absolute, name, entries);
    } else {
      entries.push({ path: name, data: readFileSync(absolute) });
    }
  }
  if (!entries.some((entry) => entry.path === 'manifest.json')) {
    fail('manifest.json 이 수집되지 않았습니다.');
  }
  return entries;
}

/* ------------------------------------------------------------------ *
 * 4. 매니페스트가 참조하는 파일이 전부 담겼는지 검증
 * ------------------------------------------------------------------ */

function referencedPaths(manifest) {
  const referenced = new Set();
  const add = (value) => {
    if (typeof value === 'string' && value.length > 0) {
      referenced.add(value.replace(/^\.?\//, ''));
    }
  };

  add(manifest.background?.service_worker);
  add(manifest.options_ui?.page);
  add(manifest.options_page);
  add(manifest.action?.default_popup);
  Object.values(manifest.icons ?? {}).forEach(add);
  Object.values(manifest.action?.default_icon ?? {}).forEach(add);
  for (const script of manifest.content_scripts ?? []) {
    (script.js ?? []).forEach(add);
    (script.css ?? []).forEach(add);
  }
  for (const resource of manifest.web_accessible_resources ?? []) {
    (resource.resources ?? []).forEach(add);
  }
  return [...referenced];
}

function assertReferencesPackaged(manifest, entries) {
  const packaged = new Set(entries.map((entry) => entry.path));
  // 와일드카드(web_accessible_resources 등)는 정확 매칭이 불가능하므로 건너뛴다.
  const missing = referencedPaths(manifest).filter((ref) => !ref.includes('*') && !packaged.has(ref));
  if (missing.length > 0) {
    fail(
      `매니페스트가 참조하는 파일이 zip 에 없습니다 — ${missing.join(', ')}\n` +
        `  (허용 목록: ${INCLUDED_TOP_LEVEL.join(', ')} — 새 폴더를 추가했다면 scripts/package.js 를 갱신하세요.)`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * 5. 스토어 준비 상태 경고 (빌드를 막지는 않는다)
 * ------------------------------------------------------------------ */

function checkStoreReadiness(manifest) {
  const description = manifest.description;
  if (typeof description !== 'string' || description.trim() === '') {
    warn('manifest.description 이 비어 있습니다 — 스토어 요약 설명에 필요합니다.');
  } else if (description.length > DESCRIPTION_MAX) {
    warn(`manifest.description 이 ${description.length}자입니다 — 스토어 상한 ${DESCRIPTION_MAX}자를 넘습니다.`);
  }
  for (const size of ['16', '48', '128']) {
    if (!manifest.icons?.[size]) {
      warn(`manifest.icons 에 ${size}px 아이콘이 없습니다.`);
    }
  }
  if (!existsSync(path.join(ROOT, 'LICENSE'))) {
    warn('LICENSE 파일이 없습니다 — 라이선스 미정 상태입니다 (docs/packaging.md 의 "라이선스" 참고).');
  }
}

/* ------------------------------------------------------------------ *
 * 6. 실행
 * ------------------------------------------------------------------ */

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main() {
  const manifest = readManifest();
  const version = assertValidVersion(manifest.version);
  console.log(`▸ ${manifest.name ?? 'extension'} v${version}\n`);

  runTests();

  const entries = collectEntries();
  assertReferencesPackaged(manifest, entries);
  checkStoreReadiness(manifest);

  const archive = buildZip(entries);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `threads-clipper-v${version}.zip`);
  rmSync(outputPath, { force: true });
  writeFileSync(outputPath, archive);

  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : 1));
  const rawBytes = sorted.reduce((sum, entry) => sum + entry.data.length, 0);
  const width = Math.max(...sorted.map((entry) => entry.path.length));

  console.log(`▸ zip 내용 (${sorted.length}개 파일)\n`);
  for (const entry of sorted) {
    console.log(`  ${entry.path.padEnd(width)}  ${formatBytes(entry.data.length).padStart(9)}`);
  }
  console.log(`\n  원본 합계 ${formatBytes(rawBytes)} → 압축 ${formatBytes(archive.length)}`);
  console.log(`  sha256    ${createHash('sha256').update(archive).digest('hex')}`);
  console.log(`\n▸ 생성: ${path.relative(ROOT, outputPath).replace(/\\/g, '/')}`);

  if (warnings.length > 0) {
    console.log('\n▸ 스토어 제출 전 확인 (빌드는 성공했습니다)');
    for (const message of warnings) {
      console.log(`  ! ${message}`);
    }
    console.log('  → docs/packaging.md');
  }
  console.log('');
}

main();
