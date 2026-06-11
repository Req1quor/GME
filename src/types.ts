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
  glitch: boolean;
  glitchIntensity: number;
  glitchSeed: number;
  chromaticAberration: boolean;
  chromaticAmount: number;    // 1–20 px
  scanlines: boolean;
  scanlineIntensity: number;  // 0–1
  grid: boolean;
  gridSpacing: number;
  gridOpacity: number;
  noise: boolean;
  noiseAmount: number;        // 0–100 grain intensity
}

export interface HalftoneParams {
  angle: number;              // 0–45 screen angle
  gridSize: number;           // 2–40px dot pitch
  mode: 'mono' | 'cmyk' | 'rgb' | 'custom';
  dotShape: 'circle' | 'ellipse' | 'line' | 'diamond';
  invert: boolean;
  bgColor: string;
  fgColor: string;
  gamma: number;              // 0.5–3.0
  blendOriginal: number;      // 0–100
  softEdge: boolean;
  contrast: number;           // -50 to 50
  brightness: number;         // -50 to 50
}

export interface MatrixRainParams {
  chars: string;
  fontSize: number;           // 6–32
  speed: number;              // 0.5–5 fall speed
  density: number;            // 20–100 column density %
  color: string;
  bgColor: string;
  bgOpacity: number;          // 0–1
  trailLength: number;        // 0.1–0.98 persistence
  glowEffect: boolean;
  colorVariance: number;      // 0–1 hue range
  seed: number;
}

export interface DotsParams {
  gridType: 'square' | 'hex' | 'triangular' | 'random';
  dotSize: number;            // 1–30px
  spacing: number;            // 2–40px
  colorMode: 'original' | 'mono' | 'accent' | 'gradient';
  accentColor: string;
  bgColor: string;
  dotShape: 'circle' | 'square' | 'star' | 'ring';
  invert: boolean;
  sizeByLum: boolean;
  opacity: number;            // 0–100
  angle: number;              // 0–90 grid rotation
  jitter: number;             // 0–1
  minSize: number;
}

export interface ContourParams {
  mode: 'sobel' | 'laplacian' | 'canny';
  threshold: number;          // 10–255
  lineColor: string;
  bgColor: string;
  bgTransparent: boolean;
  lineWidth: number;
  smooth: boolean;
  smoothRadius: number;       // 0–5
  colorize: boolean;
  colorA: string;
  colorB: string;
  blendOriginal: number;
  invertEdges: boolean;
}

export interface PixelSortParams {
  axis: 'horizontal' | 'vertical' | 'both';
  threshold: number;          // 0–255
  mode: 'luminance' | 'hue' | 'saturation' | 'red' | 'green' | 'blue';
  direction: 'ascending' | 'descending';
  segmented: boolean;
  blendOriginal: number;
  chunkSize: number;          // 10–9999 max sort segment
  skipChance: number;         // 0–1
}

export interface BlockifyParams {
  blockSize: number;          // 4–64px
  samplingMode: 'center' | 'average' | 'random';
  colorMode: 'original' | 'quantize' | 'palette';
  levels: number;             // 2–32 quantization
  edgeHighlight: boolean;
  edgeColor: string;
  edgeWidth: number;
  roundCorners: boolean;
  cornerRadius: number;       // 0–0.5 fraction
  blendOriginal: number;
}

export interface ThresholdEffectParams {
  mode: 'binary' | 'adaptive' | 'multi' | 'duotone';
  threshold: number;          // 0–255
  adaptiveRadius: number;     // 1–30
  adaptiveOffset: number;     // -100 to 100
  levels: number;             // 2–8 multi
  colorA: string;
  colorB: string;
  colorC: string;
  invert: boolean;
  blendOriginal: number;
}

export interface EdgeDetectionParams {
  algorithm: 'sobel' | 'prewitt' | 'laplacian' | 'roberts';
  threshold: number;          // 0–255
  mode: 'on-black' | 'on-white' | 'on-original' | 'colored';
  edgeColor: string;
  bgColor: string;
  lineWidth: number;
  invert: boolean;
  blendOriginal: number;
  colorByAngle: boolean;
  luminanceOnly: boolean;
}

export interface CrosshatchParams {
  layers: number;             // 1–4
  angle1: number;             // 0–180
  angle2: number;
  angle3: number;
  angle4: number;
  spacing: number;            // 2–30
  lineWidth: number;          // 0.5–3
  color: string;
  bgColor: string;
  bgTransparent: boolean;
  lumDriven: boolean;
  minSpacing: number;
  maxSpacing: number;
  blendOriginal: number;
  contrast: number;
}

