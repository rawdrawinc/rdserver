# DOOM (1993) Exact-Replica: Design & Execution Plan

This document outlines a complete plan to reimplement the original **DOOM (1993)** with identical behavior under a strict **5 MB** size budget, using C (and minimal C++ only where unavoidable). The target platform is a minimal x86 runtime (real mode or 16/32-bit protected mode), either booted from a custom image or run under a DOS-compatible emulator such as DOSBox.

## 1) Core Constraints

- No heavyweight OS dependencies.
- Graphics via VGA Mode 13h (320x200, indexed 8-bit palette).
- Input via BIOS/low-level ports.
- Audio via AdLib/Sound Blaster (PC speaker fallback optional).
- Assets loaded from original WAD formats (or byte-identical equivalents).
- Original id Tech 1-style data/model pipeline: fixed-point math, BSP traversal, visplanes, billboard sprites, colormaps.
- No modern rendering APIs, dynamic texture systems, or new gameplay assets.
- Final artifact (binary + required data) must stay under **5 MB**.

## 2) Runtime Target

### Option A: DOS executable path (recommended)
- Build a DOS `.EXE`/`.COM` via OpenWatcom or DJGPP.
- Run under FreeDOS or DOSBox during development and validation.
- Benefit: easiest path to authentic BIOS/VGA/SB behavior and fastest iteration.

### Option B: Bootable image path
- Tiny bootloader + flat binary/kernel entry.
- Implement minimal runtime services directly (disk, input, timer, graphics, sound).
- Benefit: standalone boot image and minimal overhead.

## 3) Build & Toolchain Strategy

- Source language: C99-first style, freestanding where practical.
- Host-side development builds for rapid debugging, plus DOS/target cross-build.
- Compile flags emphasize small, deterministic binaries (fixed-point, no exceptions/RTTI/STL-heavy usage, no dynamic linking).
- Separate targets:
  - `host_debug` (logic validation)
  - `dos_release` (final environment)
  - `boot_release` (optional)

## 4) Rendering Architecture (Pixel-Exact Goals)

### VGA mode
- Set Mode 13h via BIOS interrupt (`int 10h`, `AL=0x13`).
- Write final 8-bit palette indices directly to VRAM (`0xA000`).
- Load `PLAYPAL` and program DAC palette entries.

### World rendering
- Use WAD BSP lumps (`NODES`, `SSECTORS`, `SEGS`) for visibility traversal.
- Column-based wall renderer with fixed-point projection tables.
- Visplane-based floor/ceiling rasterization matching original span behavior.
- Sprite billboards with original angle-frame selection and mirroring rules.
- Apply `COLORMAP` lookup for distance/light-level shading.

### Fidelity notes
- Preserve original quirks (FOV feel, precision artifacts, non-true-3D constraints).
- Avoid modern interpolation/filtering.

## 5) WAD, Maps, and Asset Pipeline

### WAD parser
- Parse 12-byte header (`IWAD`/`PWAD`, lump count, directory offset).
- Parse 16-byte directory entries (`offset`, `size`, `name[8]`).
- Name-based lump lookup table for constant-time access.

### Map data usage
- Load map lump groups (`THINGS`, `LINEDEFS`, `SIDEDEFS`, `VERTEXES`, `SEGS`, `SSECTORS`, `NODES`, `SECTORS`, `REJECT`, `BLOCKMAP`).
- Use `BLOCKMAP` for collision queries and `REJECT` for visibility pruning where applicable.

### Textures/sprites
- Build wall textures from `TEXTURE1/2` + `PNAMES` patch composition.
- Decode patch/sprite column data exactly (column posts/RLE-like structure).

## 6) Input & Timing

### Input
- Keyboard: BIOS `int 16h` or direct controller reads.
- Mouse/joystick optional and size-dependent.

### Tick cadence
- Fixed **35 Hz** logic tick.
- PIT/IRQ0-driven or robust timing loop fallback.
- Separate tick simulation from render pacing while preserving original game-time semantics.

## 7) Audio Subsystem

### Music
- AdLib/OPL2 (MUS playback path).
- Direct port writes (`0x388/0x389`) where supported.

### SFX
- 8-bit PCM path for Sound Blaster-compatible playback.
- Optional PC speaker compatibility mode for minimal/fallback builds.

### Implementation guidance
- Keep mixer logic compact and deterministic.
- Favor original format compatibility over quality “improvements”.

## 8) Game Logic & Behavioral Equivalence

- Original 35 Hz thinker/tick model.
- Entity state machines and action timing reproduced from DOOM data/code behavior.
- Weapon cadence, damage behavior, line triggers, sector specials, and AI pursuit logic preserved.
- Verify determinism by replaying original demos and comparing outcomes.

## 9) Memory & Size Plan

### Allocation
- Zone allocator model (`Z_Malloc`-style), large static pool(s), low fragmentation.
- Minimize reliance on libc allocator.

### Budget (illustrative)
- IWAD-class data: ~3 MB (variant-dependent).
- Code + tables + runtime: target <= 2 MB.
- Total target: < 5 MB.

### Binary hygiene
- Remove debug strings/symbols in release.
- Avoid large optional subsystems unless behind build-time flags.

## 10) Milestones

1. **Platform bootstrap**: set video mode, keyboard input, timer loop.
2. **WAD loader**: parse lumps, validate map/texture access.
3. **Wall renderer + BSP traversal**: draw walkable map views.
4. **Visplanes + sprites**: complete scene composition.
5. **Collision/physics + player controls**.
6. **Monsters, triggers, weapons**.
7. **Audio (SFX, then music)**.
8. **Deterministic validation via demo playback**.
9. **Size pass and release packaging (DOS image/boot image)**.

## 11) Validation Matrix

- **Behavioral**: demo sync, monster timings, trigger semantics.
- **Visual**: frame-by-frame comparisons against known-compatible ports.
- **Audio**: effect ordering, channel limits, timing alignment.
- **Performance**: sustained realtime at target settings in DOSBox and at least one alternate emulator/VM.
- **Footprint**: enforce build-size checks in CI/script.

## 12) AI-Assisted Development Policy

- Use AI for boilerplate generation only (parsers, table scaffolding, build scripts).
- Manually validate all logic against original behavior expectations.
- Reject abstractions that increase size or alter timing semantics.
- Keep generated code simple, auditable, and portable to freestanding targets.

## Summary

A faithful DOOM 1993 replica under 5 MB is practical if the implementation stays close to original data formats and timing/rendering behavior, and if platform dependencies remain strictly low-level (DOS/BIOS-compatible). The plan above stages work from hardware/runtime bring-up to deterministic behavior validation and final size hardening.
