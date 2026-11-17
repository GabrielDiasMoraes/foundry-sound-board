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

// Visible players only (YouTube terms forbid hiding the player): they live inside the widget, 356x200 (>= the 200x200 minimum).
export const box = () => document.getElementById('fsb-yt');
export const SIZE = { width: 356, height: 200 };

export const vidOf = (u = '') => /(?:[?&]v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/.exec(u)?.[1];
export const listOf = (u = '') => /[?&]list=([\w-]+)/.exec(u)?.[1];
export const isYT = (u = '') => /youtu\.?be/.test(u) && !!vidOf(u);

export const title = (vid) => fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${vid}&format=json`)
  .then((r) => r.json()).then((j) => j.title).catch(() => vid);

/** Video ids of a YouTube playlist (loads it in a throwaway player; the API has no list call). */
export async function expandList(list) {
  await ytReady();
  return new Promise((res, rej) => {
    // metadata lookup only: this player never plays or outputs sound, so it stays off screen
    const tmp = document.body.appendChild(Object.assign(document.createElement('div'), { style: 'position:fixed;left:-10000px;top:0' }));
    const el = tmp.appendChild(document.createElement('div'));
    const y = new YT.Player(el, {
      width: 200, height: 200, playerVars: { listType: 'playlist', list },
      events: {
        onReady: () => {
          let n = 0;
          const iv = setInterval(() => {
            const ids = y.getPlaylist?.();
            if (ids?.length || ++n > 25) { clearInterval(iv); y.destroy(); tmp.remove(); ids?.length ? res(ids) : rej(new Error('empty playlist')); }
          }, 300);
        },
        onError: () => { y.destroy(); tmp.remove(); rej(new Error('playlist error')); },
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
