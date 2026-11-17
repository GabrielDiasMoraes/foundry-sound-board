// Small always-on widget for everyone: main channel title + mm:ss, general volume, collapsible board buttons.
import { MOD, getState, pos, duration } from './engine.js';
import { press, canPlay, allButtons } from './effects.js';

export const t = (k) => game.i18n.localize(`FSB.${k}`);
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const btnFace = (b) => (b.image ? `<img src="${esc(b.image)}" alt="">` : `<i class="${esc(b.icon || 'fa-solid fa-music')}"></i>`);

let el; let openManager;
const mainChannel = () => { const st = getState(); return st.channels.find((c) => c.id === st.main && c.queue.length) ?? st.channels.find((c) => c.queue.length && c.playing) ?? st.channels.find((c) => c.queue.length); };

export function render() {
  const ch = mainChannel();
  const cfg = game.settings.get(MOD, 'widget');
  const btns = allButtons().filter((b) => canPlay(b));
  const blocked = !navigator.userActivation?.hasBeenActive && getState().channels.some((c) => c.playing);
  el.classList.toggle('open', cfg.open);
  el.innerHTML = `
    <div class="bar">
      <i class="fa-solid fa-grip-vertical grip" title="${t('Drag')}"></i>
      <div class="info"><div class="title">${esc(ch?.queue[ch.index]?.title ?? t('Idle'))}</div><div class="time"></div></div>
      ${blocked ? `<button data-a="unlock"><i class="fa-solid fa-volume-high"></i> ${t('EnableAudio')}</button>` : ''}
      <i class="fa-solid fa-volume-low"></i>
      <input type="range" min="0" max="100" value="${game.settings.get(MOD, 'general')}" data-a="general" title="${t('General')}">
      ${game.user.isGM ? `<button data-a="manager" title="${t('Manager')}"><i class="fa-solid fa-sliders"></i></button>` : ''}
      ${btns.length ? `<button data-a="toggle"><i class="fa-solid fa-chevron-${cfg.open ? 'up' : 'down'}"></i></button>` : ''}
    </div>
    ${cfg.open && btns.length ? `<div class="panel">${btns.map((b) => `<button class="sb" data-a="fx" data-id="${b.id}" title="${esc(b.label)}" style="--c:${esc(b.color || '#444')}">${btnFace(b)}<span>${esc(b.label)}</span></button>`).join('')}</div>` : ''}`;
  tick();
}

function tick() {
  const ch = mainChannel(); const e = el?.querySelector('.time');
  if (!e) return;
  const d = ch ? duration(ch.id) : 0;
  e.textContent = ch ? `${fmt(Math.min(pos(ch), d || Infinity))}${d ? ` / ${fmt(d)}` : ''}${ch.playing ? '' : ' ⏸'}` : '';
}

export function initWidget(open) {
  openManager = open;
  el = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'fsb-widget', className: 'fsb' }));
  const cfg = game.settings.get(MOD, 'widget');
  const place = (x, y) => { el.style.left = `${Math.max(0, Math.min(x, innerWidth - 120))}px`; el.style.top = `${Math.max(0, Math.min(y, innerHeight - 40))}px`; };
  place(cfg.x ?? innerWidth - 560, cfg.y ?? 8);

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'unlock') { import('./engine.js').then((m) => m.reconcile()); render(); }
    else if (a === 'manager') openManager();
    else if (a === 'toggle') game.settings.set(MOD, 'widget', { ...game.settings.get(MOD, 'widget'), open: !game.settings.get(MOD, 'widget').open }).then(render);
    else if (a === 'fx') press(allButtons().find((x) => x.id === b.dataset.id));
  });
  el.addEventListener('input', (e) => { if (e.target.dataset.a === 'general') game.settings.set(MOD, 'general', Number(e.target.value)); });
  el.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.grip')) return;
    const dx = e.clientX - el.offsetLeft; const dy = e.clientY - el.offsetTop;
    const move = (m) => place(m.clientX - dx, m.clientY - dy);
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      game.settings.set(MOD, 'widget', { ...game.settings.get(MOD, 'widget'), x: el.offsetLeft, y: el.offsetTop });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  // first user gesture: drop the "enable audio" button
  document.addEventListener('pointerdown', () => setTimeout(render, 0), { once: true, capture: true });
  setInterval(tick, 1000);
  render();
}
