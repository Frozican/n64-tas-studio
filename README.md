# N64 TAS Studio

Mobile-friendly browser workbench for Nintendo 64 TAS research. **Early prototype: no N64 emulator core is integrated yet.** The UI edits an input timeline and exports project JSON; it does not run games or claim frame-perfect playback.

## Current prototype
- Responsive UI for Android and desktop.
- Select `.z64`, `.n64`, `.v64` ROM files locally (selection only; no emulation yet).
- Frame selection, per-frame button toggles, timeline play/pause (timeline only), analog X/Y values.
- Project JSON import/export.
- GitHub Pages deployment workflow.

## Roadmap
1. Pin a browser-compatible N64 core and check its license/build process.
2. Prove programmatic input injection and single-frame advance.
3. Test replay repeatability under identical conditions.
4. Add savestates, movie format compatibility, RAM watch and Android performance testing.

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
