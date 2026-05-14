import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ActiveEffect, EffectParams, EffectType, Adjustments, Preset, AppMode, VisualizerParams } from './types';
import { glRenderer, ditherIsGpuCapable } from './gl/renderer';
import { applyDither } from './effects/dither';
import { applyAscii } from './effects/ascii';
import { applyBrutalist } from './effects/brutalist';
import { applyCybersigilismSync } from './effects/cybersigilism';
import { applyThermal } from './effects/thermal';
import { applyNightVision } from './effects/nightvision';
import { applyInfrared } from './effects/infrared';
import { applyPointCloud } from './effects/pointcloud';
import { applyTopo } from './effects/topo';

// ─── Destroy: lerp params toward extremes ─────────────────────────────────────

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function lerpBool(v: boolean, threshold: number, t: number): boolean { return t >= threshold || v; }

function computeDestroyedParams(p: EffectParams, t: number): EffectParams {
  return {
    ...p,
    dither: {
      ...p.dither,
      intensity:   lerp(p.dither.intensity, 2, t),
      paletteSize: Math.max(2, Math.round(lerp(p.dither.paletteSize, 2, t))),
      hueShift:    lerp(p.dither.hueShift, 140, t),
      saturation:  lerp(p.dither.saturation, 220, t),
      bias:        lerp(p.dither.bias, 0.08, t),
    },
    ascii: {
      ...p.ascii,
      charSize:   Math.max(2, Math.round(lerp(p.ascii.charSize, 2, t))),
      contrast:   lerp(p.ascii.contrast, 80, t),
      brightness: lerp(p.ascii.brightness, -30, t),
    },
    brutalist: {
      ...p.brutalist,
      glitch:              lerpBool(p.brutalist.glitch, 0.2, t),
      glitchIntensity:     lerp(p.brutalist.glitchIntensity, 15, t),
      chromaticAberration: lerpBool(p.brutalist.chromaticAberration, 0.15, t),
      chromaticAmount:     lerp(p.brutalist.chromaticAmount, 20, t),
      scanlines:           lerpBool(p.brutalist.scanlines, 0.15, t),
      scanlineIntensity:   lerp(p.brutalist.scanlineIntensity, 1, t),
      pixelSort:           lerpBool(p.brutalist.pixelSort, 0.35, t),
      pixelSortThreshold:  lerp(p.brutalist.pixelSortThreshold, 200, t),
      posterize:           lerpBool(p.brutalist.posterize, 0.1, t),
      posterizeLevels:     Math.max(2, Math.round(lerp(p.brutalist.posterizeLevels, 2, t))),
    },
    cybersigilism: {
      ...p.cybersigilism,
      complexity:  Math.round(lerp(p.cybersigilism.complexity, 28, t)),
      scale:       lerp(p.cybersigilism.scale, 2.5, t),
      opacity:     Math.min(1, lerp(p.cybersigilism.opacity, 1, t)),
      strokeWidth: lerp(p.cybersigilism.strokeWidth, 4, t),
      angularity:  Math.min(1, lerp(p.cybersigilism.angularity, 1, t)),
    },
  };
}

// ─── Live mode: drift params by phase ────────────────────────────────────────

function applyLivePhase(p: EffectParams, phase: number): EffectParams {
  return {
    ...p,
    cybersigilism: {
      ...p.cybersigilism,
      seed: Math.round(Math.abs(Math.sin(phase * 0.37 + 1.2) * 99999)) + phase * 7,
    },
    dither: {
      ...p.dither,
      bias:     Math.max(0.1, Math.min(0.9, 0.5 + Math.sin(phase * 0.8) * 0.25)),
      hueShift: p.dither.hueShift + Math.sin(phase * 0.5) * 25,
    },
  };
}

// ─── Randomize ────────────────────────────────────────────────────────────────

