# GME — Grandemaison Editor

Electron + React + WebGL2 desktop app for stacking artistic image/video effects.

## Build & Dev

```bash
npm install
npm run dev:electron      # Vite (port 5173) + Electron concurrently
npm run build:app         # Vite build + electron-builder → release/
.\scripts\deploy-update.ps1 -SshHost user@host   # push update to VPS
```

## Architecture

```
electron/main.cjs     Electron main: window, media permissions, auto-updater
electron/preload.cjs  Minimal preload — exposes only `platform` + `isElectron`
src/context.tsx       Single global AppContext (no Redux/Zustand); refs for perf
src/types.ts          All shared types: EffectType, ActiveEffect, AppMode, per-effect Params
src/gl/renderer.ts    WebGL2 singleton — ping-pong FBO multi-pass pipeline
src/gl/shaders.ts     GLSL fragment shaders + LUT textures (thermal palette, etc.)
src/effects/          One file per effect; each exports apply*() + ParamsInterface
src/components/       React UI; state via useApp() context hook
```

**Processing pathways:**
- **Image mode:** debounced `useEffect` → `processRawFrame()` (CPU chain) → `setResultImage()`
- **Video/webcam:** RAF loop → `processGPU()` (GPU pipeline + optional CPU patches) → GPU blit
- **Audio mode:** `setDirectResult()` on every frame

## Effect System

Each file in `src/effects/` follows the same contract:
```ts
export interface XxxParams { … }
export function applyXxx(src: ImageData, params: XxxParams): ImageData
```

**GPU effects** (run in renderer.ts): dither, thermal, nightvision, infrared, pointcloud, topo, brutalist (partial), global adjustments.  
**CPU-only effects**: `ascii.ts` (canvas char rendering), `cybersigilism.ts` (SVG canvas drawing) — throttled to ~15 fps; last frame cached to prevent flicker.

Effects are applied in **reverse** of the UI list order inside `processRawFrame()`.

## Key Conventions

- **Context over props**: consume state via `useApp()`, pass minimal props between components.
- **Refs for hot paths**: undo/redo stacks, canvas refs, and frame data use `useRef` — not `useState` — to avoid per-frame re-renders.
- **Persistence**: `gm_state` (effect config) and `gm_presets` (presets) in `localStorage`.  Any structural schema change requires manual migration.
- **Undo limit**: 50 snapshots (`.slice(-49)`).

## Pitfalls

- **Effect order reversal**: `processRawFrame()` reverses the effects array before iterating — UI order ≠ processing order.
- **GPU dither substitution**: Non-GPU dither algorithms (error-diffusion) are silently replaced with bayer4 at video resolution to avoid expensive CPU readback.
- **`skipBlit` flag**: `Canvas.tsx` sets `glRenderer.skipBlit = true` in B/A (before/after) mode to prevent the GPU from overwriting the manual canvas composite.
- **Live mode phase drift**: The phase wanders indefinitely (no modulo wrap); seed-based RNG re-randomizes each frame for some effects.
- **React Compiler disabled**: Not enabled due to build-time overhead — see README for enabling it.
