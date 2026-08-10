// 세그먼트의 미디어(이미지 + 동영상)를 vault 안으로 내려받아 저장한다.
//
// 동영상 정책:
//   - `src`가 평문 http(s) URL인 경우에만 파일로 저장 (`vidN.mp4`).
//   - blob:(MediaSource) / HLS(.m3u8) / DASH(.mpd)는 파일 하나로 받을 수 없으므로 시도조차 하지 않고,
//     대신 poster(커버 이미지)를 `vidN-poster.jpg`로 저장한다.
//   - 어느 쪽도 저장하지 못하면 `missingVideos`에 번호를 남겨 노트에 참조 블록이 반드시 남도록 한다.

const DEFAULT_IMAGE_MIME = 'image/jpeg';
const DEFAULT_VIDEO_MIME = 'video/mp4';

export function guessExt(url, fallback) {
  const m = String(url).match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  return m ? m[1].toLowerCase() : fallback;
}

async function fetchAsBlob(fetchImpl, url) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.blob();
}

async function putRemote(client, fetchImpl, url, vaultPath, fallbackMime) {
  const blob = await fetchAsBlob(fetchImpl, url);
  await client.putBinary(vaultPath, blob, blob.type || fallbackMime);
}

export async function uploadMedia({ client, folderPath, segments, fetchImpl }) {
  // 전역 fetch를 그대로 넘기면 this 바인딩이 풀려 illegal invocation이 날 수 있어 래핑
  const doFetch = fetchImpl || ((url) => fetch(url));
  const imageMap = {};
  const missingImages = [];
  const videoMap = {};
  const posterMap = {};
  const missingVideos = [];

  let imageNo = 1;
  let videoNo = 1;

  for (const seg of segments) {
    for (const url of seg.images || []) {
      const filename = `img${imageNo}.${guessExt(url, 'jpg')}`;
      try {
        await putRemote(client, doFetch, url, `${folderPath}/${filename}`, DEFAULT_IMAGE_MIME);
        imageMap[url] = filename;
      } catch (e) {
        missingImages.push(imageNo);
        console.warn('[threads-clipper] image failed', url, e);
      }
      imageNo++;
    }

    for (const video of seg.videos || []) {
      const no = videoNo++;
      let saved = false;

      if (video.src) {
        const filename = `vid${no}.${guessExt(video.src, 'mp4')}`;
        try {
          await putRemote(client, doFetch, video.src, `${folderPath}/${filename}`, DEFAULT_VIDEO_MIME);
          videoMap[video.src] = filename;
          saved = true;
        } catch (e) {
          console.warn('[threads-clipper] video failed', video.src, e);
        }
      }

      if (saved) continue;

      // 동영상 본편을 못 받았으면 최소한 커버 이미지라도 남긴다
      missingVideos.push(no);
      if (video.poster) {
        const filename = `vid${no}-poster.${guessExt(video.poster, 'jpg')}`;
        try {
          await putRemote(client, doFetch, video.poster, `${folderPath}/${filename}`, DEFAULT_IMAGE_MIME);
          posterMap[video.poster] = filename;
        } catch (e) {
          console.warn('[threads-clipper] poster failed', video.poster, e);
        }
      }
    }
  }

  return { imageMap, missingImages, videoMap, posterMap, missingVideos };
}
