import { MOD, newChannel, reconcile, startEngine, applyVolumes } from './engine.js';
import { initEffects, applyFxVolumes } from './effects.js';
import { initWidget, render } from './widget.js';
import { Manager } from './manager.js';

let mgr;
const refresh = () => { render(); if (mgr?.rendered) mgr.render(); };

Hooks.once('init', () => {
  const reg = (k, d) => game.settings.register(MOD, k, { scope: 'world', config: false, ...d });
  const first = newChannel('Music');
  reg('state', { type: Object, default: { main: first.id, channels: [first] }, onChange: () => { reconcile(); refresh(); } });
  reg('playlists', { type: Array, default: [], onChange: refresh });
  reg('boards', { type: Array, default: [{ id: 'b1', name: 'Board 1', buttons: [] }], onChange: refresh });
  game.settings.register(MOD, 'general', { scope: 'client', config: false, type: Number, default: 100, onChange: () => { applyVolumes(); applyFxVolumes(); } });
  game.settings.register(MOD, 'widget', { scope: 'client', config: false, type: Object, default: { x: null, y: null, open: false } });
});

Hooks.once('ready', async () => {
  const open = () => { mgr ??= new Manager(); mgr.render({ force: true }); };
  game.modules.get(MOD).api = { open };
  initEffects();
  await initWidget(open);
  startEngine();
});
