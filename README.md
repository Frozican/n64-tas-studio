# N64 TAS Studio

A mobile-friendly browser workbench for Nintendo 64 TAS projects. The existing controller, timeline, analog stick, project editor, and import/export UI are retained.

## Emulator and frame stepping

The GitHub Pages workflow builds a pinned N64Wasm WebAssembly runtime and self-hosts it with the site. ROM files stay in the browser and are not uploaded.

- The core initializes after a local ROM is selected.
- **Frame Advance** calls the N64 core exactly once.
- TAS playback uses the same one-core-frame stepping path, applying each input row before the call.
- Input state is latched in the core until the next frame executes.
- Savestates are used as checkpoints so selecting a timeline frame can restore and replay the game to that frame.
- Automatic frame loops and audio queue throttling are disabled for manual TAS stepping.

This is an experimental integration. Frame count and rendering are synchronized to core calls, but deterministic repeatability still needs validation for each game and ROM revision. Do not treat an untested run as a verified TAS.

## Local development

Requires Node.js 22+:
```bash
npm install
npm run dev
npm run build
```

The N64 runtime is staged by GitHub Actions before Vite builds the site. A plain local Vite build contains the UI but not the emulator runtime unless the workflow staging steps are run first.

## GitHub Pages

Repository: `Frozican/n64-tas-studio`. In Settings → Pages choose **GitHub Actions** as source. `vite.config.js` uses `/n64-tas-studio/`; update it if the repository name changes.

## ROMs and licensing

No commercial ROMs or BIOS files are included. Use game files you are legally entitled to use. ROM bytes are loaded into the local WebAssembly filesystem and are not sent to a server.

The N64 runtime is built from [N64Wasm](https://github.com/nbarkhina/N64Wasm), pinned to commit `bfac222f8a27287022844b47000328531834e9c1`. The upstream project includes its MIT license and third-party emulator components with their own license terms. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the pinned upstream source for notices and corresponding source. The local TAS bridge patch is in `scripts/patch_n64wasm.py`.
