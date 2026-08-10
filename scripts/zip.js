/**
 * 의존성 없는 최소 ZIP(deflate) 아카이브 생성기.
 *
 * 새 devDependency 를 받지 않기 위해 Node 내장 `zlib` 만 사용한다.
 * ZIP 의 압축 방식 8번(deflate)은 곧 raw deflate 스트림이라 `deflateRawSync` 출력이
 * 그대로 들어간다. 확장 zip 은 수백 KB 규모라 ZIP64 는 필요 없고, 4GB/65535개를
 * 넘으면 조용히 깨진 아카이브를 만드는 대신 예외를 던진다.
 *
 * 타임스탬프는 1980-01-01 로 고정한다 — 같은 입력이면 항상 같은 바이트가 나와서
 * "스토어에 올린 zip 이 이 커밋에서 나온 게 맞는지" 해시로 확인할 수 있다.
 */

import { deflateRawSync } from 'node:zlib';

const SIGNATURE_LOCAL = 0x04034b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_EOCD = 0x06054b50;

const VERSION_NEEDED = 20; // 2.0 = deflate 지원
const FLAG_UTF8 = 0x0800; // 파일명이 UTF-8 임을 명시
const METHOD_DEFLATE = 8;

// MS-DOS 형식 고정 타임스탬프: 1980-01-01 00:00:00
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

const MAX_UINT32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;

/** CRC-32 (IEEE 802.3) 룩업 테이블. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value;
  }
  return table;
})();

/**
 * @param {Buffer} buffer
 * @returns {number} 부호 없는 32비트 CRC 값
 */
export function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

/**
 * ZIP 아카이브 바이트를 만든다.
 *
 * @param {Array<{ path: string, data: Buffer }>} entries
 *        `path` 는 아카이브 내부 경로(항상 `/` 구분자, 앞에 `/` 없음).
 * @returns {Buffer}
 */
export function buildZip(entries) {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`ZIP64 미지원: 항목이 ${MAX_ENTRIES}개를 넘었습니다 (${entries.length}개).`);
  }

  // 경로순 정렬 — 파일 시스템 순회 순서와 무관하게 재현 가능한 바이트를 얻는다.
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const seen = new Set();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of sorted) {
    if (seen.has(entry.path)) {
      throw new Error(`아카이브 내부 경로가 중복됐습니다: ${entry.path}`);
    }
    seen.add(entry.path);

    const nameBytes = Buffer.from(entry.path, 'utf8');
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const checksum = crc32(entry.data);

    if (entry.data.length > MAX_UINT32 || compressed.length > MAX_UINT32) {
      throw new Error(`ZIP64 미지원: 파일이 4GB를 넘습니다 (${entry.path}).`);
    }

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(SIGNATURE_LOCAL, 0);
    localHeader.writeUInt16LE(VERSION_NEEDED, 4);
    localHeader.writeUInt16LE(FLAG_UTF8, 6);
    localHeader.writeUInt16LE(METHOD_DEFLATE, 8);
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field 없음

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(SIGNATURE_CENTRAL, 0);
    centralHeader.writeUInt16LE(VERSION_NEEDED, 4); // version made by
    centralHeader.writeUInt16LE(VERSION_NEEDED, 6); // version needed
    centralHeader.writeUInt16LE(FLAG_UTF8, 8);
    centralHeader.writeUInt16LE(METHOD_DEFLATE, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field 길이
    centralHeader.writeUInt16LE(0, 32); // 주석 길이
    centralHeader.writeUInt16LE(0, 34); // 시작 디스크 번호
    centralHeader.writeUInt16LE(0, 36); // internal attributes
    centralHeader.writeUInt32LE(0, 38); // external attributes
    centralHeader.writeUInt32LE(offset, 42);

    localChunks.push(localHeader, nameBytes, compressed);
    centralChunks.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + compressed.length;

    if (offset > MAX_UINT32) {
      throw new Error('ZIP64 미지원: 아카이브가 4GB를 넘습니다.');
    }
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIGNATURE_EOCD, 0);
  eocd.writeUInt16LE(0, 4); // 디스크 번호
  eocd.writeUInt16LE(0, 6); // 중앙 디렉터리 시작 디스크
  eocd.writeUInt16LE(sorted.length, 8);
  eocd.writeUInt16LE(sorted.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // 아카이브 주석 길이

  return Buffer.concat([...localChunks, centralDirectory, eocd]);
}
