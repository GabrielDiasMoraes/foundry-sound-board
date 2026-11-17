// GM manager window: channels/queues, saved playlists, boards. Delegated events, re-rendered from settings.
import { MOD, getState, update, play, pause, goto, next, newChannel, shuffleQueue } from './engine.js';
import { resolve } from './yt.js';
import { press, stopAll } from './effects.js';
import { t, esc, btnFace } from './widget.js';

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const boardsGet = () => foundry.utils.deepClone(game.settings.get(MOD, 'boards'));
const boardsSet = (b) => game.settings.set(MOD, 'boards', b);
const listsGet = () => foundry.utils.deepClone(game.settings.get(MOD, 'playlists'));

const ask = (title, content, render) => DialogV2.prompt({
  window: { title }, content, rejectClose: false, render, position: { width: 420 },
  // <file-picker> is not part of FormData, so its value is copied in by hand
  ok: { callback: (ev, btn) => { const d = Object.fromEntries(new FormData(btn.form)); btn.form.querySelectorAll('file-picker[name]').forEach((f) => { d[f.name] = f.value; }); return d; } },
});
const askName = async (title, value = '') => (await ask(title, `<div class="form-group"><label>${t('Name')}</label><input name="v" value="${esc(value)}" autofocus></div>`))?.v?.trim();

export class Manager extends ApplicationV2 {
  static DEFAULT_OPTIONS = { id: 'fsb-manager', classes: ['fsb', 'fsb-manager'], window: { title: 'FSB.Title', resizable: true }, position: { width: 560, height: 640 } };

  tab = 'channels'; board = 0; target = null;
  q = ''; fold = new Set(); // fold = ids toggled away from their default (channels open, playlists closed)

  _open(id, def) { return this.q ? true : def !== this.fold.has(id); }
  _hit(title) { return !this.q || title.toLowerCase().includes(this.q.toLowerCase()); }
  _search() { return `<div class="row"><i class="fa-solid fa-magnifying-glass"></i><input data-q value="${esc(this.q)}" placeholder="${t('Search')}"></div>`; }

  async _renderHTML() {
    const tabs = ['channels', 'playlists', 'board'];
    return `<div class="hdr"><nav class="tabs">${tabs.map((k) => `<a data-a="tab" data-v="${k}" class="${k === this.tab ? 'on' : ''}">${t(k)}</a>`).join('')}</nav>
      ${this.tab === 'board' ? '' : this._search()}</div><div class="body">${this[`_${this.tab}`]()}</div>`;
  }

  _replaceHTML(html, content) { content.innerHTML = html; }

