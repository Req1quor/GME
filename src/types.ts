export type DitherAlgo =
  // Error diffusion — classic
  | 'floyd-steinberg'
  | 'atkinson'
  | 'jarvis'
  | 'stucki'
  | 'sierra'
  | 'sierra-lite'
  | 'simple2d'
  // Error diffusion — extended
  | 'burkes'
  | 'sierra-2row'
  | 'fake-floyd'
  | 'shiau-fan-1'
  | 'shiau-fan-2'
  | 'shiau-fan-3'
  | 'stevenson-arce'
  | 'diagonal-diffusion'
  // Ordered — Bayer
  | 'bayer2'
  | 'bayer3'
  | 'bayer4'
  | 'bayer8'
  | 'bayer16'
  | 'bayer32'
  // Ordered — Clustered dot
  | 'clustered-4'
  | 'clustered-6'
  | 'clustered-8'
  // Ordered — Dispersed
  | 'dispersed-2x2'
  | 'dispersed-4x4'
  // Ordered — Special
  | 'interleaved-gradient'
  | 'void-dispersed'
  | 'ulichney-bd'
  | 'white-point-c'
  | 'white-point-b'
  // Pattern
  | 'pattern-2x2'
  | 'pattern-3x3'
  | 'pattern-4x4'
  | 'pattern-5x2'
  // Noise / Analog
  | 'random'
  | 'bluenoise'
  | 'halftone'
  // Threshold & Special
  | 'threshold'
  | 'hilbert';

export interface DitherParams {
  algo: DitherAlgo;
  paletteSize: number;
  palette: string[];        // hex colors, empty = auto grayscale
  intensity: number;        // 0–2, threshold amplitude multiplier (Bayer/noise)
  bias: number;             // 0–1, 0.5 = neutral; <0.5 darker, >0.5 lighter
  gammaCorrect: boolean;    // sRGB↔linear conversion around quantization
  blendOriginal: number;    // 0–100, mix with source image
  hueShift: number;         // -180 to 180
  saturation: number;       // 0–200 (100 = neutral)
  monoMode: boolean;        // force grayscale output
}

export interface AsciiParams {
  charSize: number;
  charset: string;
  colored: boolean;
  bgColor: string;                          // background fill color
  bgOpacity: number;                        // 0=transparent (shows original), 1=solid
  contrast: number;                         // -100 to 100
  brightness: number;                       // -100 to 100
  invert: boolean;                          // flip brightness→char mapping
  cellAspect: number;                       // 0.3–1.0 (0.55 = square visual cells)
  samplingMode: 'center' | 'average';       // center pixel vs cell average
  fontFamily: string;
}

export interface BrutalistParams {
  posterize: boolean;
  posterizeLevels: number;
  threshold: boolean;
  thresholdValue: number;
  glitch: boolean;
  glitchIntensity: number;
  grid: boolean;
  gridSpacing: number;
  gridOpacity: number;
  // New
  edgeDetect: boolean;
  edgeThreshold: number;      // 0–255
  edgeColor: string;          // hex
  chromaticAberration: boolean;
  chromaticAmount: number;    // 1–20 px
  scanlines: boolean;
  scanlineIntensity: number;  // 0–1
  pixelSort: boolean;
  pixelSortAxis: 'horizontal' | 'vertical';
  pixelSortThreshold: number; // luminance threshold 0–255
  glitchSeed: number;         // vary glitch pattern
  noise: boolean;
  noiseAmount: number;        // 0–100 grain intensity
}

export interface CybersigilismParams {
  seed: number;
  complexity: number;       // 4–30 — node count
  scale: number;            // 0.5–3.0
  opacity: number;          // 0–1
  color: string;            // hex stroke/fill color
  strokeWidth: number;      // 0.5–3
  symmetry: 'none' | 'vertical' | 'horizontal' | 'quad';
  angularity: number;       // 0–1, 0=curves, 1=only orthogonal
  bgFill: boolean;          // fill canvas black before drawing
  fillShapes: boolean;      // fill some closed shapes with color at low opacity
  lineVariance: boolean;    // mix thin (0.5px) and thick (1.5px) strokes
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'hard-light';
  glow: boolean;            // neon glow via shadowBlur
  glowSize: number;         // shadowBlur radius
}

export type EffectType = 'dither' | 'ascii' | 'brutalist' | 'cybersigilism' | 'thermal' | 'nightvision' | 'infrared' | 'pointcloud' | 'topo';

export interface ActiveEffect {
  id: string;
  type: EffectType;
  enabled: boolean;
}

export interface EffectParams {
  dither: DitherParams;
  ascii: AsciiParams;
  brutalist: BrutalistParams;
  cybersigilism: CybersigilismParams;
  thermal: import('./effects/thermal').ThermalParams;
  nightvision: import('./effects/nightvision').NightVisionParams;
  infrared: import('./effects/infrared').InfraredParams;
  pointcloud: import('./effects/pointcloud').PointCloudParams;
  topo: import('./effects/topo').TopoParams;
}

export interface Adjustments {
  brightness: number;   // -100 to +100, default 0
  contrast: number;     // -100 to +100, default 0
  saturation: number;   // 0 to 200, default 100
  gamma: number;        // 0.2 to 3.0, default 1.0
}

export interface Preset {
  id: string;
  name: string;
  effects: ActiveEffect[];
  params: EffectParams;
  adjustments: Adjustments;
  createdAt: number;
}

// ─── Media modes ──────────────────────────────────────────────────────────────

export type AppMode = 'image' | 'video' | 'audio' | 'webcam';

/** 6 visualizer modes, each with a distinct visual identity */
export type VizMode = 'scope' | 'spectrum' | 'radial' | 'tunnel' | 'glitch' | 'chroma';

export interface VisualizerParams {
  mode: VizMode;
  color: string;       // primary accent color (hex)
  color2: string;      // secondary color (gradient / chroma channels)
  bgColor: string;     // background color (hex)
  gain: number;        // amplitude multiplier 0.3–4.0
  smooth: number;      // analyser.smoothingTimeConstant 0–0.95
  lineWidth: number;   // stroke width 0.5–6
  glow: boolean;       // bloom / shadowBlur
  glowSize: number;    // blur radius 2–40
  barCount: number;    // freq resolution for spectrum / radial 16–256
  decay: number;       // trail persistence factor 0.03–0.5 (lower = longer trail)
}