function rnd(min: number, max: number) { return min + Math.random() * (max - min); }
function rndInt(min: number, max: number) { return Math.round(rnd(min, max)); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function randomEffects(): ActiveEffect[] {
  const all: EffectType[] = ['dither', 'ascii', 'brutalist', 'cybersigilism', 'thermal', 'nightvision', 'infrared', 'pointcloud', 'topo'];
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  const count = rndInt(1, 3);
  const chosen = new Set(shuffled.slice(0, count));
  // Return the full list in a randomized order (not canonical order) so stacking order is random too
  return shuffled.map(type => ({ id: type, type, enabled: chosen.has(type) }));
}

function randomParams(): EffectParams {
  const randHex = () => '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');
  return {
    dither: {
      algo: pick(['bayer4', 'bayer8', 'floyd-steinberg', 'atkinson', 'bluenoise', 'halftone', 'interleaved-gradient', 'void-dispersed', 'clustered-8']),
      paletteSize: rndInt(2, 8),
      palette: [],
      intensity: rnd(0.4, 1.8),
      bias: rnd(0.3, 0.7),
      gammaCorrect: Math.random() > 0.6,
      blendOriginal: rndInt(0, 40),
      hueShift: rnd(-180, 180),
      saturation: rnd(60, 180),
      monoMode: Math.random() > 0.7,
    },
    ascii: {
      charSize: rndInt(6, 16),
      charset: pick(['@#S%?*+;:,. ', '█▓▒░ ', '01 ', '#+-. ', '▲◆●■▪·']),
      colored: Math.random() > 0.4,
      bgColor: Math.random() > 0.5 ? '#000000' : randHex(),
      bgOpacity: rnd(0.5, 1),
      contrast: rnd(-20, 60),
      brightness: rnd(-30, 30),
      invert: Math.random() > 0.7,
      cellAspect: rnd(0.4, 0.7),
      samplingMode: pick(['center', 'average']),
      fontFamily: 'IBM Plex Mono',
    },
    brutalist: {
      posterize: Math.random() > 0.3,
      posterizeLevels: rndInt(2, 8),
      threshold: Math.random() > 0.6,
      thresholdValue: rndInt(80, 180),
      glitch: Math.random() > 0.4,
      glitchIntensity: rnd(1, 12),
      grid: Math.random() > 0.6,
      gridSpacing: rndInt(10, 40),
      gridOpacity: rnd(0.1, 0.6),
      edgeDetect: Math.random() > 0.5,
      edgeThreshold: rndInt(50, 180),
      edgeColor: Math.random() > 0.5 ? '#ffffff' : randHex(),
      chromaticAberration: Math.random() > 0.5,
      chromaticAmount: rnd(2, 15),
      scanlines: Math.random() > 0.5,
      scanlineIntensity: rnd(0.2, 0.9),
      pixelSort: Math.random() > 0.5,
      pixelSortAxis: pick(['horizontal', 'vertical']),
      pixelSortThreshold: rndInt(60, 200),
      glitchSeed: rndInt(0, 9999),
      noise: Math.random() > 0.5,
      noiseAmount: rnd(10, 60),
    },
    cybersigilism: {
      seed: rndInt(0, 99999),
      complexity: rndInt(6, 24),
      scale: rnd(0.6, 2.5),
      opacity: rnd(0.5, 1),
      color: Math.random() > 0.5 ? '#ffffff' : randHex(),
      strokeWidth: rnd(0.5, 3),
      symmetry: pick(['none', 'vertical', 'horizontal', 'quad']),
      angularity: rnd(0, 1),
      bgFill: Math.random() > 0.7,
      fillShapes: Math.random() > 0.6,
      lineVariance: Math.random() > 0.4,
      blendMode: pick(['normal', 'screen', 'overlay', 'hard-light']),
      glow: Math.random() > 0.5,
      glowSize: rndInt(6, 25),
    },
    thermal: {
      palette: pick(['iron', 'rainbow', 'greys', 'inferno', 'viridis', 'plasma', 'thermal', 'cool', 'magma']),
      contrast: rnd(0, 30),
      brightness: rnd(-20, 20),
      blendOriginal: rndInt(0, 30),
      invert: Math.random() > 0.7,
      noiseAmount: rnd(0, 0.05),
      edgeEnhance: rnd(0, 0.5),
      edgeColor: '#ffffff',
      blur: rnd(0, 2),
      isotherms: rndInt(0, 5),
      isothermColor: randHex(),
      histStretch: Math.random() > 0.5,
    },
    nightvision: {
      gain: rnd(1.5, 5),
      noiseAmount: rndInt(5, 40),
      noiseType: pick(['shot', 'scintillation', 'speckle']),
      scanlines: Math.random() > 0.4,
      scanlineIntensity: rnd(0.1, 0.7),
      vignetteStrength: rnd(0.3, 1),
      phosphorColor: pick(['#1aff44', '#aaffaa', '#00ff88', '#44ff00']),
      bloom: rnd(0, 4),
      haloStrength: rnd(0, 0.5),
      tubeDistortion: rnd(0, 0.3),
      generation: pick(['gen1', 'gen2', 'gen3']),
      blendOriginal: rndInt(0, 20),
    },
    infrared: {
      style: pick(['aerochrome', 'ektachrome', 'kodak-hie', 'digital', 'false-color']),
      grassBoost: rnd(0.5, 2),
      skyDarken: rnd(0.3, 1),
      saturation: rndInt(80, 180),
      contrast: rnd(0, 25),
      filmGrain: rnd(0, 0.5),
      halation: rnd(0, 0.5),
      toneShift: rnd(-0.3, 0.3),
      channelMix: rnd(0.5, 1.5),
      blendOriginal: rndInt(0, 20),
    },
    pointcloud: {
      gridSize: rndInt(4, 16),
      minDotSize: rnd(0.2, 1.5),
      maxDotSize: rnd(3, 8),
      jitter: rnd(0, 0.6),
      colorMode: pick(['original', 'mono', 'accent', 'heatmap']),
      accentColor: randHex(),
      bgColor: Math.random() > 0.5 ? '#000000' : randHex(),
      invert: Math.random() > 0.7,
      seed: rndInt(0, 9999),
      shape: pick(['circle', 'square', 'cross', 'diamond']),
      glow: rnd(0, 8),
      opacity: rndInt(60, 100),
      sizeNoise: rnd(0, 1),
      connectLines: Math.random() > 0.6,
      connectThreshold: rnd(1, 2.5),
      connectOpacity: rndInt(20, 60),
    },
    topo: {
      bands: rndInt(5, 24),
      lineColor: Math.random() > 0.5 ? '#ffffff' : randHex(),
      bgColor: Math.random() > 0.5 ? '#000000' : randHex(),
      transparent: Math.random() > 0.7,
      lineWidth: rnd(0.5, 3),
      colorize: Math.random() > 0.5,
      colorPalette: pick(['mono', 'warm', 'cool', 'neon', 'earth', 'ocean', 'sunset']),
      contrast: rnd(0, 40),
      brightness: rnd(-20, 20),
      blur: rnd(0, 2),
      glow: rnd(0, 5),
      glowColor: randHex(),
      majorLines: rndInt(0, 4),
      majorLineMultiplier: rnd(1.5, 3),
      noiseAmount: rnd(0, 0.3),
    },
  };
}

