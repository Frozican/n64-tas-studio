/** Emulator-core contract. Methods intentionally fail until a tested N64 core is integrated. */
export class N64EmulatorAdapter {
  async loadRom(_file) { throw new Error('N64 emulator core is not integrated yet.'); }
  async reset() { throw new Error('N64 emulator core is not integrated yet.'); }
  async setControllerInput(_port, _input) { throw new Error('N64 emulator core is not integrated yet.'); }
  async stepFrame() { throw new Error('N64 emulator core is not integrated yet.'); }
  async saveState() { throw new Error('N64 emulator core is not integrated yet.'); }
  async loadState(_state) { throw new Error('N64 emulator core is not integrated yet.'); }
  async readMemory(_address, _length = 1) { throw new Error('N64 emulator core is not integrated yet.'); }
}
