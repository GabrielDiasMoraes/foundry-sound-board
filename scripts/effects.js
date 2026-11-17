// One-shot effects: ephemeral "channels" at 100%, scaled only by the general volume, removed when they end.
import { MOD, mix } from './engine.js';
import { ytReady, box, vidOf, isYT } from './yt.js';

const live = new Set(); // {btn, stop, setVol}
const channel = `module.${MOD}`;

export const allButtons = () => game.settings.get(MOD, 'boards').flatMap((b) => b.buttons);
export const canPlay = (btn, user = game.user) => user.isGM || btn.players === 'all' || (Array.isArray(btn.players) && btn.players.includes(user.id));
export const isLive = (id) => [...live].some((e) => e.btn.id === id);
export const applyFxVolumes = () => live.forEach((e) => e.setVol());

async function start(btn) {
  const entry = { btn };
  live.add(entry);
  const done = () => { live.delete(entry); };
  const start = Number(btn.start) || 0; const end = Number(btn.end) || 0;
  if (isYT(btn.src)) {
    await ytReady();
    const el = box().appendChild(document.createElement('div'));
    const y = new YT.Player(el, {
      width: 200, height: 113, videoId: vidOf(btn.src),
      playerVars: { controls: 0, start, ...(end ? { end } : {}) },
      events: {
        onReady: (e) => { entry.setVol(); e.target.playVideo(); },
        onStateChange: (e) => { if (e.data !== 0) return; if (btn.loop) { y.seekTo(start); y.playVideo(); } else entry.stop(); },
        onError: () => entry.stop(),
      },
    });
    entry.setVol = () => y.setVolume?.(mix(btn.volume ?? 100));
    entry.stop = () => { done(); y.destroy(); };
  } else {
    const a = new Audio(btn.src);
    a.currentTime = start;
    a.addEventListener('timeupdate', () => { if (end && a.currentTime >= end) btn.loop ? (a.currentTime = start) : entry.stop(); });
    a.addEventListener('ended', () => (btn.loop ? ((a.currentTime = start), a.play()) : entry.stop()));
    a.addEventListener('error', () => entry.stop());
    a.loop = !!btn.loop && !end;
    entry.setVol = () => { a.volume = Math.min(1, mix(btn.volume ?? 100) / 100); };
    entry.stop = () => { done(); a.pause(); a.removeAttribute('src'); a.load(); };
    entry.setVol();
    a.play().catch(() => entry.stop());
  }
}

function handle(msg, userId) {
  const user = game.users.get(userId);
  if (msg.t === 'stopall') { if (user?.isGM) [...live].forEach((e) => e.stop()); return; }
  const btn = allButtons().find((b) => b.id === msg.id);
  if (!btn || !user || !canPlay(btn, user)) return; // permission checked on every receiver
  if (msg.stop) [...live].filter((e) => e.btn.id === btn.id).forEach((e) => e.stop());
  else start(btn);
}

/** Press a board button: a looping button toggles, others retrigger. */
export function press(btn) {
  const msg = { t: 'fx', id: btn.id, stop: !!btn.loop && isLive(btn.id) };
  handle(msg, game.userId);
  game.socket.emit(channel, msg);
}
export function stopAll() { const msg = { t: 'stopall' }; handle(msg, game.userId); game.socket.emit(channel, msg); }

export function initEffects() {
  game.socket.on(channel, handle);
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input,textarea,select,[contenteditable]')) return;
    const btn = allButtons().find((b) => b.key && b.key === e.code && canPlay(b));
    if (btn) { e.preventDefault(); press(btn); }
  });
}