export interface WaveLinesParams {
  waveType: 'sine' | 'noise' | 'square' | 'sawtooth' | 'combined';
  lineCount: number;          // 10–200
  amplitude: number;          // 0–150 px
  frequency: number;          // 0.5–20
  lineWidth: number;          // 0.5–5
  color: string;
  bgColor: string;
  bgTransparent: boolean;
  colorMode: 'solid' | 'gradient' | 'fromImage';
  gradientA: string;
  gradientB: string;
  lumDriven: boolean;
  phase: number;              // 0–360
  noiseScale: number;
  blendOriginal: number;
  invert: boolean;
}

export interface NoiseFieldParams {
  noiseType: 'value' | 'fractal' | 'domain-warp';
  scale: number;              // 0.5–20
  octaves: number;            // 1–8
  persistence: number;        // 0.1–1.0
  lacunarity: number;         // 1.5–4.0
  brightness: number;
  contrast: number;
  colorMode: 'grayscale' | 'heatmap' | 'plasma' | 'custom';
  colorA: string;
  colorB: string;
  blendOriginal: number;
  blendMode: 'normal' | 'screen' | 'multiply' | 'overlay';
  seed: number;
  offsetX: number;            // for live/audio animation
  offsetY: number;
}

export interface VoronoiParams {
  cellCount: number;          // 4–200
  mode: 'fill' | 'edges' | 'edges-fill' | 'points';
  colorMode: 'fromImage' | 'random' | 'gradient' | 'mono';
  edgeColor: string;
  edgeWidth: number;
  bgColor: string;
  seed: number;
  jitter: number;             // 0–1
  gradientA: string;
  gradientB: string;
  blendOriginal: number;
  distanceMetric: 'euclidean' | 'manhattan' | 'chebyshev';
}

export interface VhsParams {
  tracking: number;           // 0–100
  colorBleed: number;         // 0–50 chroma smear px
  ghosting: number;           // 0–50 ghost offset px
  scanlineIntensity: number;  // 0–1
  noiseAmount: number;        // 0–100
  hSync: number;              // 0–100 horizontal sync
  luma: number;               // 0–100 washout
  saturation: number;         // 50–200
  tapeSpeed: 'SP' | 'LP' | 'EP';
  rgbOffset: boolean;
  rgbOffsetAmount: number;    // 1–20
  blendOriginal: number;
  static: number;             // 0–100
}

// Audio analysis data — passed to effects each frame when audio is active
export interface AudioAnalysisData {
  bass: number;         // 0–1  energy 0–200 Hz
  mid: number;          // 0–1  energy 200–2000 Hz
  treble: number;       // 0–1  energy 2000+ Hz
  amplitude: number;    // 0–1  overall RMS amplitude
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

export type EffectType =
  | 'dither' | 'ascii' | 'brutalist' | 'cybersigilism'
  | 'thermal' | 'nightvision' | 'infrared'
  | 'pointcloud' | 'topo'
  // New effects
  | 'halftone' | 'matrix-rain' | 'dots' | 'contour'
  | 'pixel-sort' | 'blockify' | 'threshold-effect' | 'edge-detection'
  | 'crosshatch' | 'wave-lines' | 'noise-field' | 'voronoi' | 'vhs';

export type EffectCategory = 'analog' | 'glitch' | 'art' | 'print' | 'structure' | 'sculpt';

export const EFFECT_CATEGORIES: Record<EffectType, EffectCategory> = {
  thermal: 'analog', nightvision: 'analog', infrared: 'analog', vhs: 'analog',
  brutalist: 'glitch', 'pixel-sort': 'glitch', blockify: 'glitch',
  ascii: 'art', cybersigilism: 'art', 'matrix-rain': 'art', 'wave-lines': 'art', 'noise-field': 'art',
  dither: 'print', halftone: 'print', dots: 'print', crosshatch: 'print',
  contour: 'structure', 'edge-detection': 'structure', 'threshold-effect': 'structure', topo: 'structure', voronoi: 'structure',
  pointcloud: 'sculpt',
};

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
  halftone: HalftoneParams;
  'matrix-rain': MatrixRainParams;
  dots: DotsParams;
  contour: ContourParams;
  'pixel-sort': PixelSortParams;
  blockify: BlockifyParams;
  'threshold-effect': ThresholdEffectParams;
  'edge-detection': EdgeDetectionParams;
  crosshatch: CrosshatchParams;
  'wave-lines': WaveLinesParams;
  'noise-field': NoiseFieldParams;
  voronoi: VoronoiParams;
  vhs: VhsParams;
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
export type VizMode = 'bars' | 'scope' | 'spectrogram' | 'rings' | 'mirror' | 'storm' | 'flux' | 'vortex' | 'attractor' | 'petals' | 'scape' | 'weave';

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
