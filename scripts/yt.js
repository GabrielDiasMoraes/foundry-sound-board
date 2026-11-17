// YouTube IFrame API helpers (official embed; the player is always visible inside the widget window).
const apis = new WeakMap(); // window -> promise: a pop-out window needs its own copy of the API, loaded in that window
export const ytReady = (win = window) => {
  if (win.YT?.Player) return Promise.resolve();
  if (!apis.has(win)) apis.set(win, new Promise((res) => {
    const prev = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => { prev?.(); res(); };
    const s = win.document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    win.document.head.append(s);
  }));
  return apis.get(win);
};

// Visible players only (YouTube terms forbid hiding the player): they live inside the widget window, full width (auto) x 200 (the minimum height YouTube allows).
let boxEl;
export const setBox = (e) => { boxEl = e; };
export const box = () => boxEl;
export const boxWin = () => boxEl?.ownerDocument.defaultView ?? window; // main window, or the PopOut! window
export const SIZE = { width: '100%', height: 200 };
// explicit origin: a pop-out window is about:blank, where the API would otherwise send "null" and never get events back
export const pv = (o = {}) => ({ origin: window.location.origin, ...o });

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
