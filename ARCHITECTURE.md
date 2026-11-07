# Architecture

This document describes the current implementation of N64 TAS Studio. It documents the existing design and its experimental limitations; it is not a claim that every emulator behavior is cycle-accurate or deterministic.

## 1. High-level design

N64 TAS Studio is a static Vite application. The browser hosts the UI, project data, N64 WebAssembly runtime, emulator state, and recording pipeline. GitHub Pages serves the built static files; there is no application server handling ROMs or TAS projects.

```text
Browser
├── UI and timeline                 src/main.js
├── TAS project model               src/tas/project.js
├── N64 runtime adapter             src/emulator/n64wasm.js
│   └── N64Wasm WebAssembly runtime public/n64wasm/ (generated at build time)
└── Recording pipeline              src/main.js
    ├── frame image capture
    ├── PCM audio capture
    └── AVI container assembly
```

## 2. Main source modules

### `src/main.js`

Application orchestration and UI:

- Builds the page interface and connects controller, analog-stick, timeline, transport, project, and recording controls.
- Stores the active project and selected timeline frame.
- Resolves inherited analog-stick axes before passing a frame to the core.
- Applies frame inputs, advances the core, and manages timeline navigation.
- Stores periodic savestate checkpoints and replays from the closest checkpoint at or before the requested destination.
- Captures JPEG images and assembles the AVI output.

The recording range is inclusive: both the configured **From** and **To** frames are included in the exported video.

### `src/tas/project.js`

Defines the project data model:

- `createFrame()` creates a frame with button and analog-stick input.
- `createProject()` creates a versioned project object.
- `normalizeProject()` validates and normalizes imported project data, including supported buttons and analog-stick bounds.

Project data is local to the browser until the user exports it. The project file contains input/timeline data and metadata, not a bundled ROM.

### `src/emulator/n64wasm.js`

Wraps the WebAssembly emulator and exposes a smaller interface to the application:

- Loads the generated N64Wasm assets and the user-selected ROM.
- Initializes the emulator and captures an initial savestate.
- Maps TAS button and analog-stick state to the native input bridge.
- Exposes one-frame stepping, reset, savestate save/load, and unpaced execution.
- Maintains a persistent visual canvas. A scratch canvas is checked before replacing the last accepted image so transient blank WebGL frames do not overwrite it.
- Captures PCM samples from the N64Wasm resampled audio ring buffer while recording is active.

The adapter expects the custom TAS exports added by `scripts/patch_n64wasm.py`.

## 3. Input and frame execution

The project timeline stores inputs by frame number. Before a core step, the application resolves the frame's effective analog-stick axes and passes its buttons and stick values to `N64WasmCore.step()`.

The adapter writes those values through the native TAS bridge and invokes the core's exported main-loop function once. The native patch calls the emulator's `retro_run()` path once for each host request and bypasses the ordinary audio-queue throttling and, when requested for recording, the wall-clock frame limiter.

This provides a consistent host-side frame-stepping interface. It does **not** by itself prove deterministic emulation: timing behavior, game compatibility, savestate behavior, and repeatability can vary by title and ROM revision.

## 4. Checkpoints and seeking

The application saves a checkpoint every `CHECKPOINT_INTERVAL` frames (currently 60), subject to a maximum checkpoint count. When navigating to a target frame:

1. Find the newest saved checkpoint whose frame number is not greater than the target.
2. Restore that state (or the initial state when no later checkpoint is available).
3. Replay the stored inputs frame by frame until the target is reached.
4. Refresh the timeline and game view.

When an input is edited on a past frame, later checkpoints and visual-duplicate markers are invalidated. The application rolls back up to three frames before the edited frame and replays toward the previous playhead position so the modified input can be applied to the live core.

Checkpoints are an optimization, not a guarantee of deterministic replay.

## 5. Recording pipeline

Recording is coordinated by `recordSelectedRange()` in `src/main.js`:

1. Validate the inclusive From/To range and save the current emulator state.
2. Enable unpaced execution and restore the closest checkpoint at or before From.
3. Replay inputs up to the first requested frame.
4. Start native PCM capture and prepare a persistent video capture canvas.
5. For every requested frame, step the core, retain the last accepted complete visual image when a step has no new visual frame, and encode the image as JPEG.
6. Finish PCM capture and assemble the video and audio into an AVI container.
7. Restore the previous emulator state and return execution to paced mode.

The AVI contains two streams:

- **Video:** Motion-JPEG, 60 frames per second.
- **Audio:** PCM, signed 16-bit, two channels, 44,100 samples per second.

The current muxer writes video frame chunks and then the captured PCM audio chunk into the AVI `movi` list, with an `idx1` index. The audio capture reads newly written samples from the emulator's 64,000-sample circular resampler buffer after each core step and copies them into chunks in JavaScript memory.

### Audio synchronization is unverified

The audio path is implemented, but its synchronization against the recorded video has **not yet been verified**. A provisional one-video-frame delay (735 stereo sample frames at 44.1 kHz) is currently prepended to the captured audio. This is a test adjustment, not a validated synchronization calibration. The amount of delay may need to be changed after testing representative games and output players.

The audio ring buffer is finite. If capture falls more than half a ring behind, the adapter logs an overrun and retains the newest portion; that can cause missing audio. Long recordings also use additional browser memory for encoded video and PCM chunks.

## 6. Build and deployment

The GitHub Actions workflow at `.github/workflows/deploy.yml`:

1. Checks out the repository.
2. Sets up the pinned Emscripten SDK version.
3. Clones N64Wasm and checks out commit `bfac222f8a27287022844b47000328531834e9c1`.
4. Applies `scripts/patch_n64wasm.py`.
5. Compiles the WebAssembly runtime.
6. Copies the generated JavaScript, WASM, and runtime assets into `public/n64wasm/`.
7. Installs Node.js dependencies and runs `npm run build`.
8. Deploys the Vite `dist/` output to GitHub Pages.

The generated runtime files are build artifacts; they are not maintained as hand-written application source.

For local UI development, use `npm install` and `npm run dev`. To run a full local build, first perform the N64Wasm fetch, patch, compile, and staging steps used by the workflow.

## 7. Known limitations and validation work

- The emulator integration is experimental and game compatibility is not universal.
- Deterministic replay and frame-perfect behavior have not been proven across games or ROM revisions.
- M64 import does not detect game boot completion or align the first movie input to the game's ready state. Converted movies can start too early or too late; startup alignment remains a manual/unfinished step.
- Audio/video synchronization remains unverified; the current one-frame audio delay is provisional.
- PCM ring-buffer overruns can result in missing audio samples.
- The AVI writer currently stores the audio stream as one chunk after the video chunks rather than continuously interleaving audio and video. Player compatibility and seeking behavior should be tested.
- The application is a browser-side prototype; available memory and performance depend on the device and browser.
- The project does not include ROM images. Users must provide their own legally obtained ROM files.

## 8. Useful files

| Path | Responsibility |
|---|---|
| `src/main.js` | UI orchestration, timeline, checkpoints, recording, AVI muxer |
| `src/tas/project.js` | Project and frame data model |
| `src/emulator/n64wasm.js` | WebAssembly runtime adapter, inputs, savestates, visuals, PCM capture |
| `scripts/patch_n64wasm.py` | Applies the native TAS bridge patch to pinned N64Wasm source |
| `.github/workflows/deploy.yml` | Builds the runtime and deploys GitHub Pages |
| `vite.config.js` | Vite base path for GitHub Pages |
| `THIRD_PARTY_NOTICES.md` | Upstream and third-party license notices |
