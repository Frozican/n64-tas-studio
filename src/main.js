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
<section class="panel timeline"><div class="heading">INPUT TIMELINE <span id="count">1 FRAME</span><div><button id="add60">+ 60 frames</button><button id="add">+ Frame</button></div></div><div class="timeline-joystick"><div><strong>ANALOG STICK</strong><small>Drag the stick to set X/Y for the selected frame</small></div><div id="timelineStick" class="timeline-stick" role="slider" aria-label="Analog stick direction" aria-valuemin="-128" aria-valuemax="127" tabindex="0"><div class="stick-cross horizontal"></div><div class="stick-cross vertical"></div><div id="timelineKnob" class="timeline-knob"></div></div><div class="stick-values"><span>X <b id="timelineX">0</b></span><span>Y <b id="timelineY">0</b></span><button id="stickCenter">Center</button></div></div><div class="timeline-tools"><label>Go to frame <input id="jump" type="number" min="0" value="0"></label><span>Select a cell to edit its input</span><label>Zoom <input id="zoom" type="range" min="1" max="4" value="2"></label></div><div id="cells" class="cells"></div></section>
<section class="lower"><article class="panel"><div class="heading">PROJECT <span>LOCAL</span></div><label class="projectName">Project name<input id="name" value="Untitled N64 TAS" maxlength="80"></label><div class="stats"><div><small>TOTAL FRAMES</small><b id="total">1</b></div><div><small>INPUT FRAMES</small><b id="inputs">0</b></div><div><small>TIME @ 60 FPS</small><b id="duration">00:00.0</b></div></div><p class="hint">Project stays in this browser until exported. ROM bytes are not uploaded.</p></article><article class="panel"><div class="heading">DEVELOPMENT STATUS <span>PHASE 1</span></div><div class="roadmap"><p>✓ <b>Responsive TAS UI</b><small>Timeline and controller input prototype</small></p><p>✓ <b>Project JSON</b><small>Import and export</small></p><p>✓ <b>Experimental N64 runtime</b><small>EmulatorJS launcher; normal play only</small></p><p>2 <b>True frame advance</b><small>Needs core-level stepping and input injection</small></p><p>3 <b>Determinism validation</b><small>Required before frame-perfect claims</small></p></div></article></section>
<footer>N64 TAS STUDIO · EARLY PROTOTYPE <span>No ROMs included. Use legally obtained game files.</span></footer>
</main><div id="toast" role="status" aria-live="polite"></div>`;


// EmulatorJS controller bridge. Inputs are sent to the running core when its
// GameManager API is available. Frame stepping itself is not exposed by the
// public EmulatorJS API, so the transport remains timeline playback, not true
// deterministic core-level frame advance.
const emulatorButtons = {
  B: 0, A: 8, Start: 3, '↑': 4, '↓': 5, '←': 6, '→': 7,
  L: 10, R: 11, Z: 12, 'C↑': 13, 'C↓': 14, 'C←': 15, 'C→': 16
};
const activeCoreInputs = new Set();
let gamePaused = false;
function getEmulator() {
  const frame = $('#emulatorPlayer iframe');
  try {
    return frame?.contentWindow?.EJS_emulator
      || frame?.contentWindow?.parent?.EJS_emulator
      || null;
  } catch { return null; }
}
function setEmulatorPaused(paused) {
  const emulator = getEmulator();
  const manager = emulator?.gameManager;
  if (!emulator || !manager) {
    toast('Emulator is still loading. Wait until the game has started.');
    return false;
  }
  try {
    // EmulatorJS exposes pause() publicly; GameManager.toggleMainLoop is
    // the underlying fallback used by current builds.
    if (paused && typeof emulator.pause === 'function') {
      emulator.pause();
    } else if (!paused && typeof emulator.play === 'function') {
      emulator.play();
    } else if (typeof manager.toggleMainLoop === 'function') {
      manager.toggleMainLoop(!paused);
    } else {
      toast('This EmulatorJS build does not expose pause/resume.');
      return false;
    }
    gamePaused = paused;
    $('#play').textContent = paused ? '▶ Play' : 'Ⅱ Pause';
    return true;
  } catch (error) {
    console.error('Emulator pause/resume failed:', error);
    toast('Emulator could not pause. Try after the game has fully started.');
    return false;
  }
}
function getGameManager() {
  return getEmulator()?.gameManager || null;
}

// Step the running core by one reported frame, then pause it again.
let stepping = false;
let coreMonitor = null;
let lastCoreFrame = null;
let timelinePlayback = false;
function startCoreMonitor() {
  if (coreMonitor) clearInterval(coreMonitor);
  coreMonitor = setInterval(() => {
    const manager = getGameManager();
    if (!manager || typeof manager.getFrameNum !== 'function') return;
    let current;
    try { current = manager.getFrameNum(); } catch { return; }
    if (typeof current !== 'number' || !Number.isFinite(current)) return;
    if (lastCoreFrame === null) {
      lastCoreFrame = current;
      return;
    }
    if (current === lastCoreFrame) return;
    const previousCoreFrame = lastCoreFrame;
    const delta = Math.max(1, Math.min(10, current - lastCoreFrame));
    lastCoreFrame = current;
    if (current > previousCoreFrame && !gamePaused && !stepping) {
      captureCoreState(Math.max(0, current - (coreFrameOrigin ?? current)));
    }
    if (timelinePlayback) {
      for (let i = 0; i < delta; i++) {
        if (selected >= Math.max(...project.frames.map(item => item.frame), 0)) {
          timelinePlayback = false;
          $('#play').textContent = '▶ Play';
          releaseCoreInputs();
          break;
        }
        selected += 1;
        const frame = ensureFrame(selected);
        applyFrameToCore(frame);
      }
    } else if (!gamePaused && !stepping) {
      // Keep the editor's selected frame aligned with actual emulation.
      selected = Math.max(0, current - (coreFrameOrigin ?? current));
    }
    render();
  }, 8);
}
let coreFrameOrigin = null;
// Short in-memory rewind history. Emulator state and cartridge save RAM are
// captured together so rewinding doesn't leave the game's save data in the future.
const rewindHistory = new Map();
const MAX_REWIND_FRAMES = 180;
function copyBytes(value) {
  if (!value) return null;
  try { return new Uint8Array(value); } catch { return null; }
}
function captureCoreState(frameNumber) {
  const manager = getGameManager();
  if (!manager || typeof manager.getState !== 'function') return false;
  try {
    const state = copyBytes(manager.getState());
    if (!state || !state.length) return false;
    let saveRam = null;
    try { saveRam = copyBytes(manager.getSaveFile(false)); } catch {}
    rewindHistory.set(frameNumber, { state, saveRam });
    while (rewindHistory.size > MAX_REWIND_FRAMES) {
      rewindHistory.delete(rewindHistory.keys().next().value);
    }
    return true;
  } catch (error) {
    console.warn('Could not capture rewind state:', error);
    return false;
  }
}
function restoreCoreState(frameNumber) {
  const manager = getGameManager();
  const snapshot = rewindHistory.get(frameNumber);
  if (!manager || !snapshot || typeof manager.loadState !== 'function') return false;
  try {
    if (snapshot.saveRam && manager.FS && typeof manager.getSaveFilePath === 'function') {
      const path = manager.getSaveFilePath();
      if (path) {
        manager.FS.writeFile(path, copyBytes(snapshot.saveRam));
        if (typeof manager.loadSaveFiles === 'function') manager.loadSaveFiles();
      }
    }
    manager.loadState(copyBytes(snapshot.state));
    lastCoreFrame = typeof manager.getFrameNum === 'function' ? manager.getFrameNum() : null;
    coreFrameOrigin = lastCoreFrame === null ? null : lastCoreFrame - frameNumber;
    return true;
  } catch (error) {
    console.warn('Could not restore rewind state:', error);
    return false;
  }
}
function advanceCoreOneFrame(frame) {
  const manager = getGameManager();
  if (!manager || typeof manager.getFrameNum !== 'function' || typeof manager.toggleMainLoop !== 'function') {
    toast('Frame advance is unavailable until the N64 core has fully started.');
    return;
  }
  if (stepping) return;
  stepping = true;
  stop();
  try {
    manager.toggleMainLoop(0);
    gamePaused = true;
    $('#play').textContent = '▶ Play';
    applyFrameToCore(frame);
    const before = manager.getFrameNum();
    lastCoreFrame = before;
    manager.toggleMainLoop(1);
    const startedAt = Date.now();
    const poll = setInterval(() => {
      let current = before;
      try { current = manager.getFrameNum(); } catch {}
      if (current > before || Date.now() - startedAt > 500) {
        clearInterval(poll);
        try { manager.toggleMainLoop(0); } catch {}
        gamePaused = true;
        $('#pauseEmulator').textContent = '▶ Resume game';
        stepping = false;
        if (current <= before) toast('Core did not report a frame advance. Try again after the game is running.');
      }
    }, 4);
  } catch (error) {
    stepping = false;
    gamePaused = true;
    $('#pauseEmulator').textContent = '▶ Resume game';
    try { manager.toggleMainLoop(0); } catch {}
    console.error('Frame advance failed:', error);
    toast('Could not advance the emulator by one frame.');
  }
}
function setCoreInput(index, value) {
  const gm = getGameManager();
  if (!gm || typeof gm.simulateInput !== 'function') return false;
  try { gm.simulateInput(0, index, value); return true; } catch { return false; }
}
function releaseCoreInputs() {
  activeCoreInputs.forEach(index => setCoreInput(index, 0));
  activeCoreInputs.clear();
}
function applyFrameToCore(frame) {
  releaseCoreInputs();
  if (!frame) return;
  frame.buttons.forEach(name => {
    const index = emulatorButtons[name];
    if (index !== undefined && setCoreInput(index, 1)) activeCoreInputs.add(index);
  });
  // RetroArch analog axis indices are 16/17; values use signed 16-bit range.
  if (setCoreInput(16, Math.round(frame.stickX / 127 * 32767))) activeCoreInputs.add(16);
  if (setCoreInput(17, Math.round(-frame.stickY / 127 * 32767))) activeCoreInputs.add(17);
}

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
function stop() {
  clearInterval(timer); timer = null; timelinePlayback = false;
  $('#play').textContent = '▶ Play timeline';
  releaseCoreInputs();
}
function go(index) { selected = Math.max(0, Math.min(999999, Math.floor(Number(index) || 0))); ensureFrame(selected); render(); }
function selectTimelineFrame(index) {
  stop();
  if (getGameManager() && !gamePaused) setEmulatorPaused(true);
  go(index);
  if (!getGameManager()) return;
  if (restoreCoreState(selected)) {
    toast('Game and timeline moved to frame ' + selected + '.');
  } else {
    toast('Frame selected, but no game-state snapshot exists for this frame. Play from an earlier frame to build rewind history.');
  }
}
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
  const cells = $('#cells'); cells.style.setProperty('--cell', (28 + Number($('#zoom').value)*10) + 'px'); cells.innerHTML = '';
  $('#timelineX').textContent = frame.stickX;
  $('#timelineY').textContent = frame.stickY;
  const knob = $('#timelineKnob');
  knob.style.left = (50 + frame.stickX / 127 * 38) + '%';
  knob.style.top = (50 - frame.stickY / 127 * 38) + '%';
  $('#timelineStick').setAttribute('aria-valuenow', String(frame.stickX));
  $('#timelineStick').setAttribute('aria-valuetext', 'X ' + frame.stickX + ', Y ' + frame.stickY);
  const start = Math.max(0, selected - 14);
  const end = Math.min(Math.max(project.frames.length - 1, selected + 18), start + 180);
  const trackButtons = ['A','B','Z','L','R','Start','↑','↓','←','→','C↑','C↓','C←','C→'];
  const header = document.createElement('div');
  header.className = 'timeline-track-row timeline-track-header';
  const frameHead = document.createElement('span'); frameHead.textContent = 'FRAME'; header.append(frameHead);
  trackButtons.forEach(name => { const label = document.createElement('span'); label.textContent = name; label.title = name; header.append(label); });
  const stickHead = document.createElement('span'); stickHead.textContent = 'STICK X/Y'; header.append(stickHead);
  cells.append(header);
  for (let index = start; index <= end; index++) {
    const item = project.frames.find(frame => frame.frame === index) || createFrame(index);
    const hasInput = item.buttons.length || item.stickX || item.stickY;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cell timeline-track-row' + (index === selected ? ' selected' : '') + (hasInput ? ' filled' : '');
    const frameNumber = document.createElement('span');
    frameNumber.className = 'timeline-frame-number';
    frameNumber.textContent = String(index).padStart(6, '0');
    row.append(frameNumber);
    trackButtons.forEach(name => {
      const mark = document.createElement('span');
      mark.className = 'timeline-button-mark' + (item.buttons.includes(name) ? ' pressed' : '');
      mark.textContent = item.buttons.includes(name) ? '●' : '·';
      mark.title = name + (item.buttons.includes(name) ? ' pressed' : ' not pressed');
      row.append(mark);
    });
    const analog = document.createElement('span');
    analog.className = 'timeline-analog' + ((item.stickX || item.stickY) ? ' has-stick' : '');
    analog.textContent = item.stickX + ' / ' + item.stickY;
    row.append(analog);
    row.title = 'Frame ' + index + ' · Buttons: ' + (item.buttons.join(', ') || 'none') + ' · Stick X ' + item.stickX + ', Y ' + item.stickY;
    row.setAttribute('aria-label', 'Frame ' + index + '. Buttons: ' + (item.buttons.join(', ') || 'none') + '. Stick X ' + item.stickX + ', Y ' + item.stickY);
    row.onclick = () => selectTimelineFrame(index);
    cells.append(row);
  }
}
function toggle(buttonName) {
  const frame = ensureFrame(selected);
  frame.buttons = frame.buttons.includes(buttonName) ? frame.buttons.filter(item => item !== buttonName) : [...frame.buttons, buttonName];
  project.updatedAt = new Date().toISOString(); render(); if (timer) applyFrameToCore(frame);
}
document.querySelectorAll('[data-b]').forEach(button => button.addEventListener('click', () => toggle(button.dataset.b)));
function setStick(x, y) {
  const frame = ensureFrame(selected);
  frame.stickX = Math.max(-128, Math.min(127, Math.round(x)));
  frame.stickY = Math.max(-128, Math.min(127, Math.round(y)));
  project.updatedAt = new Date().toISOString();
  render();
  if (timelinePlayback) applyFrameToCore(frame);
}
$('#x').addEventListener('change', event => { setStick(Number(event.target.value) || 0, ensureFrame(selected).stickY); });
$('#y').addEventListener('change', event => { setStick(ensureFrame(selected).stickX, Number(event.target.value) || 0); });
const timelineStick = $('#timelineStick');
let draggingStick = false;
function updateStickFromPointer(event) {
  const rect = timelineStick.getBoundingClientRect();
  const radius = Math.min(rect.width, rect.height) * 0.38;
  const dx = Math.max(-radius, Math.min(radius, event.clientX - (rect.left + rect.width / 2)));
  const dy = Math.max(-radius, Math.min(radius, event.clientY - (rect.top + rect.height / 2)));
  setStick(dx / radius * 127, -dy / radius * 127);
}
timelineStick.addEventListener('pointerdown', event => {
  draggingStick = true;
  timelineStick.setPointerCapture(event.pointerId);
  updateStickFromPointer(event);
});
timelineStick.addEventListener('pointermove', event => { if (draggingStick) updateStickFromPointer(event); });
timelineStick.addEventListener('pointerup', () => { draggingStick = false; });
timelineStick.addEventListener('pointercancel', () => { draggingStick = false; });
timelineStick.addEventListener('keydown', event => {
  const frame = ensureFrame(selected);
  const step = event.shiftKey ? 32 : 16;
  let x = frame.stickX, y = frame.stickY;
  if (event.key === 'ArrowLeft') x -= step;
  else if (event.key === 'ArrowRight') x += step;
  else if (event.key === 'ArrowUp') y += step;
  else if (event.key === 'ArrowDown') y -= step;
  else if (event.key === 'Home') { x = 0; y = 0; }
  else return;
  event.preventDefault(); setStick(x, y);
});
$('#stickCenter').addEventListener('click', () => setStick(0, 0));
$('#name').addEventListener('input', event => { project.name = event.target.value.slice(0,80); project.updatedAt = new Date().toISOString(); });
$('#jump').addEventListener('change', event => go(event.target.value));
$('#zoom').addEventListener('input', render);
$('#prev').addEventListener('click', () => {
  stop();
  if (!gamePaused) setEmulatorPaused(true);
  const target = Math.max(0, selected - 1);
  go(target);
  if (restoreCoreState(target)) {
    toast('Restored game state and game save data for this frame.');
  } else {
    toast('No rewind snapshot for this frame yet. Play from this point first.');
  }
});
$('#next').addEventListener('click', () => {
  const target = selected + 1;
  stop();
  if (!gamePaused && getGameManager()) setEmulatorPaused(true);
  go(target);
  if (!restoreCoreState(target)) toast('No saved game state for frame ' + target + '. Play from an earlier frame first.');
});
$('#reset').addEventListener('click', () => {
  stop();
  const manager = getGameManager();
  if (manager && typeof manager.restart === 'function') {
    try {
      manager.restart();
      rewindHistory.clear();
      lastCoreFrame = null;
      coreFrameOrigin = null;
      gamePaused = false;
      setEmulatorPaused(true);
      go(0);
      toast('Game and timeline reset to frame 0.');
      return;
    } catch (error) { console.warn('Game restart failed:', error); }
  }
  go(0);
  toast('Timeline reset only; this EmulatorJS core does not expose restart.');
});
$('#play').addEventListener('click', () => {
  const manager = getGameManager();
  if (!manager) {
    toast('Start the N64 game first.');
    return;
  }
  if (timelinePlayback || !gamePaused) {
    stop();
    if (!gamePaused) setEmulatorPaused(true);
    $('#play').textContent = '▶ Play';
    return;
  }
  if (typeof manager.getFrameNum !== 'function') {
    toast('The emulator core is still starting.');
    return;
  }
  try {
    lastCoreFrame = manager.getFrameNum();
    coreFrameOrigin = lastCoreFrame - selected;
  } catch {}
  timelinePlayback = true;
  $('#play').textContent = 'Ⅱ Pause';
  if (gamePaused) setEmulatorPaused(false);
});
$('#add').addEventListener('click', () => go(Math.max(...project.frames.map(item => item.frame), 0)+1));
$('#add60').addEventListener('click', () => go(Math.max(...project.frames.map(item => item.frame), 0)+60));
$('#clear').addEventListener('click', () => { const frame = ensureFrame(selected); frame.buttons = []; frame.stickX = 0; frame.stickY = 0; render(); if (timer) applyFrameToCore(frame); });
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
  player.srcdoc = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#game{margin:0;width:100%;height:100%;background:#05070b;overflow:hidden}#game{width:100%;height:100%}.ejs_virtualGamepad_parent,.ejs_virtualGamepad_top,.ejs_virtualGamepad_bottom,.ejs_virtualGamepad_left,.ejs_virtualGamepad_right{display:none!important;visibility:hidden!important;pointer-events:none!important}</style></head><body><div id="game"></div><script>window.EJS_player='#game';window.EJS_core='n64';window.EJS_gameUrl=${JSON.stringify(romObjectUrl)};window.EJS_pathtodata='https://cdn.emulatorjs.org/stable/data/';window.EJS_startOnLoaded=true;window.EJS_gameName=${JSON.stringify(gameName)};window.EJS_language='en-US';window.EJS_VirtualGamepadSettings=[];window.EJS_disableLocalStorage=true;window.EJS_hideSettings=['shader','fps','rewind','rewind-enabled','video-filter','video-filter-options'];window.EJS_Buttons={playPause:false,restart:false,mute:true,unmute:true,settings:false,fullscreen:true,enterFullscreen:true,exitFullscreen:true,saveState:false,loadState:false,screenRecord:false,gamepad:false,cheat:false,volume:true,saveSavFiles:false,loadSavFiles:false,quickSave:false,quickLoad:false,screenshot:false,cacheManager:false,exitEmulation:false};</script><script src="https://cdn.emulatorjs.org/stable/data/loader.js"></script></body></html>`;
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
  player.addEventListener('load', () => startCoreMonitor(), { once: true });
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
