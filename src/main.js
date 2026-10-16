import './style.css';
import { BUTTONS, createFrame, createProject, normalizeProject } from './tas/project.js';

let project = createProject();
let selected = 0;
let timer = null;
let selectedRom = null;
let romObjectUrl = null;
let emulatorStarted = false;
const $ = selector => document.querySelector(selector);

$('#app').innerHTML = `
<header><div class="brand"><span class="logo">64</span><span>N64 <b>TAS STUDIO</b></span></div><div class="actions"><span class="status" id="coreStatus">● CORE NOT LOADED</span><button id="open">Open project</button><button class="primary" id="export">Export TAS</button><input hidden id="projectFile" type="file" accept=".json,.n64tas"></div></header>
<main>
<section class="hero"><div><small>FRAME-BY-FRAME WORKBENCH</small><h1>Make every frame <em>count.</em></h1><p>Plan controller inputs, edit a timeline and build reproducible N64 TAS projects.</p></div><label class="rom"><input hidden id="romFile" type="file" accept=".z64,.n64,.v64"><b>＋ Choose your own N64 ROM</b><span id="romName">.z64 · .n64 · .v64 · selected locally only</span></label></section>
<div class="notice"><b>!</b><div><strong>Experimental N64 playback</strong><p>EmulatorJS is used for a first playable-core test. True frame advance and direct TAS input injection are not connected yet.</p></div></div>
<section class="workspace">
<article class="panel"><div class="heading">GAME VIEW <span id="gameStatus">WAITING FOR ROM</span></div><div class="screen emulatorScreen"><div id="emulatorPlayer"></div><div id="emptyScreen"><div class="screenlogo">N<span>64</span></div><h2>Load your own ROM</h2><p>Choose a ROM above, then start the emulator.</p><button id="startEmulator" class="primary">▶ Start N64 emulator</button><small>EmulatorJS · EXPERIMENTAL</small></div></div><div class="transport"><button id="reset">↺ Reset</button><button id="prev">−1</button><button class="primary play" id="play">▶ Play timeline</button><button id="next">+1</button><div class="frameNo"><small>SELECTED FRAME</small><b id="frameNo">000000</b></div></div></article>
<article class="panel"><div class="heading">CONTROLLER 1 <span id="frameLabel">FRAME 0</span></div><div class="controller"><div class="dpad"><button data-b="↑">↑</button><button data-b="←">←</button><button data-b="→">→</button><button data-b="↓">↓</button></div><div class="stick"><div>●</div><small>ANALOG STICK</small><label>X <input id="x" type="number" min="-128" max="127" value="0"></label><label>Y <input id="y" type="number" min="-128" max="127" value="0"></label></div><div class="face"><button data-b="C↑">C↑</button><button data-b="C←">C←</button><button data-b="C→">C→</button><button data-b="C↓">C↓</button><button data-b="A">A</button><button data-b="B">B</button></div></div><div class="shoulders"><button data-b="L">L</button><button data-b="Z">Z</button><button data-b="R">R</button><button data-b="Start">START</button></div><div class="footnote">Tap buttons to toggle input <button id="clear">Clear frame</button></div></article>
</section>
<section class="panel timeline"><div class="heading">INPUT TIMELINE <span id="count">1 FRAME</span><div><button id="add60">+ 60 frames</button><button id="add">+ Frame</button></div></div><div class="timeline-tools"><label>Go to frame <input id="jump" type="number" min="0" value="0"></label><span>Select a cell to edit its input</span><label>Zoom <input id="zoom" type="range" min="1" max="4" value="2"></label></div><div id="cells" class="cells"></div></section>
<section class="lower"><article class="panel"><div class="heading">PROJECT <span>LOCAL</span></div><label class="projectName">Project name<input id="name" value="Untitled N64 TAS" maxlength="80"></label><div class="stats"><div><small>TOTAL FRAMES</small><b id="total">1</b></div><div><small>INPUT FRAMES</small><b id="inputs">0</b></div><div><small>TIME @ 60 FPS</small><b id="duration">00:00.0</b></div></div><p class="hint">Project stays in this browser until exported. ROM bytes are not uploaded.</p></article><article class="panel"><div class="heading">DEVELOPMENT STATUS <span>PHASE 1</span></div><div class="roadmap"><p>✓ <b>Responsive TAS UI</b><small>Timeline and controller input prototype</small></p><p>✓ <b>Project JSON</b><small>Import and export</small></p><p>✓ <b>Experimental N64 runtime</b><small>EmulatorJS launcher; normal play only</small></p><p>2 <b>True frame advance</b><small>Needs core-level stepping and input injection</small></p><p>3 <b>Determinism validation</b><small>Required before frame-perfect claims</small></p></div></article></section>
<footer>N64 TAS STUDIO · EARLY PROTOTYPE <span>No ROMs included. Use legally obtained game files.</span></footer>
</main><div id="toast" role="status" aria-live="polite"></div>`;

