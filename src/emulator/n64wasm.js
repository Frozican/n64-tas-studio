const BASE = import.meta.env.BASE_URL || '/';
const BUTTON_INDEX = { A:0, B:1, Z:2, Start:3, L:4, R:5, '↑':6, '↓':7, '←':8, '→':9, 'C↑':10, 'C↓':11, 'C←':12, 'C→':13 };
function assetUrl(file) { return new URL(BASE + 'n64wasm/' + file, document.baseURI).href; }
const CONFIG = [
  0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,
  'ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',
  'i','k','j','l','a','q','e','s','d','`','w','s','a','d',
  0,0,0,0,0,0,0,0,0,0,0,0,0
].join('\n') + '\n';

export class N64WasmCore {
  constructor({root,onStatus=()=>{}}) {
    this.root=root; this.onStatus=onStatus; this.Module=null;
    this.ready=false; this.frameCount=0; this.initialState=null; this.script=null;
    this.visualCanvas=document.createElement('canvas'); this.visualCanvas.width=640; this.visualCanvas.height=480;
    this.visualContext=this.visualCanvas.getContext('2d',{willReadFrequently:true}); this.previousVisualPixels=null;
  }
  async load(romFile) {
    this.onStatus('loading runtime');
    const [assetsResponse,romBuffer]=await Promise.all([fetch(assetUrl('assets.zip')),romFile.arrayBuffer()]);
    if(!assetsResponse.ok) throw new Error('N64Wasm runtime assets could not be downloaded.');
    const assets=new Uint8Array(await assetsResponse.arrayBuffer());
    const rom=new Uint8Array(romBuffer);
    if(!rom.length) throw new Error('The selected ROM file is empty.');
    const canvas=document.createElement('canvas');
    canvas.id='canvas'; canvas.width=640; canvas.height=480; canvas.tabIndex=0;
    canvas.setAttribute('aria-label','Nintendo 64 game screen');
    canvas.style.cssText='display:block;width:100%;height:100%;min-height:240px;background:#05070b;touch-action:none';
    this.root.replaceChildren(canvas);
    try { delete window.Module; } catch {}
    let resolveRuntime,rejectRuntime;
    const runtimeReady=new Promise((resolve,reject)=>{resolveRuntime=resolve;rejectRuntime=reject;});
    const module={
      canvas,noInitialRun:true,locateFile:file=>assetUrl(file),
      print:message=>console.log('[N64Wasm]',message),
      printErr:message=>console.warn('[N64Wasm]',message),
      onAbort:reason=>rejectRuntime(new Error('N64Wasm aborted: '+reason)),
      onRuntimeInitialized:async()=>{
        try {
          this.onStatus('loading ROM');
          module.FS.writeFile('assets.zip',assets);
          module.FS.writeFile('config.txt',new TextEncoder().encode(CONFIG));
          module.FS.writeFile('game.z64',rom);
          module.callMain(['game.z64']);
          if(typeof module._runMainLoop!=='function') throw new Error('The N64 frame function was not exported.');
          if(typeof module._neil_tas_set_button!=='function'||typeof module._neil_tas_set_axis!=='function') throw new Error('The TAS input bridge was not compiled.');
          this.Module=module; this.frameCount=0;
          this.setInput({buttons:[],stickX:0,stickY:0});
          this.initialState=this.saveState();
          if(!this.initialState) throw new Error('The initial N64 savestate could not be created.');
          this.ready=true; this.onStatus('N64 core ready'); resolveRuntime(this);
        } catch(error) { rejectRuntime(error); }
      }
    };
    // N64Wasm's original C++ frontend calls into a global myApp object.
    // This TAS page does not ship that frontend, so provide safe no-op hooks
    // for optional mobile UI/cloud callbacks while controller input is injected
    // through the exported TAS bridge below.
    if (!window.myApp) {
      window.myApp = {
        rivetsData: { inputController: { updateMobileControls() {} } },
        localCallback() {}, SaveStateEvent() {}, ExportEepEvent() {},
        loadCloud() {}, saveCloud() {}, fullscreen() {}
      };
    }
    this.Module=module; window.Module=module;
    this.script=document.createElement('script');
    this.script.src=assetUrl('n64wasm.js'); this.script.async=true;
    this.script.onerror=()=>rejectRuntime(new Error('N64Wasm JavaScript could not be loaded.'));
    document.head.appendChild(this.script);
    await runtimeReady;
    return this;
  }
  setInput(frame) {
    if(!this.Module) throw new Error('N64 core is not initialized.');
    const pressed=new Set(frame?.buttons||[]);
    for(let index=0;index<14;index+=1) {
      const name=Object.keys(BUTTON_INDEX).find(key=>BUTTON_INDEX[key]===index);
      this.Module._neil_tas_set_button(index,name&&pressed.has(name)?1:0);
    }
    const x=Math.max(-128,Math.min(127,Math.round(Number(frame?.stickX)||0)));
    const y=Math.max(-128,Math.min(127,Math.round(Number(frame?.stickY)||0)));
    this.Module._neil_tas_set_axis(x,y);
  }
  step(frame) {
    if(!this.ready) throw new Error('N64 core is not ready.');
    this.setInput(frame); this.Module._runMainLoop(); this.frameCount+=1;
    return this.captureVisualChange();
  }
  captureVisualChange() {
    const source=this.Module?.canvas;
    if(!source || !this.visualContext) return true;
    try {
      this.visualContext.drawImage(source,0,0,640,480);
      const pixels=this.visualContext.getImageData(0,0,640,480).data;
      if(!this.previousVisualPixels) {
        this.previousVisualPixels=new Uint8ClampedArray(pixels);
        return true;
      }
      let changed=false;
      for(let i=0;i<pixels.length;i+=1) {
        if(pixels[i]!==this.previousVisualPixels[i]) { changed=true; break; }
      }
      this.previousVisualPixels=new Uint8ClampedArray(pixels);
      return changed;
    } catch(error) {
      // Fail open: if the browser cannot read the rendered frame, never hide it.
      console.warn('N64 visual-frame comparison unavailable:',error);
      this.previousVisualPixels=null;
      return true;
    }
  }
  saveState() {
    if(!this.Module||typeof this.Module._neil_serialize!=='function') return null;
    if(!this.Module._neil_serialize()) return null;
    return new Uint8Array(this.Module.FS.readFile('savestate.gz'));
  }
  loadState(state,frameNumber=0) {
    if(!this.Module||!state) throw new Error('Savestate data is unavailable.');
    this.Module.FS.writeFile('savestate.gz',new Uint8Array(state));
    if(!this.Module._neil_unserialize()) throw new Error('The N64 core rejected the savestate.');
    this.frameCount=frameNumber;
    this.previousVisualPixels=null;
  }
  reset() {
    if(!this.ready || !this.Module) throw new Error('N64 core is not ready.');
    if(typeof this.Module._neil_reset!=='function') throw new Error('The N64 core reset function is unavailable.');
    // Use the emulator's native reset path instead of reloading a large savestate
    // into Emscripten's virtual filesystem (which can crash mobile browsers).
    this.Module._neil_reset();
    this.frameCount=0;
  }
  restoreInitial() {
    if(!this.initialState) throw new Error('Initial savestate is unavailable.');
    this.loadState(this.initialState,0);
  }
}
