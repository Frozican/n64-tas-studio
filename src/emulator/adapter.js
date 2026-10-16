/**
 * TAS adapter contract for a future deterministic N64 core.
 * The current EmulatorJS launcher is ordinary playback and does NOT expose a
 * verified frame-advance or input-injection API to this app.
 */
export class N64EmulatorAdapter {
  constructor(core = null) { this.core = core; }
  get supportsFrameAdvance() { return Boolean(this.core?.stepFrame); }
  get supportsInputInjection() { return Boolean(this.core?.setControllerInput); }
  async loadRom(file) {
    if (!this.core?.loadRom) throw new Error('The current EmulatorJS launcher does not expose a programmatic core API.');
    return this.core.loadRom(file);
  }
  async setControllerInput(port, input) {
    if (!this.core?.setControllerInput) throw new Error('Controller injection is not available in the current runtime.');
    return this.core.setControllerInput(port, input);
  }
  async stepFrame() {
    if (!this.core?.stepFrame) throw new Error('True frame advance is not available in the current runtime.');
    return this.core.stepFrame();
  }
  async saveState() {
    if (!this.core?.saveState) throw new Error('Programmatic savestates are not available in the current runtime.');
    return this.core.saveState();
  }
  async loadState(state) {
    if (!this.core?.loadState) throw new Error('Programmatic savestate loading is not available in the current runtime.');
    return this.core.loadState(state);
  }
}
