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
const visualDuplicateFrames = new Map();
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
<article class="panel"><div class="heading">CONTROLLER 1 <span id="frameLabel">FRAME 0</span></div><div class="controller"><div class="dpad"><button data-b="↑">↑</button><button data-b="←">←</button><button data-b="→">→</button><button data-b="↓">↓</button></div><div class="face"><button data-b="C↑">C↑</button><button data-b="C←">C←</button><button data-b="C→">C→</button><button data-b="C↓">C↓</button><button data-b="A">A</button><button data-b="B">B</button></div></div><div class="shoulders"><button data-b="L">L</button><button data-b="Z">Z</button><button data-b="R">R</button><button data-b="Start">START</button></div><div class="footnote">Tap buttons to toggle input <button id="clear">Clear frame</button></div></article>
</section>
<section class="panel timeline"><div class="heading">INPUT TIMELINE <span id="count">1 FRAME</span><div><button id="add60">+ 60 frames</button><button id="add">+ Frame</button></div></div><div class="timeline-joystick"><div><strong>ANALOG STICK</strong><small>Drag the stick to set X/Y for the selected frame</small></div><div id="timelineStick" class="timeline-stick" role="slider" aria-label="Analog stick direction" aria-valuemin="-128" aria-valuemax="127" tabindex="0"><div class="stick-cross horizontal"></div><div class="stick-cross vertical"></div><div id="timelineKnob" class="timeline-knob"></div></div><div class="stick-values"><span class="axis-value">X <b id="timelineX">0</b><label class="same-axis"><input id="xSame" type="checkbox"> Same as before</label></span><span class="axis-value">Y <b id="timelineY">0</b><label class="same-axis"><input id="ySame" type="checkbox"> Same as before</label></span><button id="stickCenter">Center</button></div></div><div class="timeline-tools"><label>Go to frame <input id="jump" type="number" min="0" value="0"></label><span id="timelineHint">Unchanged rendered frames are hidden</span><label class="show-unchanged"><input id="showUnchanged" type="checkbox"> Show unchanged frames</label><label>Zoom <input id="zoom" type="range" min="1" max="4" value="2"></label></div><div id="cells" class="cells"></div></section>
<section class="lower"><article class="panel"><div class="heading">PROJECT <span>LOCAL</span></div><label class="projectName">Project name<input id="name" value="Untitled N64 TAS" maxlength="80"></label><div class="stats"><div><small>TOTAL FRAMES</small><b id="total">1</b></div><div><small>INPUT FRAMES</small><b id="inputs">0</b></div><div><small>TIME @ 60 FPS</small><b id="duration">00:00.0</b></div></div><p class="hint">Project stays in this browser until exported. ROM bytes are not uploaded.</p></article><article class="panel"><div class="heading">DEVELOPMENT STATUS <span>PHASE 1</span></div><div class="roadmap"><p>✓ <b>Responsive TAS UI</b><small>Timeline and controller input prototype</small></p><p>✓ <b>Project JSON</b><small>Import and export</small></p><p>✓ <b>Experimental N64 runtime</b><small>Self-hosted WebAssembly core</small></p><p>2 <b>True frame advance</b><small>Needs core-level stepping and input injection</small></p><p>3 <b>Determinism validation</b><small>Required before frame-perfect claims</small></p></div></article></section>
<section class="panel recorder-panel">
<div class="heading">RECORDING <span>AVI · MJPEG</span></div>
<div class="recording-controls">
<div class="recording-field"><label for="recordFrom">From</label><input id="recordFrom" type="text" inputmode="numeric" maxlength="6" enterkeyhint="done" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="First frame to record" value="0"></div>
<div class="recording-field"><label for="recordTo">To</label><input id="recordTo" type="text" inputmode="numeric" maxlength="6" enterkeyhint="done" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Last frame to record" value="300"></div>
<button id="recordButton" class="primary">● Record range</button>
</div>
<div class="recording-progress"><div class="recording-progress-track"><div id="recordProgressBar"></div></div><span id="recordProgress">Choose a frame range to export as an AVI video.</span></div>
<p class="hint">The selected range is exported as Motion-JPEG AVI at 60 FPS with captured 44.1 kHz stereo PCM audio. The game view does not need to be watched.</p>
</section>
<footer>N64 TAS STUDIO · EARLY PROTOTYPE <span>No ROMs included. Use legally obtained game files.</span></footer>
</main><div id="toast" role="status" aria-live="polite"></div>`;


// One synchronous call to the core advances exactly one N64 video frame.
function invalidateCheckpointsAfter(frame) {
  for (const key of [...checkpoints.keys()]) if (key > frame) checkpoints.delete(key);
}
function effectiveAxis(frameIndex, axis) {
  let index = frameIndex;
  while (index > 0) {
    const frame = ensureFrame(index);
    if (!frame[`stick${axis}Same`]) return frame[`stick${axis}`];
    index -= 1;
  }
  return 0;
}
function resolvedFrame(frameIndex) {
  const frame = ensureFrame(frameIndex);
  return { ...frame, stickX: effectiveAxis(frameIndex, 'X'), stickY: effectiveAxis(frameIndex, 'Y') };
}
function invalidateVisualFramesAfter(frame) {
  for (const key of [...visualDuplicateFrames.keys()]) if (key > frame) visualDuplicateFrames.delete(key);
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
    const visualChanged = core.step(resolvedFrame(selected));
    visualDuplicateFrames.set(selected + 1, visualChanged === false);
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
      const visualChanged = core.step(resolvedFrame(selected));
      visualDuplicateFrames.set(selected + 1, visualChanged === false);
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
  $('#jump').value = selected; $('#xSame').checked = !!frame.stickXSame; $('#ySame').checked = !!frame.stickYSame; $('#name').value = project.name;
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
  const effectiveX = effectiveAxis(selected, 'X'), effectiveY = effectiveAxis(selected, 'Y');
  $('#timelineX').textContent = effectiveX;
  $('#timelineY').textContent = effectiveY;
  const knob = $('#timelineKnob');
  knob.style.left = (50 + effectiveX / 127 * 38) + '%';
  knob.style.top = (50 - effectiveY / 127 * 38) + '%';
  $('#timelineStick').setAttribute('aria-valuenow', String(effectiveX));
  $('#timelineStick').setAttribute('aria-valuetext', 'X ' + effectiveX + ', Y ' + effectiveY);
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
    if (!$('#showUnchanged').checked && visualDuplicateFrames.get(index) === true && index !== selected) continue;
    const item = project.frames.find(frame => frame.frame === index) || createFrame(index);
    const hasInput = item.buttons.length || item.stickX || item.stickY;
    const row = document.createElement('div');
    row.className = 'cell timeline-track-row' + (index === selected ? ' selected' : '') + (hasInput ? ' filled' : '');
    row.setAttribute('role', 'group');
    const frameNumber = document.createElement('button');
    frameNumber.type = 'button';
    frameNumber.className = 'timeline-frame-number';
    frameNumber.title = 'Select frame ' + index;
    frameNumber.onclick = () => selectTimelineFrame(index);
    frameNumber.className = 'timeline-frame-number';
    frameNumber.textContent = String(index).padStart(6, '0');
    row.append(frameNumber);
    trackButtons.forEach(name => {
      const mark = document.createElement('button');
      mark.type = 'button';
      mark.className = 'timeline-button-mark' + (item.buttons.includes(name) ? ' pressed' : '');
      mark.textContent = item.buttons.includes(name) ? '●' : '·';
      mark.title = 'Toggle ' + name + ' on frame ' + index;
      mark.setAttribute('aria-label', 'Toggle ' + name + ' on frame ' + index);
      mark.setAttribute('aria-pressed', String(item.buttons.includes(name)));
      mark.onclick = event => { event.stopPropagation(); void editTimelineButton(index, name); };
      row.append(mark);
    });
    const analog = document.createElement('span');
    analog.className = 'timeline-analog' + ((item.stickX || item.stickY) ? ' has-stick' : '');
    analog.textContent = effectiveAxis(index, 'X') + ' / ' + effectiveAxis(index, 'Y') + (item.stickXSame || item.stickYSame ? ' ↳' : '');
    row.append(analog);
    row.title = 'Frame ' + index + ' · Buttons: ' + (item.buttons.join(', ') || 'none') + ' · Stick X ' + effectiveAxis(index, 'X') + ', Y ' + effectiveAxis(index, 'Y');
    row.setAttribute('aria-label', 'Frame ' + index + '. Buttons: ' + (item.buttons.join(', ') || 'none') + '. Stick X ' + effectiveAxis(index, 'X') + ', Y ' + effectiveAxis(index, 'Y'));
    row.onclick = () => selectTimelineFrame(index);
    cells.append(row);
  }
}
async function editTimelineButton(frameIndex, buttonName) {
  stop();
  const resumeFrame = Math.max(selected, frameIndex + 1);
  const frame = ensureFrame(frameIndex);
  frame.buttons = frame.buttons.includes(buttonName)
    ? frame.buttons.filter(item => item !== buttonName)
    : [...frame.buttons, buttonName];
  project.updatedAt = new Date().toISOString();

  if (!core?.ready) {
    selected = frameIndex;
    render();
    toast(buttonName + ' updated on frame ' + frameIndex + '.');
    return;
  }

  // A late input edit rewinds three frames, then deterministically replays
  // through the previous playhead so the changed input reaches the live core.
  const rewindFrame = Math.max(0, frameIndex - 3);
  invalidateCheckpointsAfter(rewindFrame);
  invalidateVisualFramesAfter(rewindFrame);
  try {
    await seekCoreTo(rewindFrame);
    while (selected < resumeFrame) {
      if (!stepCoreFrame(false)) throw new Error('Could not replay frame ' + selected + '.');
    }
    render();
    toast(buttonName + ' applied on frame ' + frameIndex + ' (3-frame rollback).');
  } catch (error) {
    stop();
    console.error('Timeline input rollback failed:', error);
    toast('Input saved, but replay failed: ' + (error.message || 'unknown error'));
  }
}
function toggle(buttonName) {
  const frame = ensureFrame(selected);
  invalidateCheckpointsAfter(selected);
  invalidateVisualFramesAfter(selected);
  frame.buttons = frame.buttons.includes(buttonName) ? frame.buttons.filter(item => item !== buttonName) : [...frame.buttons, buttonName];
  project.updatedAt = new Date().toISOString(); render();
}
document.querySelectorAll('[data-b]').forEach(button => button.addEventListener('click', () => toggle(button.dataset.b)));
function setStick(x, y, explicitAxes = ['X', 'Y']) {
  const frame = ensureFrame(selected);
  invalidateCheckpointsAfter(selected);
  invalidateVisualFramesAfter(selected);
  if (explicitAxes.includes('X')) { frame.stickX = Math.max(-128, Math.min(127, Math.round(x))); frame.stickXSame = false; }
  if (explicitAxes.includes('Y')) { frame.stickY = Math.max(-128, Math.min(127, Math.round(y))); frame.stickYSame = false; }
  project.updatedAt = new Date().toISOString();
  render();
}
function setAxisSame(axis, same) {
  const frame = ensureFrame(selected);
  invalidateCheckpointsAfter(selected);
  invalidateVisualFramesAfter(selected);
  const key = axis === 'X' ? 'stickXSame' : 'stickYSame';
  const valueKey = axis === 'X' ? 'stickX' : 'stickY';
  if (!same) frame[valueKey] = effectiveAxis(selected, axis);
  frame[key] = same;
  project.updatedAt = new Date().toISOString();
  render();
}
$('#xSame').addEventListener('change', event => setAxisSame('X', event.target.checked));
$('#ySame').addEventListener('change', event => setAxisSame('Y', event.target.checked));
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
$('#showUnchanged').addEventListener('change', render);
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
      core.reset();
      selected = 0;
      checkpoints.clear();
      visualDuplicateFrames.clear();
      if (core.initialState) checkpoints.set(0, core.initialState);
      ensureFrame(0); render();
      toast('Game reset to its initial state. TAS inputs were kept.');
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
$('#clear').addEventListener('click', () => { const frame = ensureFrame(selected); invalidateCheckpointsAfter(selected); invalidateVisualFramesAfter(selected); frame.buttons = []; frame.stickX = 0; frame.stickY = 0; frame.stickXSame = false; frame.stickYSame = false; render(); });
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
    emulatorStarted = true; selected = 0; checkpoints.clear(); visualDuplicateFrames.clear();
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
let recording = false;
function aviFourCC(view, offset, value) {
  for (let i = 0; i < 4; i++) view.setUint8(offset + i, value.charCodeAt(i));
}
function aviChunk(id, data) {
  const out = new Uint8Array(8 + data.length + (data.length & 1));
  const view = new DataView(out.buffer);
  aviFourCC(view, 0, id); view.setUint32(4, data.length, true); out.set(data, 8);
  return out;
}
function aviList(type, children) {
  const size = 4 + children.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(8 + size + (size & 1));
  const view = new DataView(out.buffer);
  aviFourCC(view, 0, 'LIST'); view.setUint32(4, size, true); aviFourCC(view, 8, type);
  let offset = 12;
  for (const item of children) { out.set(item, offset); offset += item.length; }
  return out;
}
function buildMjpegAvi(frames, width, height, audioSamples) {
  const maxVideoSize = frames.reduce((max, frame) => Math.max(max, frame.length), 0);
  const audioBytes = audioSamples.byteLength;
  const avih = new Uint8Array(56), av = new DataView(avih.buffer);
  av.setUint32(0, 1000000 / 60, true); av.setUint32(4, Math.max(maxVideoSize * 60, 176400), true);
  av.setUint32(12, 0x10, true); av.setUint32(16, frames.length, true);
  av.setUint32(24, 2, true); av.setUint32(28, Math.max(maxVideoSize, audioBytes), true);
  av.setUint32(32, width, true); av.setUint32(36, height, true);
  const videoHeader = new Uint8Array(56), vh = new DataView(videoHeader.buffer);
  aviFourCC(vh, 0, 'vids'); aviFourCC(vh, 4, 'MJPG');
  vh.setUint32(20, 1, true); vh.setUint32(24, 60, true);
  vh.setUint32(32, frames.length, true); vh.setUint32(36, maxVideoSize, true);
  vh.setInt16(48, 0, true); vh.setInt16(50, 0, true);
  vh.setInt16(52, Math.min(width, 32767), true); vh.setInt16(54, Math.min(height, 32767), true);
  const videoFormat = new Uint8Array(40), vf = new DataView(videoFormat.buffer);
  vf.setUint32(0, 40, true); vf.setInt32(4, width, true); vf.setInt32(8, height, true);
  vf.setUint16(12, 1, true); vf.setUint16(14, 24, true); aviFourCC(vf, 16, 'MJPG');
  vf.setUint32(20, maxVideoSize, true);
  const audioHeader = new Uint8Array(56), ah = new DataView(audioHeader.buffer);
  aviFourCC(ah, 0, 'auds');
  ah.setUint32(20, 4, true); ah.setUint32(24, 176400, true);
  ah.setUint32(32, audioSamples.length / 2, true); ah.setUint32(36, audioBytes, true);
  ah.setUint32(44, 4, true); ah.setUint32(48, 4, true);
  const audioFormat = new Uint8Array(16), af = new DataView(audioFormat.buffer);
  af.setUint16(0, 1, true); af.setUint16(2, 2, true); af.setUint32(4, 44100, true);
  af.setUint32(8, 176400, true); af.setUint16(12, 4, true); af.setUint16(14, 16, true);
  const header = aviList('hdrl', [
    aviChunk('avih', avih),
    aviList('strl', [aviChunk('strh', videoHeader), aviChunk('strf', videoFormat)]),
    aviList('strl', [aviChunk('strh', audioHeader), aviChunk('strf', audioFormat)])
  ]);
  const moviChunks = [], index = [];
  let moviOffset = 0;
  const addIndexedChunk = (id, data, flags) => {
    const item = aviChunk(id, data);
    index.push({ id, offset: moviOffset, size: data.length, flags });
    moviChunks.push(item); moviOffset += item.length;
  };
  for (const frame of frames) addIndexedChunk('00dc', frame, 0x10);
  if (audioBytes) addIndexedChunk('01wb', new Uint8Array(audioSamples.buffer, audioSamples.byteOffset, audioSamples.byteLength), 0);
  const movi = aviList('movi', moviChunks);
  const idx = new Uint8Array(index.length * 16), iv = new DataView(idx.buffer);
  index.forEach((entry, i) => {
    const p = i * 16; aviFourCC(iv, p, entry.id);
    iv.setUint32(p + 4, entry.flags, true); iv.setUint32(p + 8, entry.offset, true);
    iv.setUint32(p + 12, entry.size, true);
  });
  const idxChunk = aviChunk('idx1', idx);
  const bodySize = 4 + header.length + movi.length + idxChunk.length;
  const file = new Uint8Array(8 + bodySize), fv = new DataView(file.buffer);
  aviFourCC(fv, 0, 'RIFF'); fv.setUint32(4, bodySize, true); aviFourCC(fv, 8, 'AVI ');
  let p = 12;
  for (const part of [header, movi, idxChunk]) { file.set(part, p); p += part.length; }
  return file;
}
function encodeCanvasJpeg(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob) return reject(new Error('Could not encode JPEG frame.'));
    blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)), reject);
  }, 'image/jpeg', 0.88));
}
async function recordSelectedRange() {
  if (recording) return;
  if (!core?.ready) { toast('Load a ROM and start the N64 core first.'); return; }
  const fromText = String($('#recordFrom').value).trim(), toText = String($('#recordTo').value).trim();
  if (!/^\d+$/.test(fromText) || !/^\d+$/.test(toText)) { toast('Enter a frame number in both fields.'); return; }
  const from = Number(fromText), to = Number(toText);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) { toast('Frame numbers are too large.'); return; }
  if (to < from) { toast('The To frame must be greater than or equal to From.'); return; }
  if (to - from > 18000) { toast('Please record a maximum of 18,001 frames (about 5 minutes).'); return; }
  stop(); recording = true;
  const button = $('#recordButton');
  button.disabled = true; button.textContent = 'Recording…';
  $('#recordProgressBar').style.width = '0%';
  $('#recordProgress').textContent = 'Preparing AVI video and audio capture…';
  const originalFrame = selected;
  let originalState = null;
  try {
    originalState = core.saveState();
    if (!originalState) throw new Error('Could not save the current emulator state.');
    core.setUnpaced(true);
    const candidates = [...checkpoints.keys()].filter(frame => frame <= from).sort((x, y) => y - x);
    const checkpointFrame = candidates.length ? candidates[0] : 0;
    const checkpoint = checkpoints.get(checkpointFrame) || core.initialState;
    if (!checkpoint) throw new Error('No initial savestate is available.');
    core.loadState(checkpoint, checkpointFrame);
    for (let frame = checkpointFrame; frame < from; frame++) {
      core.step(resolvedFrame(frame));
      if ((frame - checkpointFrame) % 120 === 119) await new Promise(resolve => setTimeout(resolve, 0));
    }
    core.beginPcmCapture();
    const canvas = core.Module.canvas;
    const capture = document.createElement('canvas');
    capture.width = canvas.width || 640; capture.height = canvas.height || 480;
    const context = capture.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not create video frame buffer.');
    context.drawImage(core.visualCanvas || canvas, 0, 0, capture.width, capture.height);
    const frames = [], total = to - from + 1;
    for (let frame = from; frame <= to; frame++) {
      const changed = core.step(resolvedFrame(frame));
      // Reuse the last complete image if this core step did not produce a new VI frame.
      if (changed !== false) context.drawImage(core.visualCanvas || canvas, 0, 0, capture.width, capture.height);
      frames.push(await encodeCanvasJpeg(capture));
      const done = frame - from + 1;
      if (done % 10 === 0 || done === total) {
        const percent = Math.round(done / total * 100);
        $('#recordProgressBar').style.width = percent + '%';
        $('#recordProgress').textContent = 'Building AVI ' + done + ' / ' + total + ' (' + percent + '%)';
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    const audioSamples = core.finishPcmCapture();
    const avi = buildMjpegAvi(frames, capture.width, capture.height, audioSamples);
    const blob = new Blob([avi], { type: 'video/x-msvideo' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = (project.name || 'n64-tas').replace(/[^a-z0-9-_]+/gi, '-') + '-frames-' + from + '-' + to + '.avi';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    $('#recordProgress').textContent = 'Saved ' + completedDuration(total) + ' AVI · ' + (blob.size / 1048576).toFixed(1) + ' MB · MJPEG · 60 FPS · PCM audio · 44.1 kHz stereo';
    toast('AVI video saved.');
  } catch (error) {
    console.error('TAS recording failed:', error);
    $('#recordProgress').textContent = 'Recording failed: ' + (error.message || 'unknown error');
    toast('Recording failed: ' + (error.message || 'unknown error'));
  } finally {
    core.setUnpaced(false);
    try { core.stopAudioCapture(); } catch {}
    if (originalState) {
      try { core.loadState(originalState, originalFrame); selected = originalFrame; render(); }
      catch (error) { console.error('Could not restore emulator after recording:', error); }
    }
    recording = false; button.disabled = false; button.textContent = '● Record range';
  }
}
function completedDuration(frames) {
  const seconds = frames / 60;
  return Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
}
$('#recordButton').addEventListener('click', () => { void recordSelectedRange(); });

$('#open').addEventListener('click', () => $('#projectFile').click());
$('#projectFile').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try { project = normalizeProject(JSON.parse(await file.text())); selected = 0; checkpoints.clear(); visualDuplicateFrames.clear(); if (core?.ready) { core.restoreInitial(); if (core.initialState) checkpoints.set(0, core.initialState); } render(); toast('Project imported.'); }
  catch (error) { toast(error.message || 'Could not open project.'); }
  event.target.value = '';
});
render();
