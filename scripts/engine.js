// Music channels. Authoritative state lives in the world setting `state`: only the GM can write it,
// and Foundry pushes it to every client (onChange), including late joiners/reloads (read at ready).
import { ytReady, box, boxWin, SIZE, pv } from './yt.js';

export const MOD = 'foundry-sound-board';
export const getState = () => game.settings.get(MOD, 'state');
export const general = () => game.settings.get(MOD, 'general');
// Proportional mixing: every level is channel% x general%, so moving general scales all channels equally.
export const mix = (pct) => Math.round((pct * general()) / 100);

const players = new Map(); // channelId -> {yt, vid, ready, want}
let onChange = () => {};
export const onEngineChange = (f) => (onChange = f);

export const now = () => game.time.serverTime;
export const pos = (ch) => (ch.playing ? Math.max(0, (now() - ch.startedAt) / 1000) : ch.pausedAt / 1000);
export const duration = (id) => players.get(id)?.yt?.getDuration?.() || 0;

// ---- GM mutations -------------------------------------------------------------------------
export async function update(fn) {
  const st = foundry.utils.deepClone(getState());
  fn(st);
  await game.settings.set(MOD, 'state', st);
}
export const play = (ch) => { if (!ch.queue.length || ch.playing) return; ch.startedAt = now() - ch.pausedAt; ch.playing = true; };
export const pause = (ch) => { if (!ch.playing) return; ch.pausedAt = pos(ch) * 1000; ch.playing = false; };
export const goto = (ch, i) => { ch.index = i; ch.startedAt = now(); ch.pausedAt = 0; ch.playing = true; };
// Fisher-Yates; the current track stays first so toggling shuffle while playing does not restart it.
export function shuffleQueue(ch) {
  const cur = ch.queue[ch.index]; const rest = ch.queue.filter((_, i) => i !== ch.index);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  ch.queue = cur ? [cur, ...rest] : rest; ch.index = 0;
}
export function next(ch) {
  if (ch.index + 1 < ch.queue.length) return goto(ch, ch.index + 1);
  if (!(ch.loop || ch.shuffle) || !ch.queue.length) { ch.index = 0; ch.playing = false; ch.pausedAt = 0; return; }
  if (ch.shuffle && ch.queue.length > 1) { // new order each round; the track that just ended goes last
    shuffleQueue(ch); ch.queue.push(ch.queue.shift());
  }
  goto(ch, 0);
}
export const newChannel = (name) => ({ id: foundry.utils.randomID(), name, volume: 100, loop: false, shuffle: false, queue: [], index: 0, playing: false, startedAt: 0, pausedAt: 0 });

// ---- playback (every client) --------------------------------------------------------------
const advance = (id, vid) => {
  if (!game.users.activeGM?.isSelf) return; // exactly one GM advances the queue
  update((st) => { const c = st.channels.find((x) => x.id === id); if (c?.queue[c.index]?.vid === vid) next(c); });
};

function create(id) {
  const el = box().appendChild(document.createElement('div'));
  const p = { vid: null, ready: false, want: null };
  p.yt = new (boxWin().YT.Player)(el, {
    ...SIZE, playerVars: pv({ playsinline: 1, disablekb: 1 }),
    events: {
      onReady: () => { p.ready = true; sync(id); },
      onStateChange: (e) => { if (e.data === 0) advance(id, p.vid); onChange(); },
      onError: () => { if (game.users.activeGM?.isSelf) ui.notifications.warn(`YouTube: cannot play "${p.want?.queue[p.want.index]?.title}", skipping`); advance(id, p.vid); },
    },
  });
  return p;
}

function sync(id) {
  const p = players.get(id);
  if (!p?.ready) return;
  const ch = p.want; const item = ch.queue[ch.index];
  const t = pos(ch);
  p.yt.setVolume(mix(ch.volume));
  if (p.vid !== item.vid) {
    p.vid = item.vid;
    return ch.playing ? p.yt.loadVideoById(item.vid, t) : p.yt.cueVideoById(item.vid, t);
  }
  const d = p.yt.getDuration(); const cur = p.yt.getCurrentTime();
  if (ch.playing) {
    if (!d || t <= d) { if (Math.abs(cur - t) > 2) p.yt.seekTo(t, true); }
    if (![1, 3].includes(p.yt.getPlayerState())) p.yt.playVideo();
  } else {
    p.yt.pauseVideo();
    if (Math.abs(cur - t) > 1) p.yt.seekTo(t, true);
  }
}

export async function reconcile() {
  const st = getState();
  if (!box()) return; // the widget window is not rendered yet
  await ytReady(boxWin());
  const live = new Set(st.channels.filter((c) => c.queue[c.index] && c.playing).map((c) => c.id));
  for (const [id, p] of players) if (!live.has(id)) { p.yt.destroy(); players.delete(id); }
  for (const ch of st.channels) {
    if (!live.has(ch.id)) continue;
    if (!players.has(ch.id)) players.set(ch.id, create(ch.id));
    players.get(ch.id).want = ch;
    sync(ch.id);
  }
  onChange();
}

// the widget moved to or from a PopOut! window: its iframes were reloaded and lost their link to this script, so rebuild them there
export async function rebind() {
  for (const p of players.values()) { try { p.yt.destroy(); } catch { /* iframe already gone */ } }
  players.clear();
  await reconcile();
}

export const applyVolumes = () => { for (const p of players.values()) if (p.ready && p.want) p.yt.setVolume(mix(p.want.volume)); };

export function startEngine() {
  reconcile();
  setInterval(() => { for (const id of players.keys()) sync(id); }, 5000); // drift correction
  // first user gesture unblocks autoplay: retry playback
  document.addEventListener('pointerdown', () => { reconcile(); }, { once: true, capture: true });
}
