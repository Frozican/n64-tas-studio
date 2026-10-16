# N64 TAS Studio

Mobile-friendly browser workbench for Nintendo 64 TAS research. **Early prototype: no N64 emulator core is integrated yet.** The UI edits an input timeline and exports project JSON; it does not run games or claim frame-perfect playback.

## Current prototype
- Responsive UI for Android and desktop.
- Select `.z64`, `.n64`, `.v64` ROM files locally and attempt to launch them using EmulatorJS (`n64` core) loaded from its public CDN.
- Frame selection, per-frame button toggles, timeline play/pause (timeline only), analog X/Y values.
- Project JSON import/export.
- GitHub Pages deployment workflow.

## Roadmap
1. Verify EmulatorJS boots correctly with legally obtained ROMs on desktop and Android.
2. Investigate a core integration exposing programmatic input injection and single-frame advance; the current EmulatorJS launcher does not expose this API.
3. Test replay repeatability under identical conditions.
4. Add savestates, movie format compatibility, RAM watch and Android performance testing.

## External runtime notice
The current experimental integration loads EmulatorJS assets from `https://cdn.emulatorjs.org/stable/data/`. The page requires an internet connection to fetch those assets. Review EmulatorJS licensing and project requirements before redistribution.

## Local development
Requires Node.js 22+:
```bash
npm install
npm run dev
npm run build
```

## GitHub Pages
Repository: `Frozican/n64-tas-studio`. In Settings → Pages choose **GitHub Actions** as source. `vite.config.js` uses `/n64-tas-studio/`; update it if the repository name changes. For a user site, use `/`.

## ROMs and licensing
No commercial ROMs or BIOS files are included. Use game files you are legally entitled to use. This prototype does not upload ROM bytes. Any future emulator core retains its own license and notices.
