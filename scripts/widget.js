// Always-visible player window for everyone: the YouTube player(s), main channel title + mm:ss, general volume, board buttons.
// A normal Foundry window so PopOut! can move it to its own browser window; it has no close/minimize (YouTube requires the player to stay visible).
import { MOD, getState, pos, duration, rebind } from './engine.js';
import { press, canPlay, allButtons } from './effects.js';
import { setBox, boxWin } from './yt.js';

export const t = (k) => game.i18n.localize(`FSB.${k}`);
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const btnFace = (b) => (b.image ? `<img src="${esc(b.image)}" alt="">` : `<i class="${esc(b.icon || 'fa-solid fa-music')}"></i>`);

const mainChannel = () => { const st = getState(); return st.channels.find((c) => c.id === st.main && c.queue.length) ?? st.channels.find((c) => c.queue.length && c.playing) ?? st.channels.find((c) => c.queue.length); };
const cfg = () => game.settings.get(MOD, 'widget');

let app; let openManager;
const { ApplicationV2 } = foundry.applications.api;

class Player extends ApplicationV2 {
  static DEFAULT_OPTIONS = { id: 'fsb-widget', classes: ['fsb', 'fsb-widget'], window: { title: 'FSB.Title', minimizable: false, resizable: false }, position: { width: 380 } };

  async _renderHTML() {
    const ch = mainChannel(); const c = cfg();
    const btns = allButtons().filter((b) => canPlay(b));
    const w = this.element?.ownerDocument.defaultView ?? window; // the pop-out window has its own autoplay permission
    const blocked = !w.navigator.userActivation?.hasBeenActive && getState().channels.some((x) => x.playing);
    return `
      <div class="bar">
        <div class="info"><div class="title">${esc(ch?.queue[ch.index]?.title ?? t('Idle'))}</div><div class="time"></div></div>
        ${blocked ? `<button data-a="unlock"><i class="fa-solid fa-volume-high"></i> ${t('EnableAudio')}</button>` : ''}
        <i class="fa-solid fa-volume-low"></i>
        <input type="range" min="0" max="100" value="${game.settings.get(MOD, 'general')}" data-a="general" title="${t('General')}">
        ${game.user.isGM ? `<button data-a="manager" title="${t('Manager')}"><i class="fa-solid fa-sliders"></i></button>` : ''}
        ${btns.length ? `<button data-a="toggle"><i class="fa-solid fa-chevron-${c.open ? 'up' : 'down'}"></i></button>` : ''}
      </div>
      ${c.open && btns.length ? `<div class="panel">${btns.map((b) => `<button class="sb" data-a="fx" data-id="${b.id}" title="${esc(b.label)}" style="--c:${esc(b.color || '#444')}">${btnFace(b)}<span>${esc(b.label)}</span></button>`).join('')}</div>` : ''}`;
  }

  // only the .ui part is redrawn: #fsb-yt (the iframes) must survive every render
  _replaceHTML(html, content) {
    if (!content.querySelector('.ui')) content.innerHTML = '<div class="ui"></div><div id="fsb-yt"></div>';
    content.querySelector('.ui').innerHTML = html;
    setBox(content.querySelector('#fsb-yt'));
    tick();
  }

  _onFirstRender() {
    const el = this.element;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'unlock') import('./engine.js').then((m) => m.reconcile()).then(render);
      else if (a === 'manager') openManager();
      else if (a === 'toggle') game.settings.set(MOD, 'widget', { ...cfg(), open: !cfg().open }).then(render);
      else if (a === 'fx') press(allButtons().find((x) => x.id === b.dataset.id));
    });
    el.addEventListener('input', (e) => { if (e.target.dataset.a === 'general') game.settings.set(MOD, 'general', Number(e.target.value)); });
  }

  _onPosition() { // remember where the player dragged it
    clearTimeout(this._save);
    this._save = setTimeout(() => game.settings.set(MOD, 'widget', { ...cfg(), x: this.position.left, y: this.position.top }), 800);
  }

  async close(options = {}) { return options.force ? super.close(options) : this; } // never hideable
}

export const render = () => app?.render();

function tick() {
  const ch = mainChannel(); const e = app?.element?.querySelector('.time');
  if (!e) return;
  const d = ch ? duration(ch.id) : 0;
  e.textContent = ch ? `${fmt(Math.min(pos(ch), d || Infinity))}${d ? ` / ${fmt(d)}` : ''}${ch.playing ? '' : ' ⏸'}` : '';
}

export async function initWidget(open) {
  openManager = open;
  const c = cfg();
  app = new Player({ position: { left: c.x ?? Math.max(0, innerWidth - 560), top: c.y ?? 8 } });
  await app.render({ force: true });
  // first user gesture: drop the "enable audio" button
  document.addEventListener('pointerdown', () => setTimeout(render, 0), { once: true, capture: true });
  setInterval(tick, 1000);
  // PopOut! moved the window (or put it back): rebuild the players in the window that now holds it
  const again = foundry.utils.debounce(async () => { await rebind(); render(); }, 500);
  for (const h of ['PopOut:loaded', 'PopOut:popin', 'PopOut:close']) Hooks.on(h, (a) => { if (a?.id === 'fsb-widget') again(); });
}
