// YouTube IFrame API helpers (official embed, hidden offscreen players).
let api;
export const ytReady = () => (api ??= new Promise((res) => {
  if (window.YT?.Player) return res();
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { prev?.(); res(); };
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.append(s);
}));

// Offscreen but not display:none (YouTube throttles hidden players); keeps the 200x113 minimum.
export const box = () => document.getElementById('fsb-yt')
  || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'fsb-yt' }));

export const vidOf = (u = '') => /(?:[?&]v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/.exec(u)?.[1];
export const listOf = (u = '') => /[?&]list=([\w-]+)/.exec(u)?.[1];
export const isYT = (u = '') => /youtu\.?be/.test(u) && !!vidOf(u);

export const title = (vid) => fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${vid}&format=json`)
  .then((r) => r.json()).then((j) => j.title).catch(() => vid);

/** Video ids of a YouTube playlist (loads it in a throwaway player; the API has no list call). */
export async function expandList(list) {
  await ytReady();
  return new Promise((res, rej) => {
    const el = box().appendChild(document.createElement('div'));
    const y = new YT.Player(el, {
      width: 200, height: 113, playerVars: { listType: 'playlist', list },
      events: {
        onReady: () => {
          let n = 0;
          const iv = setInterval(() => {
            const ids = y.getPlaylist?.();
            if (ids?.length || ++n > 25) { clearInterval(iv); y.destroy(); ids?.length ? res(ids) : rej(new Error('empty playlist')); }
          }, 300);
        },
        onError: () => { y.destroy(); rej(new Error('playlist error')); },
      },
    });
  });
}

/** Link (video or playlist) -> [{vid, title}] */
export async function resolve(url) {
  const l = listOf(url); const v = vidOf(url);
  const ids = l && !l.startsWith('RD') ? await expandList(l) : v ? [v] : null; // RD* = auto mixes, not listable
  if (!ids) throw new Error('Invalid YouTube link');
  return Promise.all(ids.map(async (vid) => ({ vid, title: await title(vid) })));
}
