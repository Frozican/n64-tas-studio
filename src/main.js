import './style.css';
import { BUTTONS, createFrame, createProject, normalizeProject } from './tas/project.js';
import { N64WasmCore } from './emulator/n64wasm.js';

let project = createProject();
let selected = 0;
let timer = null;
let selectedRom = null;
let emulatorStarted = false;
let core = null;
const checkpoints = new Map();
const CHECKPOINT_INTERVAL = 60;
const MAX_CHECKPOINTS = 24;
const $ = selector => document.querySelector(selector);

$('#app').innerHTML = `
<header><div class="brand"><span class="logo">64</span><span>N64 <b>TAS STUDIO</b></span></div><div class="actions"><span class="status" id="coreStatus">● CORE NOT LOADED</span><button id="open">Open project</button><button class="primary" id="export">Export TAS</button><input hidden id="projectFile" type="file" accept=".json,.n64tas"></div></header>
<main>
<section class="hero"><div><small>FRAME-BY-FRAME WORKBENCH</small><h1>Make every frame <em>count.</em></h1><p>Plan controller inputs, edit a timeline and build reproducible N64 TAS projects.</p></div><label class="rom"><input hidden id="romFile" type="file" accept=".z64,.n64,.v64"><b>＋ Choose your own N64 ROM</b><span id="romName">.z64 · .n64 · .v64 · selected locally only</span></label></section>
<div class="notice warning"><b>!</b><div><strong>Experimental N64 core — frame stepping enabled</strong><p>The emulator is now driven one core frame at a time. Timeline playback and frame advance use the same stepping path. Game compatibility and repeatability still need testing with individual ROMs before treating a run as verified.</p></div></div>
<section class="workspace">
<article class="panel"><div class="heading">GAME VIEW <span id="gameStatus">WAITING FOR ROM</span></div><div class="screen emulatorScreen"><div id="emulatorPlayer"></div><div id="emptyScreen"><div class="screenlogo">N<span>64</span></div><h2>Load your own ROM</h2><p>Choose a ROM above, then start the emulator.</p><button id="startEmulator" class="primary">▶ Start N64 emulator</button><small>N64WASM · MANUAL CORE STEPPING</small></div></div><div class="transport"><button id="reset">↺ Reset</button><button id="prev" class="step-button" title="Restore the previous frame">◀ −1</button><button class="primary play" id="play">▶ Run game</button><button id="next" class="step-button" title="Advance exactly one N64 frame">+1 ▶</button><div class="frameNo"><small>SELECTED FRAME</small><b id="frameNo">000000</b></div></div></article>
<article class="panel"><div class="heading">CONTROLLER 1 <span id="frameLabel">FRAME 0</span></div><div class="controller"><div class="dpad"><button data-b="↑">↑</button><button data-b="←">←</button><button data-b="→">→</button><button data-b="↓">↓</button></div><div class="stick"><div>●</div><small>ANALOG STICK</small><label>X <input id="x" type="number" min="-128" max="127" value="0"></label><label>Y <input id="y" type="number" min="-128" max="127" value="0"></label></div><div class="face"><button data-b="C↑">C↑</button><button data-b="C←">C←</button><button data-b="C→">C→</button><button data-b="C↓">C↓</button><button data-b="A">A</button><button data-b="B">B</button></div></div><div class="shoulders"><button data-b="L">L</button><button data-b="Z">Z</button><button data-b="R">R</button><button data-b="Start">START</button></div><div class="footnote">Tap buttons to toggle input <button id="clear">Clear frame</button></div></article>
</section>
<section class="panel timeline"><div class="heading">INPUT TIMELINE <span id="count">1 FRAME</span><div><button id="add60">+ 60 frames</button><button id="add">+ Frame</button></div></div><div class="timeline-joystick"><div><strong>ANALOG STICK</strong><small>Drag the stick to set X/Y for the selected frame</small></div><div id="timelineStick" class="timeline-stick" role="slider" aria-label="Analog stick direction" aria-valuemin="-128" aria-valuemax="127" tabindex="0"><div class="stick-cross horizontal"></div><div class="stick-cross vertical"></div><div id="timelineKnob" class="timeline-knob"></div></div><div class="stick-values"><span>X <b id="timelineX">0</b></span><span>Y <b id="timelineY">0</b></span><button id="stickCenter">Center</button></div></div><div class="timeline-tools"><label>Go to frame <input id="jump" type="number" min="0" value="0"></label><span>Select a cell to edit its input</span><label>Zoom <input id="zoom" type="range" min="1" max="4" value="2"></label></div><div id="cells" class="cells"></div></section>
<section class="lower"><article class="panel"><div class="heading">PROJECT <span>LOCAL</span></div><label class="projectName">Project name<input id="name" value="Untitled N64 TAS" maxlength="80"></label><div class="stats"><div><small>TOTAL FRAMES</small><b id="total">1</b></div><div><small>INPUT FRAMES</small><b id="inputs">0</b></div><div><small>TIME @ 60 FPS</small><b id="duration">00:00.0</b></div></div><p class="hint">Project stays in this browser until exported. ROM bytes are not uploaded.</p></article><article class="panel"><div class="heading">DEVELOPMENT STATUS <span>PHASE 1</span></div><div class="roadmap"><p>✓ <b>Responsive TAS UI</b><small>Timeline and controller input prototype</small></p><p>✓ <b>Project JSON</b><small>Import and export</small></p><p>✓ <b>Experimental N64 runtime</b><small>Self-hosted WebAssembly core</small></p><p>2 <b>True frame advance</b><small>Needs core-level stepping and input injection</small></p><p>3 <b>Determinism validation</b><small>Required before frame-perfect claims</small></p></div></article></section>
<footer>N64 TAS STUDIO · EARLY PROTOTYPE <span>No ROMs included. Use legally obtained game files.</span></footer>
</main><div id="toast" role="status" aria-live="polite"></div>`;