function randomAdjustments(): Adjustments {
  return {
    brightness: rnd(-30, 30),
    contrast: rnd(-20, 40),
    saturation: rnd(70, 150),
    gamma: rnd(0.7, 1.5),
  };
}

// ─── Default params ───────────────────────────────────────────────────────────

const defaultAdjustments: Adjustments = { brightness: 0, contrast: 0, saturation: 100, gamma: 1.0 };

function applyAdjustments(src: ImageData, adj: Adjustments): ImageData {
  if (adj.brightness === 0 && adj.contrast === 0 && adj.saturation === 100 && adj.gamma === 1.0) return src;
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const d = out.data;
  const bf = adj.brightness / 100;
  const cf = (100 + adj.contrast) / 100;
  const sf = adj.saturation / 100;
  const gInv = adj.gamma > 0 ? 1 / adj.gamma : 1;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (adj.gamma !== 1.0) {
      r = (r / 255) ** gInv * 255;
      g = (g / 255) ** gInv * 255;
      b = (b / 255) ** gInv * 255;
    }
    r += bf * 255; g += bf * 255; b += bf * 255;
    r = (r - 128) * cf + 128;
    g = (g - 128) * cf + 128;
    b = (b - 128) * cf + 128;
    if (sf !== 1) {
      const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
      r = gray + (r - gray) * sf;
      g = gray + (g - gray) * sf;
      b = gray + (b - gray) * sf;
    }
    d[i]     = Math.max(0, Math.min(255, r));
    d[i + 1] = Math.max(0, Math.min(255, g));
    d[i + 2] = Math.max(0, Math.min(255, b));
  }
  return out;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_STATE = 'gm_state';
const LS_PRESETS = 'gm_presets';

