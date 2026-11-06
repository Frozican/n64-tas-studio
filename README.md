# N64 TAS Studio

A mobile-friendly, browser-based workbench for Nintendo 64 tool-assisted speedrun (TAS) projects. It combines a frame timeline, controller-input editor, analog-stick controls, an experimental N64 runtime, project import/export, and AVI recording.

## Features

- **Local ROM loading:** Select a supported N64 ROM from your device. ROM data is loaded in the browser and is not uploaded.
- **Frame-based input editing:** Assign controller buttons and analog-stick values to individual timeline frames.
- **Frame advance and playback:** The host calls the emulator core once for each requested frame and applies that frame's input before execution.
- **Timeline navigation:** Select a frame and restore/replay from a saved checkpoint where available.
- **Project files:** Import and export TAS project data as JSON-based `.n64tas.json` files.
- **AVI recording:** Record an inclusive frame range as Motion-JPEG video at 60 FPS with captured 44.1 kHz, 16-bit stereo PCM audio.

## Emulator and frame stepping

The site uses a self-hosted WebAssembly build of [N64Wasm](https://github.com/nbarkhina/N64Wasm), compiled by GitHub Actions from a pinned upstream revision. A small local patch adds the TAS input bridge and exposes one core run per host frame.

- The core initializes after a local ROM is selected.
- **Frame Advance** calls the N64 core once.
- Playback and seeking use the same core stepping path, applying the selected input before each core call.
- Savestates are used as checkpoints to reduce the amount of replay needed when navigating the timeline.
- Offline recording disables the wall-clock frame limiter so the selected range can be rendered faster than real time.

This is an experimental emulator integration. Frame stepping is driven by core calls, but deterministic repeatability and game compatibility still need validation for each game and ROM revision. Do not treat an untested run as a verified TAS.

## Recording and audio status

The recorder exports an AVI file containing Motion-JPEG video and audio captured directly from the N64Wasm resampled PCM output (44.1 kHz, signed 16-bit, stereo).

**Audio/video synchronization has not yet been verified.** A provisional one-frame audio delay has been applied, but it is not yet confirmed to be correctly synchronized across games, recording ranges, or players. Audio capture can also be affected by emulator output-buffer overruns. Treat recordings as experimental until synchronization and completeness have been tested.

## Project structure

See [ARCHITECTURE.md](ARCHITECTURE.md) for the code layout, runtime flow, recording pipeline, build process, and current technical limitations.

## Local development

Requires Node.js 22+:
```bash
npm install
npm run dev
npm run build
npm run preview
```

The N64 runtime is staged by the GitHub Actions workflow before Vite builds the site. A plain local Vite build contains the UI but not the emulator runtime unless the runtime staging steps from `.github/workflows/deploy.yml` are run first.

## GitHub Pages deployment

Repository: [Frozican/n64-tas-studio](https://github.com/Frozican/n64-tas-studio).

In **Settings → Pages**, choose **GitHub Actions** as the deployment source. The workflow in `.github/workflows/deploy.yml` builds the pinned N64Wasm runtime, stages its files under `public/n64wasm/`, builds the Vite site, and deploys the `dist/` directory.

`vite.config.js` uses the base path `/n64-tas-studio/`. Update it if the repository name or deployment path changes.

## ROMs and licensing

No commercial ROMs or BIOS files are included. Use game files you are legally entitled to use. ROM bytes are loaded into the browser's local WebAssembly filesystem and are not sent to a server.

The N64 runtime is built from [N64Wasm](https://github.com/nbarkhina/N64Wasm), pinned to commit `bfac222f8a27287022844b47000328531834e9c1`. The upstream project includes its MIT license and third-party emulator components with their own license terms. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the pinned upstream source for notices and corresponding source. The local TAS bridge patch is in [scripts/patch_n64wasm.py](scripts/patch_n64wasm.py).