  _onFirstRender() {
    this.element.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) this._act(b, e); });
    this.element.addEventListener('input', (e) => { // only the results are redrawn, so the field keeps focus and fast typing is not lost
      if (e.target.dataset.q === undefined) return;
      this.q = e.target.value; this.element.querySelector('.body').innerHTML = this[`_${this.tab}`]();
    });
    this.element.addEventListener('change', (e) => { const b = e.target.closest('[data-c]'); if (b) this._change(b); });
    this.element.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.link !== undefined) this._act(e.target.nextElementSibling, e); });
  }

  // ---- views ----
  _channels() {
    const st = getState();
    const cards = st.channels.map((c) => {
      const rows = c.queue.map((q, i) => ({ q, i })).filter(({ q }) => this._hit(q.title));
      if (this.q && !rows.length) return '';
      const open = this._open(c.id, true);
      return `
      <div class="card" data-ch="${c.id}">
        <div class="row">
          <a data-a="fold" title="${t('Fold')}"><i class="fa-solid fa-chevron-${open ? 'down' : 'right'}"></i></a>
          <a data-a="main" title="${t('Main')}"><i class="fa-${st.main === c.id ? 'solid' : 'regular'} fa-star"></i></a>
          <b>${esc(c.name)} <span class="dim">(${c.queue.length})</span></b>
          <a data-a="prev"><i class="fa-solid fa-backward-step"></i></a>
          <a data-a="${c.playing ? 'pause' : 'play'}"><i class="fa-solid fa-${c.playing ? 'pause' : 'play'}"></i></a>
          <a data-a="next"><i class="fa-solid fa-forward-step"></i></a>
          <a data-a="loop" class="${c.loop ? 'on' : ''}" title="${t('Loop')}"><i class="fa-solid fa-repeat"></i></a>
          <a data-a="shuffle" class="${c.shuffle ? 'on' : ''}" title="${t('Shuffle')}"><i class="fa-solid fa-shuffle"></i></a>
          <input type="range" min="0" max="100" value="${c.volume}" data-c="vol" title="${t('Volume')}"><span>${c.volume}%</span>
          <a data-a="rename"><i class="fa-solid fa-pen"></i></a><a data-a="delch"><i class="fa-solid fa-trash"></i></a>
        </div>
        ${open ? `<ol>${rows.map(({ q, i }) => `<li class="${i === c.index ? 'cur' : ''}"><a data-a="goto" data-i="${i}">${esc(q.title)}</a><a data-a="rm" data-i="${i}" title="${t('Remove')}"><i class="fa-solid fa-xmark"></i></a></li>`).join('') || `<li class="dim">${t('Empty')}</li>`}</ol>
        <div class="row"><input data-link placeholder="${t('LinkHint')}"><button data-a="add"><i class="fa-solid fa-plus"></i> ${t('Add')}</button>
          <button data-a="save" title="${t('SaveQueue')}"><i class="fa-solid fa-floppy-disk"></i></button><button data-a="clear" title="${t('Clear')}"><i class="fa-solid fa-eraser"></i></button></div>` : ''}
      </div>`;
    }).join('');
    return `${cards}<button data-a="addch"><i class="fa-solid fa-plus"></i> ${t('AddChannel')}</button>`;
  }

  _playlists() {
    const st = getState(); this.target ??= st.channels[0]?.id;
    const cards = listsGet().map((l) => {
      const rows = l.items.map((it, i) => ({ it, i })).filter(({ it }) => this._hit(it.title));
      if (this.q && !rows.length) return '';
      const open = this._open(l.id, false);
      return `<div class="card" data-pl="${l.id}"><div class="row"><a data-a="fold"><i class="fa-solid fa-chevron-${open ? 'down' : 'right'}"></i></a><b>${esc(l.name)}</b><span class="dim">${l.items.length}</span>
        <button data-a="plload">${t('Load')}</button><button data-a="plapp">${t('Append')}</button><a data-a="pldel"><i class="fa-solid fa-trash"></i></a></div>
        ${open ? `<ol>${rows.map(({ it, i }) => `<li><span>${esc(it.title)}</span><a data-a="plrm" data-i="${i}" title="${t('Remove')}"><i class="fa-solid fa-xmark"></i></a></li>`).join('')}</ol>` : ''}</div>`;
    }).join('');
    return `<div class="row"><label>${t('Target')}</label><select data-c="target">${st.channels.map((c) => `<option value="${c.id}" ${c.id === this.target ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      ${cards || `<p class="dim">${t('NoPlaylists')}</p>`}`;
  }

  _board() {
    const bs = game.settings.get(MOD, 'boards'); const b = bs[this.board] ?? bs[0];
    return `<nav class="tabs sub">${bs.map((x, i) => `<a data-a="bsel" data-i="${i}" class="${x === b ? 'on' : ''}">${esc(x.name)}</a>`).join('')}
        <a data-a="addb"><i class="fa-solid fa-plus"></i></a><a data-a="renb"><i class="fa-solid fa-pen"></i></a><a data-a="delb"><i class="fa-solid fa-trash"></i></a></nav>
      <div class="grid">${b.buttons.map((x) => `<div class="cell"><button class="sb" data-a="fx" data-id="${x.id}" style="--c:${esc(x.color || '#444')}">${btnFace(x)}<span>${esc(x.label)}</span></button>
        <div><a data-a="editbtn" data-id="${x.id}"><i class="fa-solid fa-pen"></i></a><a data-a="delbtn" data-id="${x.id}"><i class="fa-solid fa-trash"></i></a></div></div>`).join('')}
        <button class="sb add" data-a="editbtn"><i class="fa-solid fa-plus"></i></button></div>
      <button data-a="stopall"><i class="fa-solid fa-stop"></i> ${t('StopAll')}</button>`;
  }

  // ---- handlers ----
  async _change(b) {
    const id = b.closest('[data-ch]')?.dataset.ch;
    if (b.dataset.c === 'target') { this.target = b.value; return; }
    if (b.dataset.c === 'vol') await update((st) => { st.channels.find((c) => c.id === id).volume = Number(b.value); });
  }

  async _act(b) {
    const a = b.dataset.a; const id = b.closest('[data-ch]')?.dataset.ch; const i = Number(b.dataset.i);
    const ch = (f) => update((st) => f(st.channels.find((c) => c.id === id), st));
    switch (a) {
      case 'tab': this.tab = b.dataset.v; this.q = ''; return this.render();
      case 'fold': { const k = id ?? b.closest('[data-pl]').dataset.pl; this.fold.has(k) ? this.fold.delete(k) : this.fold.add(k); return this.render(); }
      case 'shuffle': return ch((c) => { c.shuffle = !c.shuffle; if (c.shuffle) shuffleQueue(c); });
      case 'plrm': { const pid = b.closest('[data-pl]').dataset.pl; const ls = listsGet(); const l = ls.find((x) => x.id === pid); l.items.splice(i, 1); return game.settings.set(MOD, 'playlists', ls); }
      case 'main': return update((st) => { st.main = id; });
      case 'play': return ch(play);
      case 'pause': return ch(pause);
      case 'next': return ch((c) => c.queue.length && next(c));
      case 'prev': return ch((c) => c.queue.length && goto(c, Math.max(0, c.index - 1)));
      case 'loop': return ch((c) => { c.loop = !c.loop; });
      case 'goto': return ch((c) => goto(c, i));
      case 'rm': return ch((c) => { c.queue.splice(i, 1); if (i < c.index) c.index--; else if (i === c.index) { c.index = Math.min(c.index, Math.max(0, c.queue.length - 1)); if (c.queue.length) { c.startedAt = game.time.serverTime; c.pausedAt = 0; } else c.playing = false; } });
      case 'clear': return ch((c) => { c.queue = []; c.index = 0; c.playing = false; c.pausedAt = 0; });
      case 'addch': { const n = await askName(t('AddChannel')); return n && update((st) => st.channels.push(newChannel(n))); }
      case 'rename': { const n = await askName(t('Rename'), getState().channels.find((c) => c.id === id).name); return n && ch((c) => { c.name = n; }); }
      case 'delch': return DialogV2.confirm({ window: { title: t('Delete') }, content: `<p>${t('Delete')}?</p>`, rejectClose: false }).then((ok) => ok && update((st) => { st.channels = st.channels.filter((c) => c.id !== id); if (st.main === id) st.main = st.channels[0]?.id; }));
      case 'add': {
        const input = b.parentElement.querySelector('[data-link]'); const url = input.value.trim(); if (!url) return;
        b.disabled = true;
        try { const items = await resolve(url); input.value = ''; await ch((c) => { c.queue.push(...items); if (!c.playing && c.queue.length === items.length) { c.index = 0; c.pausedAt = 0; } }); }
        catch (err) { ui.notifications.error(`${t('BadLink')}: ${err.message}`); b.disabled = false; }
        return;
      }
      case 'save': {
        const c = getState().channels.find((x) => x.id === id); if (!c.queue.length) return;
        const n = await askName(t('SaveQueue'), c.name); if (!n) return;
        const ls = listsGet(); ls.push({ id: foundry.utils.randomID(), name: n, items: c.queue.map(({ vid, title }) => ({ vid, title })) });
        return game.settings.set(MOD, 'playlists', ls);
      }
      case 'plload': case 'plapp': {
        const l = listsGet().find((x) => x.id === b.closest('[data-pl]').dataset.pl);
        return update((st) => { const c = st.channels.find((x) => x.id === this.target); if (!c) return; if (a === 'plload') { c.queue = []; c.index = 0; c.playing = false; c.pausedAt = 0; } c.queue.push(...l.items); if (a === 'plload') goto(c, 0); });
      }
      case 'pldel': return game.settings.set(MOD, 'playlists', listsGet().filter((x) => x.id !== b.closest('[data-pl]').dataset.pl));
      case 'bsel': this.board = i; return this.render();
      case 'addb': { const n = await askName(t('AddBoard')); if (!n) return; const bs = boardsGet(); bs.push({ id: foundry.utils.randomID(), name: n, buttons: [] }); this.board = bs.length - 1; return boardsSet(bs); }
      case 'renb': { const bs = boardsGet(); const n = await askName(t('Rename'), bs[this.board].name); if (!n) return; bs[this.board].name = n; return boardsSet(bs); }
      case 'delb': { const bs = boardsGet(); if (bs.length < 2) return; bs.splice(this.board, 1); this.board = 0; return boardsSet(bs); }
      case 'fx': return press(boardsGet().flatMap((x) => x.buttons).find((x) => x.id === b.dataset.id));
      case 'stopall': return stopAll();
      case 'delbtn': { const bs = boardsGet(); bs[this.board].buttons = bs[this.board].buttons.filter((x) => x.id !== b.dataset.id); return boardsSet(bs); }
      case 'editbtn': return this._editButton(b.dataset.id);
    }
  }

  async _editButton(id) {
    const bs = boardsGet(); const list = bs[this.board].buttons;
    const x = list.find((y) => y.id === id) ?? { id: foundry.utils.randomID(), label: '', icon: 'fa-solid fa-music', color: '#3b82f6', volume: 100, loop: false, players: [] };
    const sel = Array.isArray(x.players) ? x.players : [];
    const f = (l, n, v, extra = '') => `<div class="form-group"><label>${t(l)}</label><input name="${n}" value="${esc(v ?? '')}" ${extra}></div>`;
    const out = await ask(t('Button'), `
      ${f('Label', 'label', x.label)}${f('Icon', 'icon', x.icon, 'placeholder="fa-solid fa-dragon"')}
      <div class="form-group"><label>${t('Image')}</label><file-picker name="image" type="image" value="${esc(x.image ?? '')}"></file-picker></div>
      <div class="form-group"><label>${t('Color')}</label><input type="color" name="color" value="${esc(x.color)}"></div>
      <div class="form-group"><label>${t('Sound')}</label><file-picker name="src" type="audio" value="${esc(x.src ?? '')}"></file-picker></div>
      ${f('Start', 'start', x.start, 'type="number" min="0" placeholder="s"')}${f('End', 'end', x.end, 'type="number" min="0" placeholder="s"')}
      <div class="form-group"><label>${t('Volume')}</label><input type="number" name="volume" min="0" max="100" value="${x.volume ?? 100}"></div>
      <div class="form-group"><label>${t('Loop')}</label><input type="checkbox" name="loop" ${x.loop ? 'checked' : ''}></div>
      <div class="form-group"><label>${t('Hotkey')}</label><input name="key" value="${esc(x.key ?? '')}" readonly placeholder="${t('HotkeyHint')}"></div>
      <fieldset><legend>${t('Players')}</legend>
        <label><input type="checkbox" name="all" ${x.players === 'all' ? 'checked' : ''}> ${t('AllPlayers')}</label>
        ${game.users.filter((u) => !u.isGM).map((u) => `<label><input type="checkbox" name="u.${u.id}" ${sel.includes(u.id) ? 'checked' : ''}> ${esc(u.name)}</label>`).join('')}</fieldset>`,
    (ev, dlg) => {
      const k = dlg.element.querySelector('[name=key]');
      k.addEventListener('keydown', (e) => { e.preventDefault(); k.value = e.key === 'Backspace' || e.key === 'Escape' ? '' : e.code; e.stopPropagation(); });
    });
    if (!out) return;
    if (!out.src?.trim()) return ui.notifications.warn(t('NeedSound'));
    const users = Object.keys(out).filter((k) => k.startsWith('u.')).map((k) => k.slice(2));
    Object.assign(x, { label: out.label, icon: out.icon, image: out.image, color: out.color, src: out.src.trim(), start: Number(out.start) || 0, end: Number(out.end) || 0,
      volume: Number(out.volume), loop: 'loop' in out, key: out.key, players: 'all' in out ? 'all' : users });
    if (!list.includes(x)) list.push(x);
    return boardsSet(bs);
  }
}