function lsGet<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : null; } catch { return null; }
}
function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const defaultParams: EffectParams = {
  dither: {
    algo: 'bayer4',
    paletteSize: 4,
    palette: [],
    intensity: 1,
    bias: 0.5,
    gammaCorrect: false,
    blendOriginal: 0,
    hueShift: 0,
    saturation: 100,
    monoMode: false,
  },
  ascii: {
    charSize: 8,
    charset: '@#S%?*+;:,. ',
    colored: false,
    bgColor: '#000000',
    bgOpacity: 1,
    contrast: 0,
    brightness: 0,
    invert: false,
    cellAspect: 0.55,
    samplingMode: 'center',
    fontFamily: 'IBM Plex Mono',
  },
  brutalist: {
    posterize: true,
    posterizeLevels: 4,
    threshold: false,
    thresholdValue: 128,
    glitch: false,
    glitchIntensity: 3,
    grid: false,
    gridSpacing: 20,
    gridOpacity: 0.3,
    edgeDetect: false,
    edgeThreshold: 100,
    edgeColor: '#ffffff',
    chromaticAberration: false,
    chromaticAmount: 5,
    scanlines: false,
    scanlineIntensity: 0.5,
    pixelSort: false,
    pixelSortAxis: 'horizontal',
    pixelSortThreshold: 128,
    glitchSeed: 42,
    noise: false,
    noiseAmount: 25,
  },
  cybersigilism: {
    seed: 1337,
    complexity: 10,
    scale: 1,
    opacity: 0.9,
    color: '#ffffff',
    strokeWidth: 1.2,
    symmetry: 'vertical',
    angularity: 0.65,
    bgFill: false,
    fillShapes: false,
    lineVariance: true,
    blendMode: 'screen',
    glow: false,
    glowSize: 12,
  },
  thermal: {
    palette: 'iron',
    contrast: 10,
    brightness: 0,
    blendOriginal: 0,
    invert: false,
    noiseAmount: 0,
    edgeEnhance: 0,
    edgeColor: '#ffffff',
    blur: 0,
    isotherms: 0,
    isothermColor: '#aaffee',
    histStretch: false,
  },
  nightvision: {
    gain: 3,
    noiseAmount: 20,
    noiseType: 'shot',
    scanlines: true,
    scanlineIntensity: 0.4,
    vignetteStrength: 0.7,
    phosphorColor: '#1aff44',
    bloom: 2,
    haloStrength: 0,
    tubeDistortion: 0,
    generation: 'gen2',
    blendOriginal: 0,
  },
  infrared: {
    style: 'aerochrome',
    grassBoost: 1,
    skyDarken: 0.7,
    saturation: 130,
    contrast: 10,
    filmGrain: 0,
    halation: 0,
    toneShift: 0,
    channelMix: 1,
    blendOriginal: 0,
  },
  pointcloud: {
    gridSize: 8,
    minDotSize: 0.5,
    maxDotSize: 5,
    jitter: 0.3,
    colorMode: 'original',
    accentColor: '#a855f7',
    bgColor: '#000000',
    invert: false,
    seed: 42,
    shape: 'circle',
    glow: 0,
    opacity: 100,
    sizeNoise: 0,
    connectLines: false,
    connectThreshold: 1.5,
    connectOpacity: 40,
  },
  topo: {
    bands: 12,
    lineColor: '#ffffff',
    bgColor: '#000000',
    transparent: false,
    lineWidth: 1,
    colorize: false,
    colorPalette: 'mono',
    contrast: 20,
    brightness: 0,
    blur: 0,
    glow: 0,
    glowColor: '#ffffff',
    majorLines: 0,
    majorLineMultiplier: 2,
    noiseAmount: 0,
  },
};

// ─── Context types ────────────────────────────────────────────────────────────

type Snapshot = { effects: ActiveEffect[]; params: EffectParams; adjustments: Adjustments };

interface AppContextType {
  originalImage: ImageData | null;
  resultImage: ImageData | null;
  canvasSize: { width: number; height: number };
  effects: ActiveEffect[];
  params: EffectParams;
  adjustments: Adjustments;
  selectedEffect: EffectType | null;
  isProcessing: boolean;
  processingTime: number | null;
  destroyAmount: number;
  liveMode: boolean;
  liveSpeed: LiveSpeed;
  canUndo: boolean;
  canRedo: boolean;
  presets: Preset[];
  setLiveSpeed: (s: LiveSpeed) => void;
  setOriginalImage: (img: ImageData, w: number, h: number) => void;
  toggleEffect: (type: EffectType) => void;
  reorderEffects: (from: number, to: number) => void;
  updateParams: <K extends EffectType>(type: K, partial: Partial<EffectParams[K]>) => void;
  resetParams: <K extends EffectType>(type: K) => void;
  updateAdjustments: (partial: Partial<Adjustments>) => void;
  resetAdjustments: () => void;
  selectEffect: (type: EffectType | null) => void;
  setDestroyAmount: (v: number) => void;
  toggleLiveMode: () => void;
  processImage: () => void;
  undo: () => void;
  redo: () => void;
  savePreset: (name: string) => void;
  loadPreset: (preset: Preset) => void;
  deletePreset: (id: string) => void;
  // Media
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  processRawFrame: (src: ImageData) => ImageData;
  processGPU: (src: HTMLVideoElement | ImageData | HTMLCanvasElement, frameIdx?: number) => void;
  gpuReady: boolean;
  gpuFrameCount: number;
  setCanvasSizeOnly: (w: number, h: number) => void;
  setDisplayCanvas: (canvas: HTMLCanvasElement | null) => void;
  getDisplayCanvas: () => HTMLCanvasElement | null;
  setDirectResult: (img: ImageData) => void;
  setDirectSource: (img: ImageData, w: number, h: number) => void;
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => void;
  stopRecording: () => void;
  visualizerParams: VisualizerParams;
  updateVisualizerParams: (partial: Partial<VisualizerParams>) => void;
  pendingVideoUrl: { url: string; isGif: boolean } | null;
  setPendingVideoUrl: (v: { url: string; isGif: boolean } | null) => void;
  pendingAudioFile: File | null;
  setPendingAudioFile: (file: File | null) => void;
  randomize: () => void;
}

