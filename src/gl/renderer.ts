/**
 * WebGL2 GPU renderer — ping-pong FBO pipeline.
 * All heavy image effects run as GLSL fragment shader passes on the GPU.
 * The renderer is a module-level singleton; init() must be called once.
 */

import {
  VS, FS_PASSTHROUGH, FS_ADJUSTMENTS, FS_THERMAL,
  FS_NIGHTVISION, FS_INFRARED, FS_BAYER, FS_BRUTALIST,
  FS_TOPO, FS_POINTCLOUD,
  FS_HALFTONE, FS_BLOCKIFY, FS_THRESHOLD_EFFECT, FS_EDGE_DETECTION, FS_VHS, FS_CONTOUR,
} from './shaders';
import type { ActiveEffect, EffectParams, Adjustments, DitherAlgo } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToVec3(hex: string): [number, number, number] {
  const v = parseInt((hex ?? '#000000').replace('#', ''), 16);
  return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
}

// Dither algo → Bayer bits mapping (GPU-capable algos only)
const BAYER_BITS: Partial<Record<DitherAlgo, number>> = {
  threshold: 0, random: -1,
  bayer2: 1, bayer3: 2, bayer4: 2, bayer8: 3, bayer16: 4, bayer32: 5,
  'clustered-4': 2, 'clustered-6': 2, 'clustered-8': 3,
  'dispersed-2x2': 1, 'dispersed-4x4': 2,
  'interleaved-gradient': 3, 'void-dispersed': 3, halftone: 2,
  'pattern-2x2': 1, 'pattern-3x3': 2, 'pattern-4x4': 2, 'pattern-5x2': 2,
};

export function ditherIsGpuCapable(algo: DitherAlgo): boolean {
  return algo in BAYER_BITS;
}

// Thermal palette LUT data (mirrors thermal.ts, kept local to avoid circular dep)
const THERMAL_PALETTES: Record<string, number[][]> = {
  iron:    [[0,0,0],[30,0,80],[80,0,160],[160,0,140],[220,30,0],[255,100,0],[255,200,0],[255,255,180]],
  plasma:  [[13,8,135],[84,2,163],[139,10,165],[185,50,137],[219,92,104],[244,136,73],[254,188,43],[240,249,33]],
  thermal: [[0,0,80],[0,60,180],[0,180,200],[0,240,80],[160,240,0],[255,200,0],[255,80,0],[255,0,0],[255,200,200]],
  cool:    [[0,0,0],[0,0,80],[0,30,180],[0,120,255],[0,220,240],[80,255,200],[180,255,160],[255,255,255]],
  spectrum:[[60,0,180],[100,0,220],[0,50,255],[0,200,200],[0,240,80],[200,255,0],[255,200,0],[255,80,0],[200,0,0]],
  inferno: [[0,0,4],[40,11,84],[101,21,110],[159,42,99],[212,72,66],[245,125,21],[250,193,39],[252,255,164]],
  rainbow: [[148,0,211],[75,0,130],[0,0,255],[0,128,0],[255,255,0],[255,127,0],[255,0,0]],
  greys:   [[0,0,0],[255,255,255]],
  viridis: [[68,1,84],[72,40,120],[62,83,161],[49,124,183],[38,166,173],[53,183,121],[110,206,88],[180,222,44],[253,231,37]],
  magma:   [[0,0,4],[28,16,68],[79,18,123],[129,37,129],[181,54,122],[229,89,104],[251,143,96],[254,201,141],[252,253,191]],
};

