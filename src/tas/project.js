export const BUTTONS = ['A','B','Z','Start','L','R','C↑','C↓','C←','C→','↑','↓','←','→'];
export const createFrame = (frame = 0) => ({ frame, buttons: [], stickX: 0, stickY: 0 });
export function createProject(name = 'Untitled N64 TAS') {
  const now = new Date().toISOString();
  return { format: 'n64-tas-studio', formatVersion: 1, name, romName: null, fps: 60, frames: [createFrame(0)], createdAt: now, updatedAt: now };
}
export function normalizeProject(input) {
  if (!input || input.format !== 'n64-tas-studio' || !Array.isArray(input.frames)) throw new Error('Not a valid N64 TAS Studio project.');
  const axis = value => Number.isFinite(Number(value)) ? Math.max(-128, Math.min(127, Math.round(Number(value)))) : 0;
  const frames = input.frames.map((frame, index) => ({ frame: Number.isInteger(frame.frame) && frame.frame >= 0 ? frame.frame : index, buttons: Array.isArray(frame.buttons) ? frame.buttons.filter(button => BUTTONS.includes(button)) : [], stickX: axis(frame.stickX), stickY: axis(frame.stickY) })).sort((a,b) => a.frame - b.frame);
  return { ...createProject(input.name || 'Imported TAS'), ...input, frames, updatedAt: new Date().toISOString() };
}