const LIVE_SPEEDS = { slow: 2400, normal: 1200, fast: 400 } as const;
export type LiveSpeed = keyof typeof LIVE_SPEEDS;

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const EFFECT_ORDER: EffectType[] = ['dither', 'ascii', 'brutalist', 'cybersigilism', 'thermal', 'nightvision', 'infrared', 'pointcloud', 'topo'];

// ─── Saved state loader ───────────────────────────────────────────────────────

type SavedState = { effects?: ActiveEffect[]; params?: EffectParams; adjustments?: Adjustments };
const savedState: SavedState = lsGet<SavedState>(LS_STATE) ?? {};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [originalImage, setOriginalImageState] = useState<ImageData | null>(null);
  const [resultImage, setResultImage] = useState<ImageData | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [effects, setEffects] = useState<ActiveEffect[]>(
    savedState.effects ?? EFFECT_ORDER.map((type, i) => ({ id: String(i), type, enabled: false }))
  );
  const [params, setParams] = useState<EffectParams>(savedState.params ?? defaultParams);
  const [adjustments, setAdjustments] = useState<Adjustments>(savedState.adjustments ?? defaultAdjustments);
  const [selectedEffect, setSelectedEffect] = useState<EffectType | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [destroyAmount, setDestroyAmount] = useState(0);
  const [liveMode, setLiveMode] = useState(false);
  const [liveSpeed, setLiveSpeed] = useState<LiveSpeed>('normal');
  const [livePhase, setLivePhase] = useState(0);
  const [gpuReady, setGpuReady] = useState(false);
  const [gpuFrameCount, setGpuFrameCount] = useState(0);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const _canvasSizeCacheRef = useRef({ width: 0, height: 0 });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [presets, setPresets] = useState<Preset[]>(() => lsGet<Preset[]>(LS_PRESETS) ?? []);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Media mode ──────────────────────────────────────────────────────────────
  const [appMode, setAppMode] = useState<AppMode>('image');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const defaultVisualizerParams: VisualizerParams = {
    mode:      'scope',
    color:     '#a855f7',
    color2:    '#06b6d4',
    bgColor:   '#080810',
    gain:      1.2,
    smooth:    0.82,
    lineWidth: 1.5,
    glow:      true,
    glowSize:  16,
    barCount:  96,
    decay:     0.12,
  };
  const [visualizerParams, setVisualizerParams] = useState<VisualizerParams>(defaultVisualizerParams);
  const updateVisualizerParams = useCallback((partial: Partial<VisualizerParams>) => {
    setVisualizerParams(prev => ({ ...prev, ...partial }));
  }, []);
  const [pendingVideoUrl, setPendingVideoUrl] = useState<{ url: string; isGif: boolean } | null>(null);
  const [pendingAudioFile, setPendingAudioFile] = useState<File | null>(null);

  // Undo/redo stacks (refs to avoid re-render cost)
  const undoStackRef = useRef<Snapshot[]>([]);
  const redoStackRef = useRef<Snapshot[]>([]);
  const currentStateRef = useRef<Snapshot>({ effects, params, adjustments });

  // Keep currentStateRef in sync
  useEffect(() => { currentStateRef.current = { effects, params, adjustments }; }, [effects, params, adjustments]);

  // Persist state to localStorage
  useEffect(() => { lsSet(LS_STATE, { effects, params, adjustments }); }, [effects, params, adjustments]);

  const captureHistory = useCallback(() => {
    undoStackRef.current = [...undoStackRef.current.slice(-49), { ...currentStateRef.current }];
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (!undoStackRef.current.length) return;
    const prev = undoStackRef.current.pop()!;
    redoStackRef.current.push({ ...currentStateRef.current });
    setEffects(prev.effects);
    setParams(prev.params);
    setAdjustments(prev.adjustments);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    if (!redoStackRef.current.length) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push({ ...currentStateRef.current });
    setEffects(next.effects);
    setParams(next.params);
    setAdjustments(next.adjustments);
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  // Presets
  const savePreset = useCallback((name: string) => {
    const preset: Preset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || 'Sans nom',
      effects: currentStateRef.current.effects,
      params: currentStateRef.current.params,
      adjustments: currentStateRef.current.adjustments,
      createdAt: Date.now(),
    };
    setPresets(prev => {
      const next = [...prev, preset];
      lsSet(LS_PRESETS, next);
      return next;
    });
  }, []);

  const loadPreset = useCallback((preset: Preset) => {
    captureHistory();
    setEffects(preset.effects);
    setParams(preset.params);
    setAdjustments(preset.adjustments);
  }, [captureHistory]);

  const deletePreset = useCallback((id: string) => {
    setPresets(prev => {
      const next = prev.filter(p => p.id !== id);
      lsSet(LS_PRESETS, next);
      return next;
    });
  }, []);

  // Live mode interval
  useEffect(() => {
    if (liveMode) {
      liveIntervalRef.current = setInterval(() => setLivePhase(p => p + 1), LIVE_SPEEDS[liveSpeed]);
    } else {
      if (liveIntervalRef.current !== null) {
        clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
    }
    return () => {
      if (liveIntervalRef.current !== null) {
        clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
    };
  }, [liveMode, liveSpeed]);

  const toggleLiveMode = useCallback(() => setLiveMode(v => !v), []);

  // Init GPU renderer once
  useEffect(() => {
    const ok = glRenderer.init();
    setGpuReady(ok);
    if (!ok) console.warn('WebGL2 not available — using CPU fallback');
  }, []);

  // CPU-heavy effects (ASCII, cybersigilism) throttled to max 15fps.
  // Non-GPU dither algos are mapped to the GPU Bayer shader instead of readback+CPU.
  const lastCpuMsRef = useRef(0);
  const lastCpuPatchRef = useRef<ImageData | null>(null); // cached last CPU result — no flicker
  const CPU_THROTTLE_MS = 66; // ~15fps

  // GPU process: upload source → run passes → blit synchronously to display canvas
  const processGPU = useCallback((src: HTMLVideoElement | ImageData | HTMLCanvasElement, frameIdx = 0) => {
    if (!glRenderer.ready) return;
    let ep = destroyAmount > 0 ? computeDestroyedParams(params, destroyAmount / 100) : params;
    if (liveMode) ep = applyLivePhase(ep, livePhase);

    // For non-GPU-capable dither algos, substitute with bayer4 so we never do
    // a CPU readback + error-diffusion loop at video resolution (would be 3-5fps).
    const ditherNeedsGpuFallback =
      effects.some(e => e.enabled && e.type === 'dither' && !ditherIsGpuCapable(ep.dither.algo));
    if (ditherNeedsGpuFallback) {
      ep = { ...ep, dither: { ...ep.dither, algo: 'bayer4' } };
    }

    // Adaptive preview downscaling: reduce GPU workload per pixel when stacking effects.
    // This runs at lower resolution but blits back to display at full size.
    const activeCount = effects.filter(e => e.enabled).length;
    const previewScale = activeCount >= 4 ? 0.5 : activeCount >= 3 ? 0.65 : activeCount >= 2 ? 0.8 : 1;
    glRenderer.setPreviewScale(previewScale);

    glRenderer.uploadSource(src);
    glRenderer.process(effects, ep, adjustments, frameIdx);
    // CPU-only effects: ASCII, cybersigilism — throttled to 15fps max
    const now = performance.now();
    const reversedEffects = [...effects].reverse();
    const hasCpuEffect = reversedEffects.some(e => e.enabled && (
      e.type === 'ascii' || e.type === 'cybersigilism'
    ));
    if (hasCpuEffect) {
      if ((now - lastCpuMsRef.current) >= CPU_THROTTLE_MS) {
        lastCpuMsRef.current = now;
        for (const effect of reversedEffects) {
          if (!effect.enabled) continue;
          if (effect.type === 'ascii' || effect.type === 'cybersigilism') {
            const frame = glRenderer.readback();
            const result = effect.type === 'ascii'
              ? applyAscii(frame, ep.ascii)
              : applyCybersigilismSync(frame, ep.cybersigilism);
            lastCpuPatchRef.current = result;
            glRenderer.patchWithImageData(result);
          }
        }
      } else if (lastCpuPatchRef.current) {
        // Re-apply cached CPU result so the display doesn't flicker back to GPU-only
        glRenderer.patchWithImageData(lastCpuPatchRef.current);
      }
    }

    // Blit synchronously to display canvas — zero React state updates per frame
    if (displayCanvasRef.current && !glRenderer.skipBlit) {
      glRenderer.blit(displayCanvasRef.current);
    }
    // Only signal React on the very first frame (DropZone → Canvas transition)
    // When skipBlit is active (B/A mode), always increment so Canvas redraws the split
    setGpuFrameCount(n => (glRenderer.skipBlit ? n + 1 : n === 0 ? 1 : n));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effects, params, adjustments, destroyAmount, liveMode, livePhase]);

  const setCanvasSizeOnly = useCallback((w: number, h: number) => {
    if (_canvasSizeCacheRef.current.width !== w || _canvasSizeCacheRef.current.height !== h) {
      _canvasSizeCacheRef.current = { width: w, height: h };
      setCanvasSize({ width: w, height: h });
    }
  }, []);

  const setDisplayCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    displayCanvasRef.current = canvas;
  }, []);
  const getDisplayCanvas = useCallback(() => displayCanvasRef.current, []);

  // ─── processRawFrame (re-created when processing deps change) ──────────────
  const processRawFrame = useCallback((src: ImageData): ImageData => {
    let ep = destroyAmount > 0 ? computeDestroyedParams(params, destroyAmount / 100) : params;
    if (liveMode) ep = applyLivePhase(ep, livePhase);
    let data: ImageData = applyAdjustments(src, adjustments);
    for (const effect of [...effects].reverse()) {
      if (!effect.enabled) continue;
      switch (effect.type) {
        case 'dither':         data = applyDither(data, ep.dither); break;
        case 'ascii':          data = applyAscii(data, ep.ascii); break;
        case 'brutalist':      data = applyBrutalist(data, ep.brutalist); break;
        case 'cybersigilism':  data = applyCybersigilismSync(data, ep.cybersigilism); break;
        case 'thermal':        data = applyThermal(data, ep.thermal); break;
        case 'nightvision':    data = applyNightVision(data, ep.nightvision); break;
        case 'infrared':       data = applyInfrared(data, ep.infrared); break;
        case 'pointcloud':     data = applyPointCloud(data, ep.pointcloud); break;
        case 'topo':           data = applyTopo(data, ep.topo); break;
      }
    }
    return data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effects, params, adjustments, destroyAmount, liveMode, livePhase]);

  const setDirectResult = useCallback((img: ImageData) => {
    setResultImage(img);
  }, []);

  const setDirectSource = useCallback((img: ImageData, w: number, h: number) => {
    setOriginalImageState(img);
    setCanvasSize({ width: w, height: h });
  }, []);

  // Mirror resultImage to recording canvas
  useEffect(() => {
    if (!isRecording || !resultImage) return;
    const canvas = recordingCanvasRef.current;
    if (canvas.width !== resultImage.width || canvas.height !== resultImage.height) {
      canvas.width = resultImage.width;
      canvas.height = resultImage.height;
    }
    const ctx = canvas.getContext('2d');
    ctx?.putImageData(resultImage, 0, 0);
  }, [resultImage, isRecording]);

  const startRecording = useCallback(() => {
    if (!resultImage) return;
    const canvas = recordingCanvasRef.current;
    canvas.width = resultImage.width;
    canvas.height = resultImage.height;
    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const d = new Date();
      const ts = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
      a.download = `gme_${ts}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };
    recorder.start(100);
    recorderRef.current = recorder;
    setIsRecording(true);
    setRecordingDuration(0);
    recTimerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
  }, [resultImage]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    if (recTimerRef.current !== null) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  // Shared processing logic
  const runProcess = useCallback((delay: number) => {
    if (!originalImage) return () => {};
    setIsProcessing(true);
    const t0 = performance.now();
    const timer = setTimeout(() => {
      let ep = destroyAmount > 0 ? computeDestroyedParams(params, destroyAmount / 100) : params;
      if (liveMode) ep = applyLivePhase(ep, livePhase);
      // Apply pre-effect adjustments (brightness/contrast/saturation/gamma)
      let data: ImageData = applyAdjustments(originalImage, adjustments);
      for (const effect of effects) {
        if (!effect.enabled) continue;
        switch (effect.type) {
          case 'dither':         data = applyDither(data, ep.dither); break;
          case 'ascii':          data = applyAscii(data, ep.ascii); break;
          case 'brutalist':      data = applyBrutalist(data, ep.brutalist); break;
          case 'cybersigilism':  data = applyCybersigilismSync(data, ep.cybersigilism); break;
          case 'thermal':        data = applyThermal(data, ep.thermal); break;
          case 'nightvision':    data = applyNightVision(data, ep.nightvision); break;
          case 'infrared':       data = applyInfrared(data, ep.infrared); break;
          case 'pointcloud':     data = applyPointCloud(data, ep.pointcloud); break;
          case 'topo':           data = applyTopo(data, ep.topo); break;
        }
      }
      setResultImage(data);
      setIsProcessing(false);
      setProcessingTime(Math.round(performance.now() - t0));
    }, delay);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalImage, effects, params, adjustments, destroyAmount, liveMode, livePhase]);

  // Params/effects/image/adjustments changes → 150ms debounce (image mode only)
  useEffect(() => {
    if (appMode !== 'image') return;
    return runProcess(150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalImage, effects, params, adjustments, destroyAmount, appMode]);

  // Live phase tick → immediate (image mode only)
  useEffect(() => {
    if (!liveMode || appMode !== 'image') return;
    return runProcess(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePhase, appMode]);

  const setOriginalImage = useCallback((img: ImageData, w: number, h: number) => {
    setOriginalImageState(img);
    setResultImage(img);
    setCanvasSize({ width: w, height: h });
  }, []);

  const toggleEffect = useCallback((type: EffectType) => {
    captureHistory();
    setEffects(prev => prev.map(e => e.type === type ? { ...e, enabled: !e.enabled } : e));
  }, [captureHistory]);

  const reorderEffects = useCallback((from: number, to: number) => {
    captureHistory();
    setEffects(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, [captureHistory]);

  const updateParams = useCallback(<K extends EffectType>(type: K, partial: Partial<EffectParams[K]>) => {
    captureHistory();
    setParams(prev => ({ ...prev, [type]: { ...prev[type], ...partial } }));
  }, [captureHistory]);


  const resetParams = useCallback(<K extends EffectType>(type: K) => {
    captureHistory();
    setParams(prev => ({ ...prev, [type]: defaultParams[type] }));
  }, [captureHistory]);

  const updateAdjustments = useCallback((partial: Partial<Adjustments>) => {
    captureHistory();
    setAdjustments(prev => ({ ...prev, ...partial }));
  }, [captureHistory]);

  const resetAdjustments = useCallback(() => {
    captureHistory();
    setAdjustments(defaultAdjustments);
  }, [captureHistory]);

  const selectEffect = useCallback((type: EffectType | null) => {
    setSelectedEffect(type);
  }, []);

  const randomize = useCallback(() => {
    captureHistory();
    setEffects(randomEffects());
    setParams(randomParams());
    setAdjustments(randomAdjustments());
  }, [captureHistory]);

  // No-op kept for API compatibility (processing handled by useEffect above)
  const processImage = useCallback(() => {
  }, []);

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey && e.code === 'KeyY') || (e.ctrlKey && e.shiftKey && e.code === 'KeyZ')) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return (
    <AppContext.Provider value={{
      originalImage,
      resultImage,
      canvasSize,
      effects,
      params,
      adjustments,
      selectedEffect,
      isProcessing,
      processingTime,
      destroyAmount,
      liveMode,
      liveSpeed,
      canUndo,
      canRedo,
      presets,
      setLiveSpeed,
      setOriginalImage,
      toggleEffect,
      reorderEffects,
      updateParams,
      resetParams,
      updateAdjustments,
      resetAdjustments,
      selectEffect,
      setDestroyAmount,
      toggleLiveMode,
      processImage,
      undo,
      redo,
      savePreset,
      loadPreset,
      deletePreset,
      appMode,
      setAppMode,
      processRawFrame,
      processGPU,
      gpuReady,
      gpuFrameCount,
      setCanvasSizeOnly,
      setDisplayCanvas,
      getDisplayCanvas,
      setDirectResult,
      setDirectSource,
      isRecording,
      recordingDuration,
      startRecording,
      stopRecording,
      visualizerParams,
      updateVisualizerParams,
      pendingVideoUrl,
      setPendingVideoUrl,
      pendingAudioFile,
      setPendingAudioFile,
      randomize,
    }}>
      {children}
    </AppContext.Provider>
  );
}