function buildThermalLut(paletteName: string): Uint8Array {
  const stops = THERMAL_PALETTES[paletteName] ?? THERMAL_PALETTES.iron;
  const lut = new Uint8Array(256 * 4);
  const n = stops.length - 1;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const fi = Math.min(t * n, n - 1 - 1e-6);
    const si = Math.floor(fi);
    const f = fi - si;
    const a = stops[si], b = stops[si + 1];
    lut[i * 4 + 0] = Math.round(a[0] + (b[0] - a[0]) * f);
    lut[i * 4 + 1] = Math.round(a[1] + (b[1] - a[1]) * f);
    lut[i * 4 + 2] = Math.round(a[2] + (b[2] - a[2]) * f);
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

// ─── InfraredStyle → int ─────────────────────────────────────────────────────
const IR_STYLE: Record<string, number> = {
  aerochrome: 0, ektachrome: 1, 'kodak-hie': 2, digital: 3, 'false-color': 4,
};

// ─── GlRenderer singleton ─────────────────────────────────────────────────────

class GlRenderer {
  canvas!: HTMLCanvasElement; // the offscreen GL canvas
  private gl!: WebGL2RenderingContext;
  private progs = new Map<string, WebGLProgram>();
  private ulCache = new Map<string, Map<string, WebGLUniformLocation | null>>();
  private vao!: WebGLVertexArrayObject;

  // Ping-pong: texs[ping] is the current source, texs[1-ping] is the render target
  private texs!: [WebGLTexture, WebGLTexture];
  private fbos!: [WebGLFramebuffer, WebGLFramebuffer];
  private ping: 0 | 1 = 0;

  // LUT texture (for thermal)
  private lutTex!: WebGLTexture;
  private lutPalette = '';

  private _w = 0;
  private _h = 0;
  private _srcW = 0; // original source dimensions (before preview scaling)
  private _srcH = 0;
  private _previewScale = 1;
  private _scaleCanvas: HTMLCanvasElement | null = null;
  private _ready = false;
  skipBlit = false; // when true, processGPU skips blitting (used by B/A mode)

  get ready() { return this._ready; }
  get width()  { return this._srcW || this._w; }
  get height() { return this._srcH || this._h; }

  // Set preview downscale factor (0.25–1). Lower = faster rendering, blurrier preview.
  setPreviewScale(scale: number) {
    this._previewScale = Math.max(0.25, Math.min(1, scale));
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  init(): boolean {
    if (this._ready) return true;

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true, // needed for drawImage from 2D canvas
    });
    if (!gl) { console.warn('GlRenderer: WebGL2 not supported'); return false; }

    this.canvas = canvas;
    this.gl = gl;

    // Fullscreen quad VAO
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Compile programs
    const shaderDefs: [string, string][] = [
      ['passthrough',       FS_PASSTHROUGH],
      ['adjustments',       FS_ADJUSTMENTS],
      ['thermal',           FS_THERMAL],
      ['nightvision',       FS_NIGHTVISION],
      ['infrared',          FS_INFRARED],
      ['bayer',             FS_BAYER],
      ['brutalist',         FS_BRUTALIST],
      ['topo',              FS_TOPO],
      ['pointcloud',        FS_POINTCLOUD],
      ['halftone',          FS_HALFTONE],
      ['blockify',          FS_BLOCKIFY],
      ['threshold-effect',  FS_THRESHOLD_EFFECT],
      ['edge-detection',    FS_EDGE_DETECTION],
      ['vhs',               FS_VHS],
      ['contour',           FS_CONTOUR],
    ];
    for (const [key, fs] of shaderDefs) {
      const prog = this._compile(VS, fs);
      if (!prog) { console.error(`GlRenderer: compile failed for "${key}"`); return false; }
      this.progs.set(key, prog);
    }

    // Ping-pong textures + FBOs
    this.texs = [this._makeTex(), this._makeTex()];
    this.fbos = [this._makeFbo(this.texs[0]), this._makeFbo(this.texs[1])];

    // LUT texture (1D-ish, 256×1)
    this.lutTex = this._makeTex();
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    this._ready = true;
    return true;
  }

  // ── Compile ────────────────────────────────────────────────────────────────

  private _compile(vsrc: string, fsrc: string): WebGLProgram | null {
    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('VS error:', gl.getShaderInfoLog(vs)); return null;
    }
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('FS error:', gl.getShaderInfoLog(fs)); return null;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('LINK error:', gl.getProgramInfoLog(prog)); return null;
    }
    return prog;
  }

  // ── Texture / FBO factories ────────────────────────────────────────────────

  private _makeTex(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private _makeFbo(tex: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  // ── Resize internal buffers ────────────────────────────────────────────────

  private _resize(w: number, h: number) {
    if (this._w === w && this._h === h) return;
    this._w = w; this._h = h;
    this.canvas.width = w; this.canvas.height = h;
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    for (const tex of this.texs) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
  }

  // ── Uniform location cache ─────────────────────────────────────────────────

  private _ul(key: string, prog: WebGLProgram, name: string): WebGLUniformLocation | null {
    let c = this.ulCache.get(key);
    if (!c) { c = new Map(); this.ulCache.set(key, c); }
    if (!c.has(name)) c.set(name, this.gl.getUniformLocation(prog, name));
    return c.get(name) ?? null;
  }

  // ── Upload source ──────────────────────────────────────────────────────────

  uploadSource(src: HTMLVideoElement | ImageData | HTMLCanvasElement | HTMLImageElement) {
    if (!this._ready) return;
    const gl = this.gl;
    let srcW: number, srcH: number;
    if (src instanceof ImageData) {
      srcW = src.width; srcH = src.height;
    } else if (src instanceof HTMLVideoElement) {
      srcW = src.videoWidth; srcH = src.videoHeight;
    } else {
      srcW = (src as HTMLCanvasElement).width; srcH = (src as HTMLCanvasElement).height;
    }
    if (!srcW || !srcH) return;

    this._srcW = srcW;
    this._srcH = srcH;

    // Downscale for preview if scale < 1 and source is a TexImageSource (not ImageData)
    let uploadSrc: HTMLVideoElement | ImageData | HTMLCanvasElement | HTMLImageElement = src;
    let w = srcW, h = srcH;
    if (this._previewScale < 1 && !(src instanceof ImageData)) {
      w = Math.max(1, Math.round(srcW * this._previewScale));
      h = Math.max(1, Math.round(srcH * this._previewScale));
      if (!this._scaleCanvas) this._scaleCanvas = document.createElement('canvas');
      if (this._scaleCanvas.width !== w || this._scaleCanvas.height !== h) {
        this._scaleCanvas.width = w;
        this._scaleCanvas.height = h;
      }
      const sCtx = this._scaleCanvas.getContext('2d')!;
      sCtx.drawImage(src as CanvasImageSource, 0, 0, w, h);
      uploadSrc = this._scaleCanvas;
    }

    this._resize(w, h);

    // Upload to texs[0]
    gl.bindTexture(gl.TEXTURE_2D, this.texs[0]);
    if (uploadSrc instanceof ImageData) {
      // 9-param overload: ArrayBufferView — UNPACK_FLIP_Y has no effect here, data is already GL convention
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, uploadSrc.data);
    } else {
      // 6-param overload for TexImageSource: video/canvas Y=0 is at top, GL Y=0 is at bottom → must flip
      // Use RGBA8 (sized) so the FBO attachment stays complete after this call
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, uploadSrc as TexImageSource);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
    this.ping = 0;
  }

  // ── Single pass helper ────────────────────────────────────────────────────

  private _runPass(
    key: string,
    setUniforms: (prog: WebGLProgram) => void,
    dstFbo: WebGLFramebuffer | null = null,
    srcTex?: WebGLTexture,
  ) {
    const gl = this.gl;
    const prog = this.progs.get(key)!;
    const dst = dstFbo !== null ? dstFbo : this.fbos[1 - this.ping as 0 | 1];
    const src = srcTex ?? this.texs[this.ping];

    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo !== undefined ? dstFbo : dst);
    gl.viewport(0, 0, this._w, this._h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(this._ul(key, prog, 'u_tex'), 0);
    setUniforms(prog);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  // Ping-pong: run a pass from current ping to the other FBO, then flip
  private _pass(key: string, setUniforms: (prog: WebGLProgram) => void) {
    const dst = 1 - this.ping as 0 | 1;
    this._runPass(key, setUniforms, this.fbos[dst], this.texs[this.ping]);
    this.ping = dst;
  }

  // ── Effect passes ──────────────────────────────────────────────────────────

  private _runAdjustments(adj: Adjustments) {
    if (adj.brightness === 0 && adj.contrast === 0 && adj.saturation === 100 && adj.gamma === 1.0) return;
    const key = 'adjustments';
    const gl = this.gl;
    this._pass(key, (prog) => {
      gl.uniform1f(this._ul(key, prog, 'u_brightness'), adj.brightness / 100);
      gl.uniform1f(this._ul(key, prog, 'u_contrast'), (100 + adj.contrast) / 100);
      gl.uniform1f(this._ul(key, prog, 'u_saturation'), adj.saturation / 100);
      gl.uniform1f(this._ul(key, prog, 'u_gamma'), adj.gamma);
    });
  }

  private _runDither(p: EffectParams['dither']) {
    const bits = BAYER_BITS[p.algo];
    if (bits === undefined) return; // non-GPU algo, skip
    const key = 'bayer';
    const gl = this.gl;
    // Build palette array (up to 32 vec3)
    const flatPal = new Float32Array(32 * 3);
    if (p.palette.length > 0) {
      const n = Math.min(p.palette.length, 32);
      for (let i = 0; i < n; i++) {
        const [r, g, b] = hexToVec3(p.palette[i]);
        flatPal[i * 3] = r; flatPal[i * 3 + 1] = g; flatPal[i * 3 + 2] = b;
      }
    } else {
      // Auto grayscale palette
      const n = Math.max(2, Math.min(p.paletteSize, 32));
      for (let i = 0; i < n; i++) {
        const v = i / (n - 1);
        flatPal[i * 3] = v; flatPal[i * 3 + 1] = v; flatPal[i * 3 + 2] = v;
      }
    }
    const paletteSize = p.palette.length > 0 ? Math.min(p.palette.length, 32) : Math.max(2, Math.min(p.paletteSize, 32));
    this._pass(key, (prog) => {
      gl.uniform2f(this._ul(key, prog, 'u_resolution'), this._w, this._h);
      gl.uniform1i(this._ul(key, prog, 'u_bits'), bits);
      gl.uniform1f(this._ul(key, prog, 'u_intensity'), p.intensity);
      gl.uniform1f(this._ul(key, prog, 'u_bias'), p.bias);
      gl.uniform1f(this._ul(key, prog, 'u_hueShift'), p.hueShift);
      gl.uniform1f(this._ul(key, prog, 'u_saturation'), p.saturation / 100);
      gl.uniform1i(this._ul(key, prog, 'u_monoMode'), p.monoMode ? 1 : 0);
      gl.uniform1i(this._ul(key, prog, 'u_paletteSize'), paletteSize);
      gl.uniform3fv(this._ul(key, prog, 'u_palette'), flatPal);
      gl.uniform1f(this._ul(key, prog, 'u_blendOriginal'), p.blendOriginal / 100);
    });
  }

  private _runThermal(p: EffectParams['thermal']) {
    const key = 'thermal';
    const gl = this.gl;
    // Rebuild LUT if palette changed
    if (this.lutPalette !== p.palette) {
      this.lutPalette = p.palette;
      const lut = buildThermalLut(p.palette);
      gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut);
    }
    this._pass(key, (prog) => {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
      gl.uniform1i(this._ul(key, prog, 'u_lut'), 1);
      gl.uniform1f(this._ul(key, prog, 'u_contrast'), (100 + (p.contrast ?? 0)) / 100);
      gl.uniform1f(this._ul(key, prog, 'u_brightness'), (p.brightness ?? 0) / 50);
      gl.uniform1i(this._ul(key, prog, 'u_invert'), p.invert ? 1 : 0);
      gl.uniform1f(this._ul(key, prog, 'u_blendOriginal'), (p.blendOriginal ?? 0) / 100);
      // Reset texture unit
      gl.activeTexture(gl.TEXTURE0);
    });
  }

  private _runNightVision(p: EffectParams['nightvision'], frameIdx: number) {
    const key = 'nightvision';
    const gl = this.gl;
    const [pr, pg, pb] = hexToVec3(p.phosphorColor ?? '#1aff44');
    this._pass(key, (prog) => {
      gl.uniform2f(this._ul(key, prog, 'u_resolution'), this._w, this._h);
      gl.uniform1f(this._ul(key, prog, 'u_gain'), p.gain / 3.0);
      gl.uniform1f(this._ul(key, prog, 'u_noiseAmount'), p.noiseAmount);
      gl.uniform1i(this._ul(key, prog, 'u_scanlines'), p.scanlines ? 1 : 0);
      gl.uniform1f(this._ul(key, prog, 'u_scanlineIntensity'), p.scanlineIntensity);
      gl.uniform1f(this._ul(key, prog, 'u_vignetteStrength'), p.vignetteStrength);
      gl.uniform3f(this._ul(key, prog, 'u_phosphorColor'), pr, pg, pb);
      gl.uniform1f(this._ul(key, prog, 'u_tubeDistortion'), p.tubeDistortion ?? 0);
      gl.uniform1f(this._ul(key, prog, 'u_blendOriginal'), (p.blendOriginal ?? 0) / 100);
      gl.uniform1f(this._ul(key, prog, 'u_frame'), frameIdx);
    });
  }

  private _runInfrared(p: EffectParams['infrared']) {
    const key = 'infrared';
    const gl = this.gl;
    this._pass(key, (prog) => {
      gl.uniform1i(this._ul(key, prog, 'u_style'), IR_STYLE[p.style] ?? 0);
      gl.uniform1f(this._ul(key, prog, 'u_grassBoost'), p.grassBoost);
      gl.uniform1f(this._ul(key, prog, 'u_skyDarken'), p.skyDarken);
      gl.uniform1f(this._ul(key, prog, 'u_saturation'), p.saturation / 100);
      gl.uniform1f(this._ul(key, prog, 'u_contrast'), (100 + (p.contrast ?? 0)) / 100);
      gl.uniform1f(this._ul(key, prog, 'u_channelMix'), p.channelMix);
      gl.uniform1f(this._ul(key, prog, 'u_toneShift'), p.toneShift ?? 0);
      gl.uniform1f(this._ul(key, prog, 'u_blendOriginal'), (p.blendOriginal ?? 0) / 100);
    });
  }

  private _runBrutalist(p: EffectParams['brutalist']) {
    const key = 'brutalist';
    const gl = this.gl;
    this._pass(key, (prog) => {
      gl.uniform2f(this._ul(key, prog, 'u_resolution'), this._w, this._h);
      gl.uniform1i(this._ul(key, prog, 'u_posterize'), p.posterize ? 1 : 0);
      gl.uniform1f(this._ul(key, prog, 'u_posterizeLevels'), p.posterizeLevels);
      gl.uniform1i(this._ul(key, prog, 'u_noise'), p.noise ? 1 : 0);
      gl.uniform1f(this._ul(key, prog, 'u_noiseAmount'), p.noiseAmount / 100);
      gl.uniform1i(this._ul(key, prog, 'u_chromatic'), p.chromaticAberration ? 1 : 0);
      gl.uniform1f(this._ul(key, prog, 'u_chromaticAmount'), p.chromaticAmount);
      gl.uniform1i(this._ul(key, prog, 'u_scanlines'), p.scanlines ? 1 : 0);
      gl.uniform1f(this._ul(key, prog, 'u_scanlineIntensity'), p.scanlineIntensity);
      gl.uniform1i(this._ul(key, prog, 'u_grid'), p.grid ? 1 : 0);
      gl.uniform1f(this._ul(key, prog, 'u_gridSpacing'), p.gridSpacing);
      gl.uniform1f(this._ul(key, prog, 'u_gridOpacity'), p.gridOpacity);
    });
  }

  private _runTopo(p: EffectParams['topo']) {
    const key = 'topo';
    const gl = this.gl;
    const [lr, lg, lb] = hexToVec3(p.lineColor ?? '#ffffff');
    const [br, bg, bb] = hexToVec3(p.bgColor ?? '#000000');
    this._pass(key, (prog) => {
      gl.uniform2f(this._ul(key, prog, 'u_resolution'), this._w, this._h);
      gl.uniform1f(this._ul(key, prog, 'u_bands'), p.bands);
      gl.uniform3f(this._ul(key, prog, 'u_lineColor'), lr, lg, lb);
      gl.uniform3f(this._ul(key, prog, 'u_bgColor'), br, bg, bb);
      gl.uniform1i(this._ul(key, prog, 'u_transparent'), p.transparent ? 1 : 0);
      gl.uniform1f(this._ul(key, prog, 'u_lineWidth'), p.lineWidth ?? 1);
      gl.uniform1i(this._ul(key, prog, 'u_colorize'), p.colorize ? 1 : 0);
      gl.uniform1f(this._ul(key, prog, 'u_contrast'), (100 + (p.contrast ?? 0)) / 100);
      gl.uniform1f(this._ul(key, prog, 'u_brightness'), (p.brightness ?? 0) / 100);
    });
  }

  private _runPointCloud(p: EffectParams['pointcloud']) {
    const key = 'pointcloud';
    const gl = this.gl;
    const [ar, ag, ab] = hexToVec3(p.accentColor ?? '#a855f7');
    const [br, bg, bb] = hexToVec3(p.bgColor ?? '#000000');
    const colorModeMap: Record<string, number> = {
      original: 0, mono: 1, accent: 2, luminance: 3, heatmap: 4,
    };
    const shapeMap: Record<string, number> = {
      circle: 0, square: 1, diamond: 2, ring: 3, cross: 4,
    };
    this._pass(key, (prog) => {
      gl.uniform2f(this._ul(key, prog, 'u_resolution'), this._w, this._h);
      gl.uniform1f(this._ul(key, prog, 'u_gridSize'), p.gridSize);
      gl.uniform1f(this._ul(key, prog, 'u_minDotSize'), p.minDotSize);
      gl.uniform1f(this._ul(key, prog, 'u_maxDotSize'), p.maxDotSize);
      gl.uniform1f(this._ul(key, prog, 'u_jitter'), p.jitter);
      gl.uniform1i(this._ul(key, prog, 'u_invert'), p.invert ? 1 : 0);
      gl.uniform3f(this._ul(key, prog, 'u_bgColor'), br, bg, bb);
      gl.uniform3f(this._ul(key, prog, 'u_accentColor'), ar, ag, ab);
      gl.uniform1i(this._ul(key, prog, 'u_colorMode'), colorModeMap[p.colorMode] ?? 0);
      gl.uniform1i(this._ul(key, prog, 'u_shape'), shapeMap[p.shape] ?? 0);
      gl.uniform1f(this._ul(key, prog, 'u_opacity'), (p.opacity ?? 100) / 100);
      gl.uniform1i(this._ul(key, prog, 'u_seed'), p.seed ?? 42);
    });
  }

  // ── New GPU effect passes ──────────────────────────────────────────────────

  private _runHalftone(p: EffectParams['halftone']) {
    const key = 'halftone';
    const gl = this.gl;
    const [bgR, bgG, bgB] = hexToVec3(p.bgColor ?? '#ffffff');
    const [fgR, fgG, fgB] = hexToVec3(p.fgColor ?? '#000000');
    const shapeMap: Record<string, number> = { circle: 0, ellipse: 1, line: 2, diamond: 3 };
    this._pass(key, (prog) => {
      gl.uniform2f(this._ul(key, prog, 'u_resolution'), this._w, this._h);
      gl.uniform1f(this._ul(key, prog, 'u_gridSize'), Math.max(2, p.gridSize));
      gl.uniform1f(this._ul(key, prog, 'u_angle'), ((p.angle ?? 15) * Math.PI) / 180);
      gl.uniform1i(this._ul(key, prog, 'u_shape'), shapeMap[p.dotShape ?? 'circle'] ?? 0);
      gl.uniform3f(this._ul(key, prog, 'u_bgColor'), bgR, bgG, bgB);
      gl.uniform3f(this._ul(key, prog, 'u_fgColor'), fgR, fgG, fgB);
      gl.uniform1i(this._ul(key, prog, 'u_invert'), p.invert ? 1 : 0);
      gl.uniform1f(this._ul(key, prog, 'u_blendOriginal'), (p.blendOriginal ?? 0) / 100);
      gl.uniform1f(this._ul(key, prog, 'u_gamma'), p.gamma ?? 1.0);
      gl.uniform1f(this._ul(key, prog, 'u_contrast'), (100 + (p.contrast ?? 0)) / 100);
      gl.uniform1f(this._ul(key, prog, 'u_brightness'), (p.brightness ?? 0) / 100);
    });
  }

  private _runBlockify(p: EffectParams['blockify']) {
    const key = 'blockify';
    const gl = this.gl;
    const [er, eg, eb] = hexToVec3(p.edgeColor ?? '#000000');
    this._pass(key, (prog) => {
      gl.uniform2f(this._ul(key, prog, 'u_resolution'), this._w, this._h);
      gl.uniform1f(this._ul(key, prog, 'u_blockSize'), Math.max(4, p.blockSize));
      gl.uniform1i(this._ul(key, prog, 'u_edgeHighlight'), p.edgeHighlight ? 1 : 0);
      gl.uniform3f(this._ul(key, prog, 'u_edgeColor'), er, eg, eb);
      gl.uniform1f(this._ul(key, prog, 'u_edgeWidth'), p.edgeWidth ?? 1);
      gl.uniform1f(this._ul(key, prog, 'u_blendOriginal'), (p.blendOriginal ?? 0) / 100);
    });
  }

  private _runThresholdEffect(p: EffectParams['threshold-effect']) {
    const key = 'threshold-effect';
    const gl = this.gl;
    const modeMap: Record<string, number> = { binary: 0, duotone: 1, adaptive: 0, multi: 0 };
    const [ar, ag, ab] = hexToVec3(p.colorA ?? '#000000');
    const [br, bg2, bb] = hexToVec3(p.colorB ?? '#ffffff');
    this._pass(key, (prog) => {
      gl.uniform1i(this._ul(key, prog, 'u_mode'), modeMap[p.mode ?? 'binary'] ?? 0);
      gl.uniform1f(this._ul(key, prog, 'u_threshold'), (p.threshold ?? 128) / 255);
      gl.uniform3f(this._ul(key, prog, 'u_colorA'), ar, ag, ab);
      gl.uniform3f(this._ul(key, prog, 'u_colorB'), br, bg2, bb);
      gl.uniform1i(this._ul(key, prog, 'u_invert'), p.invert ? 1 : 0);
      gl.uniform1f(this._ul(key, prog, 'u_blendOriginal'), (p.blendOriginal ?? 0) / 100);
    });
  }

  private _runEdgeDetection(p: EffectParams['edge-detection']) {
    const key = 'edge-detection';
    const gl = this.gl;
    const algoMap: Record<string, number> = { sobel: 0, prewitt: 1, laplacian: 2, roberts: 3 };
    const modeMap: Record<string, number> = { 'on-black': 0, 'on-white': 1, 'on-original': 2, 'colored': 3 };
    const [er, eg, eb] = hexToVec3(p.edgeColor ?? '#ffffff');
    const [bgr, bgg, bgb] = hexToVec3(p.bgColor ?? '#000000');
    this._pass(key, (prog) => {
      gl.uniform2f(this._ul(key, prog, 'u_resolution'), this._w, this._h);
      gl.uniform1i(this._ul(key, prog, 'u_algorithm'), algoMap[p.algorithm ?? 'sobel'] ?? 0);
      gl.uniform1f(this._ul(key, prog, 'u_threshold'), (p.threshold ?? 50) / 255);
      gl.uniform1i(this._ul(key, prog, 'u_mode'), modeMap[p.mode ?? 'on-black'] ?? 0);
      gl.uniform3f(this._ul(key, prog, 'u_edgeColor'), er, eg, eb);
      gl.uniform3f(this._ul(key, prog, 'u_bgColor'), bgr, bgg, bgb);
      gl.uniform1i(this._ul(key, prog, 'u_invert'), p.invert ? 1 : 0);
      gl.uniform1f(this._ul(key, prog, 'u_blendOriginal'), (p.blendOriginal ?? 0) / 100);
      gl.uniform1i(this._ul(key, prog, 'u_colorByAngle'), p.colorByAngle ? 1 : 0);
    });
  }

  private _runVhs(p: EffectParams['vhs'], frameIdx: number) {
    const key = 'vhs';
    const gl = this.gl;
    const tapeNoiseMap: Record<string, number> = { SP: 0.05, LP: 0.15, EP: 0.3 };
    const tapeMultiplier = tapeNoiseMap[p.tapeSpeed ?? 'SP'];
    this._pass(key, (prog) => {
      gl.uniform2f(this._ul(key, prog, 'u_resolution'), this._w, this._h);
      gl.uniform1f(this._ul(key, prog, 'u_colorBleed'), (p.colorBleed ?? 5) / this._w);
      gl.uniform1f(this._ul(key, prog, 'u_ghosting'), (p.ghosting ?? 0) / this._w);
      gl.uniform1f(this._ul(key, prog, 'u_scanlineIntensity'), p.scanlineIntensity ?? 0.3);
      gl.uniform1f(this._ul(key, prog, 'u_noiseAmount'), (p.noiseAmount ?? 20) / 100 * (1 + tapeMultiplier));
      gl.uniform1f(this._ul(key, prog, 'u_hSync'), (p.hSync ?? 10) / 100);
      gl.uniform1f(this._ul(key, prog, 'u_luma'), (p.luma ?? 0) / 100);
      gl.uniform1f(this._ul(key, prog, 'u_saturation'), (p.saturation ?? 100) / 100);
      gl.uniform1f(this._ul(key, prog, 'u_tracking'), (p.tracking ?? 20) / 100);
      gl.uniform1f(this._ul(key, prog, 'u_static'), (p.static ?? 0) / 100);
      gl.uniform1i(this._ul(key, prog, 'u_rgbOffset'), p.rgbOffset ? 1 : 0);
      gl.uniform1f(this._ul(key, prog, 'u_rgbOffsetAmount'), (p.rgbOffsetAmount ?? 0) / this._w);
      gl.uniform1f(this._ul(key, prog, 'u_blendOriginal'), (p.blendOriginal ?? 0) / 100);
      gl.uniform1f(this._ul(key, prog, 'u_frame'), frameIdx);
    });
  }

  private _runContour(p: EffectParams['contour']) {
    const key = 'contour';
    const gl = this.gl;
    const modeMap: Record<string, number> = { sobel: 0, laplacian: 1, canny: 0 };
    const [lr, lg, lb] = hexToVec3(p.lineColor ?? '#ffffff');
    const [bgr, bgg, bgb] = hexToVec3(p.bgColor ?? '#000000');
    const [ar, ag, ab] = hexToVec3(p.colorA ?? '#ff0000');
    const [br2, bg2, bb2] = hexToVec3(p.colorB ?? '#0000ff');
    this._pass(key, (prog) => {
      gl.uniform2f(this._ul(key, prog, 'u_resolution'), this._w, this._h);
      gl.uniform1i(this._ul(key, prog, 'u_mode'), modeMap[p.mode ?? 'sobel'] ?? 0);
      gl.uniform1f(this._ul(key, prog, 'u_threshold'), (p.threshold ?? 30) / 255);
      gl.uniform3f(this._ul(key, prog, 'u_lineColor'), lr, lg, lb);
      gl.uniform3f(this._ul(key, prog, 'u_bgColor'), bgr, bgg, bgb);
      gl.uniform1i(this._ul(key, prog, 'u_transparent'), p.bgTransparent ? 1 : 0);
      gl.uniform1i(this._ul(key, prog, 'u_colorize'), p.colorize ? 1 : 0);
      gl.uniform3f(this._ul(key, prog, 'u_colorA'), ar, ag, ab);
      gl.uniform3f(this._ul(key, prog, 'u_colorB'), br2, bg2, bb2);
      gl.uniform1f(this._ul(key, prog, 'u_blendOriginal'), (p.blendOriginal ?? 0) / 100);
      gl.uniform1i(this._ul(key, prog, 'u_invertEdges'), p.invertEdges ? 1 : 0);
    });
  }

  // ── Main process ───────────────────────────────────────────────────────────

  process(
    effects: ActiveEffect[],
    params: EffectParams,
    adjustments: Adjustments,
    frameIdx = 0,
  ) {
    if (!this._ready || !this._w || !this._h) return;

    this._runAdjustments(adjustments);

    // Bottom of list applied first, top applied last — same convention as Photoshop layers.
    for (const effect of [...effects].reverse()) {
      if (!effect.enabled) continue;
      switch (effect.type) {
        case 'dither':            this._runDither(params.dither);                    break;
        case 'thermal':           this._runThermal(params.thermal);                  break;
        case 'nightvision':       this._runNightVision(params.nightvision, frameIdx); break;
        case 'infrared':          this._runInfrared(params.infrared);                break;
        case 'brutalist':         this._runBrutalist(params.brutalist);              break;
        case 'topo':              this._runTopo(params.topo);                        break;
        case 'pointcloud':        this._runPointCloud(params.pointcloud);            break;
        case 'halftone':          this._runHalftone(params.halftone);                break;
        case 'blockify':          this._runBlockify(params.blockify);                break;
        case 'threshold-effect':  this._runThresholdEffect(params['threshold-effect']); break;
        case 'edge-detection':    this._runEdgeDetection(params['edge-detection']);  break;
        case 'vhs':               this._runVhs(params.vhs, frameIdx);               break;
        case 'contour':           this._runContour(params.contour);                  break;
        // CPU-only: patched in via patchWithImageData() after this loop
        case 'ascii':
        case 'cybersigilism':
        case 'matrix-rain':
        case 'dots':
        case 'crosshatch':
        case 'wave-lines':
        case 'noise-field':
        case 'voronoi':
        case 'pixel-sort':
          break;
      }
    }

    // Blit final ping texture to the GL canvas default framebuffer
    this._runPass('passthrough', () => {}, null, this.texs[this.ping]);
  }

  // ── Blit to a 2D display canvas ────────────────────────────────────────────

  blit(dest: HTMLCanvasElement | CanvasRenderingContext2D) {
    if (!this._ready) return;
    const ctx = dest instanceof HTMLCanvasElement
      ? dest.getContext('2d')!
      : dest;
    // If preview downscaling is active, blit at original source dimensions so the
    // display canvas stays at full size (GPU processes fewer pixels, display upscales).
    const outW = this._srcW || this._w;
    const outH = this._srcH || this._h;
    if (ctx.canvas.width !== outW || ctx.canvas.height !== outH) {
      ctx.canvas.width = outW;
      ctx.canvas.height = outH;
    }
    ctx.drawImage(this.canvas, 0, 0, outW, outH);
  }

  // ── Readback to CPU (for export / B/A) ────────────────────────────────────

  readback(): ImageData {
    const gl = this.gl;
    const w = this._w, h = this._h;
    const buf = new Uint8Array(w * h * 4);
    // Read from the current ping FBO (last rendered result)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[this.ping]);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // WebGL has origin bottom-left; flip vertically
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const srcRow = (h - 1 - y) * w * 4;
      const dstRow = y * w * 4;
      out.set(buf.subarray(srcRow, srcRow + w * 4), dstRow);
    }
    return new ImageData(out, w, h);
  }

  // ── Row-flip helper (screen-convention ↔ GL-convention) ────────────────────
  // readback() returns screen-convention ImageData (Y=0 = top).
  // texImage2D with ArrayBufferView maps row 0 to GL Y=0 (bottom).
  // So we must flip rows before re-uploading CPU-processed frames.
  private _flipRows(img: ImageData): Uint8ClampedArray {
    const { width, height, data } = img;
    const out = new Uint8ClampedArray(data.length);
    const rowBytes = width * 4;
    for (let y = 0; y < height; y++) {
      out.set(data.subarray((height - 1 - y) * rowBytes, (height - y) * rowBytes), y * rowBytes);
    }
    return out;
  }

  // ── CPU effect patch (ascii, cybersigilism, non-GPU dither) ──────────────────
  // Call this after process() to inject a CPU-processed frame back into the pipeline.

  patchWithImageData(img: ImageData) {
    if (!this._ready) return;
    const gl = this.gl;
    const dst = 1 - this.ping as 0 | 1;
    gl.bindTexture(gl.TEXTURE_2D, this.texs[dst]);

    if (img.width === this._w && img.height === this._h) {
      // Exact match — flip rows and upload directly
      const flipped = this._flipRows(img);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, img.width, img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, flipped);
    } else {
      // Size mismatch (e.g. ASCII rounds down by 1-2px) — stretch to pipeline resolution via canvas
      const srcCvs = document.createElement('canvas');
      srcCvs.width = img.width; srcCvs.height = img.height;
      srcCvs.getContext('2d')!.putImageData(img, 0, 0);
      const dstCvs = document.createElement('canvas');
      dstCvs.width = this._w; dstCvs.height = this._h;
      dstCvs.getContext('2d')!.drawImage(srcCvs, 0, 0, this._w, this._h);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, dstCvs);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    this.ping = dst;
    // Re-blit to default framebuffer
    this._runPass('passthrough', () => {}, null, this.texs[this.ping]);
  }

  // ── Destroy ────────────────────────────────────────────────────────────────

  destroy() {
    if (!this._ready) return;
    const gl = this.gl;
    this.progs.forEach(p => gl.deleteProgram(p));
    this.fbos.forEach(f => gl.deleteFramebuffer(f));
    this.texs.forEach(t => gl.deleteTexture(t));
    gl.deleteTexture(this.lutTex);
    gl.deleteVertexArray(this.vao);
    this._ready = false;
  }
}

// Module-level singleton
export const glRenderer = new GlRenderer();
