import { createProject, createFrame } from './project.js';

const BUTTON_BITS = [
  [0, 'C→'], [1, 'C←'], [2, 'C↓'], [3, 'C↑'],
  [4, 'R'], [5, 'L'],
  [8, '→'], [9, '←'], [10, '↓'], [11, '↑'],
  [12, 'Start'], [13, 'Z'], [14, 'B'], [15, 'A']
];

function readCString(bytes, start, length) {
  const slice = bytes.subarray(start, start + length);
  const end = slice.indexOf(0);
  return new TextDecoder('utf-8', { fatal: false }).decode(end < 0 ? slice : slice.subarray(0, end)).trim();
}

function signedByte(value) {
  return value > 127 ? value - 256 : value;
}

/**
 * Convert a Mupen64 movie into the N64 TAS Studio project model.
 *
 * M64 stores controller poll samples, not guaranteed one sample per VI.
 * This converter deliberately maps each stored sample to one project frame;
 * callers should disclose that timing approximation to the user.
 */
export function convertM64ToProject(buffer, fileName = 'Imported M64') {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 0x200) {
    throw new Error('The selected file is too small to contain an M64 header.');
  }

  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x4D || bytes[1] !== 0x36 || bytes[2] !== 0x34 || bytes[3] !== 0x1A) {
    throw new Error('Invalid M64 signature. Expected M64\\x1A.');
  }

  const view = new DataView(buffer);
  const version = view.getUint32(0x04, true);
  if (![1, 2, 3].includes(version)) {
    throw new Error('Unsupported M64 version ' + version + '. Supported versions: 1, 2 and 3.');
  }

  const headerSize = version <= 2 ? 0x200 : 0x400;
  if (buffer.byteLength < headerSize) throw new Error('The M64 header is incomplete.');

  const viCount = view.getUint32(0x0C, true);
  const fps = view.getUint8(0x14) || 60;
  const controllerCount = view.getUint8(0x15);
  const sampleCount = view.getUint32(0x18, true);
  const controllerFlags = view.getUint32(0x20, true);
  const availableSamples = Math.floor((buffer.byteLength - headerSize) / 4);

  if (sampleCount > availableSamples) {
    throw new Error('The M64 header declares ' + sampleCount + ' input samples, but the file contains only ' + availableSamples + '. The file may be truncated.');
  }
  if (sampleCount > 2000000) {
    throw new Error('This M64 contains more than 2,000,000 samples. Please split the movie into smaller files before converting.');
  }

  const romName = readCString(bytes, 0xC4, 32) || '';
  const cleanName = (fileName || 'Imported M64').replace(/\.m64$/i, '').trim() || 'Imported M64';
  const project = createProject(cleanName);
  project.fps = Math.max(1, Math.min(120, fps));
  project.romName = romName || null;
  project.frames = [];

  for (let index = 0; index < sampleCount; index++) {
    const word = view.getUint32(headerSize + index * 4, true);
    const buttons = BUTTON_BITS.filter(([bit]) => (word & (1 << bit)) !== 0).map(([, name]) => name);
    const stickX = signedByte((word >>> 16) & 0xFF);
    const stickY = signedByte((word >>> 24) & 0xFF);
    const frame = createFrame(index);
    frame.buttons = buttons;
    frame.stickX = stickX;
    frame.stickY = stickY;
    frame.stickXSame = false;
    frame.stickYSame = false;
    project.frames.push(frame);
  }

  if (!project.frames.length) project.frames.push(createFrame(0));
  project.updatedAt = new Date().toISOString();

  return {
    project,
    metadata: {
      version,
      viCount,
      sampleCount,
      fps: project.fps,
      controllerCount,
      controller1Present: (controllerFlags & 1) !== 0,
      romName
    }
  };
}