// One synchronous call to the core advances exactly one N64 video frame.
function invalidateCheckpointsAfter(frame) {
  for (const key of [...checkpoints.keys()]) if (key > frame) checkpoints.delete(key);
}
function saveCheckpoint(frame) {
  if (!core?.ready || frame % CHECKPOINT_INTERVAL !== 0) return;
  try {
    const state = core.saveState();
    if (state) {
      checkpoints.set(frame, state);
      while (checkpoints.size > MAX_CHECKPOINTS) {
        const keys = [...checkpoints.keys()].filter(key => key !== 0).sort((x,y) => x-y);
        if (!keys.length) break;
        checkpoints.delete(keys[0]);
      }
    }
  } catch (error) { console.warn('Could not save TAS checkpoint:', error); }
}
function stop() {
  if (timer !== null) cancelAnimationFrame(timer);
  timer = null;
  $('#play').textContent = '▶ Run game';
}
function go(index) {
  const target = Math.max(0, Math.min(999999, Math.floor(Number(index) || 0)));
  if (core?.ready) { void seekCoreTo(target); return; }
  selected = target;
  ensureFrame(selected);
  render();
}
function stepCoreFrame(shouldRender = true) {
  if (!core?.ready) { toast('Start the N64 core before advancing the live game.'); return false; }
  try {
    core.step(ensureFrame(selected));
    selected += 1;
    ensureFrame(selected);
    saveCheckpoint(selected);
    if (shouldRender) render();
    return true;
  } catch (error) {
    stop();
    console.error('N64 frame step failed:', error);
    toast('The N64 core could not complete this frame: ' + (error.message || 'unknown error'));
    return false;
  }
}
async function seekCoreTo(target) {
  stop();
  const destination = Math.max(0, Math.min(999999, Math.floor(Number(target) || 0)));
  if (!core?.ready) { selected = destination; ensureFrame(selected); render(); return; }
  try {
    const available = [...checkpoints.keys()].filter(frame => frame <= destination).sort((x,y) => y-x);
    const checkpointFrame = available.length ? available[0] : 0;
    const checkpoint = checkpoints.get(checkpointFrame) || core.initialState;
    if (!checkpoint) throw new Error('No initial savestate is available.');
    core.loadState(checkpoint, checkpointFrame);
    selected = checkpointFrame;
    while (selected < destination) {
      core.step(ensureFrame(selected));
      selected += 1;
      saveCheckpoint(selected);
    }
    ensureFrame(selected);
    render();
  } catch (error) {
    console.error('N64 seek failed:', error);
    toast('Could not seek the live game: ' + (error.message || 'unknown error'));
  }
}
function selectTimelineFrame(index) { void seekCoreTo(index); }
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
  invalidateCheckpointsAfter(selected);
  frame.buttons = frame.buttons.includes(buttonName) ? frame.buttons.filter(item => item !== buttonName) : [...frame.buttons, buttonName];
  project.updatedAt = new Date().toISOString(); render();
}
document.querySelectorAll('[data-b]').forEach(button => button.addEventListener('click', () => toggle(button.dataset.b)));
function setStick(x, y) {
  const frame = ensureFrame(selected);
  invalidateCheckpointsAfter(selected);
  frame.stickX = Math.max(-128, Math.min(127, Math.round(x)));
  frame.stickY = Math.max(-128, Math.min(127, Math.round(y)));
  project.updatedAt = new Date().toISOString();
  render();
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
$('#jump').addEventListener('change', event => selectTimelineFrame(Number(event.target.value)));
$('#zoom').addEventListener('input', render);
$('#prev').addEventListener('click', () => {
  stop();
  if (core?.ready) void seekCoreTo(Math.max(0, selected - 1));
  else go(Math.max(0, selected - 1));
});
$('#next').addEventListener('click', () => {
  stop();
  if (core?.ready) stepCoreFrame(true);
  else { go(selected + 1); toast('Editor cursor moved. Start the N64 core to advance the actual game.'); }
});
$('#reset').addEventListener('click', () => {
  stop();
  if (core?.ready) {
    try {
      core.restoreInitial();
      selected = 0;
      checkpoints.clear();
      if (core.initialState) checkpoints.set(0, core.initialState);
      ensureFrame(0); render();
      toast('Game and timeline reset to the initial boot state.');
    } catch (error) { toast('Reset failed: ' + (error.message || 'unknown error')); }
  } else {
    selected = 0; ensureFrame(0); render();
    toast('Timeline reset. Load a ROM and start the N64 core.');
  }
});
$('#play').addEventListener('click', () => {
  if (timer !== null) { stop(); return; }
  if (!core?.ready) { toast('Load a ROM and start the N64 core before running the game.'); return; }
  $('#play').textContent = 'Ⅱ Pause';
  let previousTime = 0, accumulator = 0;
  const frameDuration = 1000 / 60;
  const tick = timestamp => {
    if (timer === null) return;
    if (!previousTime) previousTime = timestamp;
    accumulator += Math.min(250, timestamp - previousTime);
    previousTime = timestamp;
    let processed = 0;
    // Run continuously; extend the timeline with empty frames as the game advances.
    while (accumulator >= frameDuration && selected < 10000 && processed < 5) {
      if (!stepCoreFrame(false)) return;
      accumulator -= frameDuration; processed += 1;
    }
    if (selected >= 10000) { stop(); toast('Timeline reached the 10,000-frame safety limit.'); render(); return; }
    if (processed) render();
    timer = requestAnimationFrame(tick);
  };
  timer = requestAnimationFrame(tick);
});
$('#add').addEventListener('click', () => go(Math.max(...project.frames.map(item => item.frame), 0)+1));
$('#add60').addEventListener('click', () => go(Math.max(...project.frames.map(item => item.frame), 0)+60));
$('#clear').addEventListener('click', () => { const frame = ensureFrame(selected); invalidateCheckpointsAfter(selected); frame.buttons = []; frame.stickX = 0; frame.stickY = 0; render(); });
$('#romFile').addEventListener('change', event => {
  const file = event.target.files?.[0]; if (!file) return;
  if (core?.ready) { toast('Reload the page before selecting a different ROM.'); event.target.value = ''; return; }
  selectedRom = file;
  project.romName = file.name;
  $('#romName').textContent = file.name + ' — selected locally';
  $('#gameStatus').textContent = 'ROM READY';
  toast('ROM ready. Tap Start N64 emulator.');
});
$('#startEmulator').addEventListener('click', async () => {
  if (!selectedRom) { $('#romFile').click(); toast('Choose a ROM file first.'); return; }
  if (core?.ready) { toast('The N64 core is already running.'); return; }
  const button = $('#startEmulator');
  button.disabled = true; button.textContent = 'Loading N64 core…';
  $('#coreStatus').textContent = '● LOADING N64WASM';
  $('#gameStatus').textContent = 'INITIALIZING CORE';
  core = new N64WasmCore({
    root: $('#emulatorPlayer'),
    onStatus: status => { $('#coreStatus').textContent = '● ' + status.toUpperCase(); }
  });
  try {
    await core.load(selectedRom);
    emulatorStarted = true; selected = 0; checkpoints.clear();
    if (core.initialState) checkpoints.set(0, core.initialState);
    $('#emptyScreen').classList.add('hidden');
    $('#coreStatus').textContent = '● N64WASM READY';
    $('#gameStatus').textContent = 'GAME READY · FRAME 0';
    button.textContent = 'N64 core ready';
    render();
    toast('N64 core ready. Frame Advance now executes exactly one core frame.');
  } catch (error) {
    console.error('N64 core initialization failed:', error);
    core = null; $('#coreStatus').textContent = '● CORE LOAD FAILED';
    $('#gameStatus').textContent = 'CORE FAILED';
    button.disabled = false; button.textContent = 'Retry N64 core load';
    toast('Could not start N64Wasm: ' + (error.message || 'unknown error'));
  }
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
  try { project = normalizeProject(JSON.parse(await file.text())); selected = 0; checkpoints.clear(); if (core?.ready) { core.restoreInitial(); if (core.initialState) checkpoints.set(0, core.initialState); } render(); toast('Project imported.'); }
  catch (error) { toast(error.message || 'Could not open project.'); }
  event.target.value = '';
});
render();
