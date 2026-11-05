# Third-party notices

## N64Wasm

The emulator runtime is built from [nbarkhina/N64Wasm](https://github.com/nbarkhina/N64Wasm), pinned to commit `bfac222f8a27287022844b47000328531834e9c1`.

N64Wasm is distributed under the MIT License. Copyright (c) 2021 Neil Barkhina. The MIT license text is available in the pinned upstream repository's `LICENSE` file.

The upstream N64Wasm build also compiles third-party components, including Mupen64Plus and libretro code, which retain their own license terms (including GPL-2.0 components). Their notices and corresponding source files are present in the pinned upstream source repository. This project rebuilds that source in GitHub Actions and applies the additional local changes documented in `scripts/patch_n64wasm.py`.

Pinned source:
https://github.com/nbarkhina/N64Wasm/tree/bfac222f8a27287022844b47000328531834e9c1

No ROMs or game data are included.