function ensureFrame(index) {
  while (project.frames.length <= index) project.frames.push(createFrame(project.frames.length));
  let frame = project.frames.find(item => item.frame === index);
  if (!frame) { frame = createFrame(index); project.frames.push(frame); project.frames.sort((a,b) => a.frame-b.frame); }
  return frame;
}
function toast(message) {
  const element = $('#toast'); element.textContent = message; element.classList.add('show');
  clearTimeout(toast.timeout); toast.timeout = setTimeout(() => element.classList.remove('show'), 2400);
}
function stop() { clearInterval(timer); timer = null; $('#play').textContent = '▶ Play timeline'; }
function go(index) { selected = Math.max(0, Math.min(999999, Math.floor(Number(index) || 0))); ensureFrame(selected); render(); }
function render() {
  const frame = ensureFrame(selected);
  $('#frameNo').textContent = String(selected).padStart(6, '0');
  $('#frameLabel').textContent = 'FRAME ' + selected;
  $('#jump').value = selected; $('#x').value = frame.stickX; $('#y').value = frame.stickY; $('#name').value = project.name;
  $('#count').textContent = project.frames.length + ' FRAME' + (project.frames.length === 1 ? '' : 'S');
  $('#total').textContent = project.frames.length;
  $('#inputs').textContent = project.frames.filter(item => item.buttons.length || item.stickX || item.stickY).length;
  const seconds = project.frames.length / 60;
  $('#duration').textContent = String(Math.floor(seconds/60)).padStart(2,'0') + ':' + (seconds%60).toFixed(1).padStart(4,'0');
  document.querySelectorAll('[data-b]').forEach(button => {
    button.classList.toggle('active', frame.buttons.includes(button.dataset.b));
    button.setAttribute('aria-pressed', String(frame.buttons.includes(button.dataset.b)));
  });
  const cells = $('#cells'); cells.style.setProperty('--cell', (24 + Number($('#zoom').value)*8) + 'px'); cells.innerHTML = '';
  const start = Math.max(0, selected - 14);
  const end = Math.min(Math.max(project.frames.length - 1, selected + 18), start + 180);
  for (let index = start; index <= end; index++) {
    const item = project.frames.find(frame => frame.frame === index) || createFrame(index); const button = document.createElement('button');
    button.className = 'cell' + (index === selected ? ' selected' : '') + ((item.buttons.length || item.stickX || item.stickY) ? ' filled' : '');
    button.textContent = index % 10 === 0 ? index : '';
    button.title = 'Frame ' + index + ': ' + item.buttons.join(', ');
    button.setAttribute('aria-label', 'Select frame ' + index);
    button.onclick = () => go(index); cells.append(button);
  }
}
function toggle(buttonName) {
  const frame = ensureFrame(selected);
  frame.buttons = frame.buttons.includes(buttonName) ? frame.buttons.filter(item => item !== buttonName) : [...frame.buttons, buttonName];
  project.updatedAt = new Date().toISOString(); render();
}
document.querySelectorAll('[data-b]').forEach(button => button.addEventListener('click', () => toggle(button.dataset.b)));
$('#x').addEventListener('change', event => { ensureFrame(selected).stickX = Math.max(-128, Math.min(127, Math.round(Number(event.target.value)||0))); render(); });
$('#y').addEventListener('change', event => { ensureFrame(selected).stickY = Math.max(-128, Math.min(127, Math.round(Number(event.target.value)||0))); render(); });
$('#name').addEventListener('input', event => { project.name = event.target.value.slice(0,80); project.updatedAt = new Date().toISOString(); });
$('#jump').addEventListener('change', event => go(event.target.value));
$('#zoom').addEventListener('input', render);
$('#prev').addEventListener('click', () => go(selected-1));
$('#next').addEventListener('click', () => go(selected+1));
$('#reset').addEventListener('click', () => { stop(); go(0); });
$('#play').addEventListener('click', () => {
  if (timer) { stop(); return; }
  $('#play').textContent = 'Ⅱ Pause timeline';
  timer = setInterval(() => { if (selected >= Math.max(...project.frames.map(item => item.frame), 0)) { stop(); return; } go(selected+1); }, 1000/60);
});
$('#add').addEventListener('click', () => go(Math.max(...project.frames.map(item => item.frame), 0)+1));
$('#add60').addEventListener('click', () => go(Math.max(...project.frames.map(item => item.frame), 0)+60));
$('#clear').addEventListener('click', () => { const frame = ensureFrame(selected); frame.buttons = []; frame.stickX = 0; frame.stickY = 0; render(); });
$('#romFile').addEventListener('change', event => {
  const file = event.target.files?.[0]; if (!file) return;
  selectedRom = file;
  project.romName = file.name;
  $('#romName').textContent = file.name + ' — selected locally';
  $('#gameStatus').textContent = 'ROM READY';
  toast('ROM ready. Tap Start N64 emulator.');
});
$('#startEmulator').addEventListener('click', () => {
  if (!selectedRom) { $('#romFile').click(); toast('Choose a ROM file first.'); return; }
  if (emulatorStarted) { toast('Emulator is already running. Reload the page to start another ROM.'); return; }
  const button = $('#startEmulator');
  button.disabled = true; button.textContent = 'Loading emulator…';
  $('#coreStatus').textContent = '● LOADING EMULATORJS';
  $('#gameStatus').textContent = 'LOADING CORE';
  romObjectUrl = URL.createObjectURL(selectedRom);
  const gameName = selectedRom.name.replace(/\\.[^.]+$/, '');
  const player = document.createElement('iframe');
  player.title = 'N64 Emulator';
  player.allow = 'autoplay; fullscreen; gamepad';
  player.setAttribute('allowfullscreen', '');
  player.className = 'emulatorFrame';
  player.srcdoc = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#game{margin:0;width:100%;height:100%;background:#05070b;overflow:hidden}#game{width:100%;height:100%}</style></head><body><div id="game"></div><script>window.EJS_player='#game';window.EJS_core='n64';window.EJS_gameUrl=${JSON.stringify(romObjectUrl)};window.EJS_pathtodata='https://cdn.emulatorjs.org/stable/data/';window.EJS_startOnLoaded=true;window.EJS_gameName=${JSON.stringify(gameName)};window.EJS_language='en-US';</script><script src="https://cdn.emulatorjs.org/stable/data/loader.js"></script></body></html>`;
  player.addEventListener('load', () => {
    emulatorStarted = true;
    $('#emptyScreen').classList.add('hidden');
    $('#coreStatus').textContent = '● CORE STARTING';
    $('#gameStatus').textContent = 'STARTING';
  });
  player.addEventListener('error', () => {
    $('#coreStatus').textContent = '● LOAD FAILED';
    $('#gameStatus').textContent = 'CORE FAILED';
    button.disabled = false; button.textContent = 'Retry emulator load';
    toast('EmulatorJS failed to load. Check connection and retry.');
  });
  $('#emulatorPlayer').replaceChildren(player);
  toast('EmulatorJS is loading. First boot may take a while.');
});
$('#export').addEventListener('click', () => {
  project.updatedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(project, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = (project.name || 'n64-tas').replace(/[^a-z0-9-_]+/gi,'-') + '.n64tas.json';
  link.click(); URL.revokeObjectURL(url); toast('TAS project exported.');
});
$('#open').addEventListener('click', () => $('#projectFile').click());
$('#projectFile').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try { project = normalizeProject(JSON.parse(await file.text())); selected = 0; render(); toast('Project imported.'); }
  catch (error) { toast(error.message || 'Could not open project.'); }
  event.target.value = '';
});
render();
