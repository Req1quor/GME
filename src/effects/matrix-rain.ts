import type { MatrixRainParams } from '../types';

// Module-level state for animated rain columns
interface Column { y: number; speed: number; chars: string[]; hue: number }
let _cols: Column[] = [];
let _lastW = 0;
let _lastFontSize = 0;
let _offscreen: OffscreenCanvas | null = null;
let _offCtx: OffscreenCanvasRenderingContext2D | null = null;
let _frame = 0;

const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
const LATIN    = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%*+-=';

function buildCharPool(custom: string): string {
  if (custom && custom !== 'default') return custom;
  return KATAKANA + LATIN;
}

export function resetMatrixState() {
  _cols = []; _lastW = 0; _lastFontSize = 0;
  _offscreen = null; _offCtx = null; _frame = 0;
}

export function applyMatrixRain(src: ImageData, params: MatrixRainParams): ImageData {
  const { width, height } = src;
  const fontSize = Math.max(6, Math.min(32, params.fontSize ?? 14));
  const charPool = buildCharPool(params.chars ?? 'default');
  const colWidth = fontSize;

  // Re-init when size or font changes
  if (_lastW !== width || _lastFontSize !== fontSize || !_offscreen) {
    _lastW = width; _lastFontSize = fontSize;
    _offscreen = new OffscreenCanvas(width, height);
    _offCtx = _offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;
    _offCtx.fillStyle = 'black';
    _offCtx.fillRect(0, 0, width, height);

    const numCols = Math.floor(width / colWidth);
    const density = (params.density ?? 70) / 100;
    _cols = [];
    const rng = mulberry32(params.seed ?? 1337);
    for (let i = 0; i < numCols; i++) {
      if (rng() > density) continue;
      const speed = (params.speed ?? 1.5) * (0.5 + rng() * 1.5);
      const startY = rng() * height;
      const len = Math.floor(6 + rng() * 16);
      const chars: string[] = Array.from({ length: len }, () =>
        charPool[Math.floor(rng() * charPool.length)]
      );
      const hue = rng() * 360 * (params.colorVariance ?? 0.15);
      _cols.push({ y: -startY, speed, chars, hue });
    }
  }

  const ctx = _offCtx!;
  const hexColor = params.color ?? '#00ff41';
  const bgColor = params.bgColor ?? '#000000';
  const trail = params.trailLength ?? 0.92;

  // Parse bg color for fade overlay
  const bv = parseInt(bgColor.replace('#', ''), 16);
  const br = (bv >> 16) & 255, bg2 = (bv >> 8) & 255, bb = bv & 255;

  // Fade previous frame
  const fadeAlpha = 1 - trail;
  ctx.fillStyle = `rgba(${br},${bg2},${bb},${fadeAlpha})`;
  ctx.fillRect(0, 0, width, height);

  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = 'top';

  const cv = parseInt(hexColor.replace('#', ''), 16);
  const cr = (cv >> 16) & 255, cg = (cv >> 8) & 255, cb2 = cv & 255;

  _frame++;
  const speed = params.speed ?? 1.5;

  for (const col of _cols) {
    col.y += col.speed * speed;
    if (col.y - col.chars.length * fontSize > height) {
      col.y = -fontSize * 2 - Math.random() * height * 0.5;
      col.speed = (params.speed ?? 1.5) * (0.5 + Math.random() * 1.5);
      // Randomize chars
      for (let k = 0; k < col.chars.length; k++) {
        col.chars[k] = charPool[Math.floor(Math.random() * charPool.length)];
      }
    }

    const xi = _cols.indexOf(col);
    const x = xi * colWidth; // approximate x based on index

    for (let j = 0; j < col.chars.length; j++) {
      const y = col.y - j * fontSize;
      if (y < -fontSize || y > height) continue;
      const alpha = j === 0 ? 1.0 : (1 - j / col.chars.length) * 0.85;
      if (j === 0) {
        // Leading char — bright white
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      } else {
        const r2 = Math.round(cr * alpha);
        const g2 = Math.round(cg * alpha);
        const b2 = Math.round(cb2 * alpha);
        ctx.fillStyle = `rgba(${r2},${g2},${b2},${alpha})`;
      }
      ctx.fillText(col.chars[j], x, y);
    }
  }

  if (params.glowEffect) {
    ctx.shadowBlur = 8;
    ctx.shadowColor = hexColor;
  } else {
    ctx.shadowBlur = 0;
  }

  // Now composite: blend rain over source image
  const rainFrame = ctx.getImageData(0, 0, width, height);
  const out = new ImageData(new Uint8ClampedArray(src.data), width, height);
  const d = out.data;
  const rd = rainFrame.data;

  for (let i = 0; i < d.length; i += 4) {
    const rLum = (rd[i] * 0.299 + rd[i+1] * 0.587 + rd[i+2] * 0.114) / 255;
    if (rLum > 0.02) {
      d[i]     = rd[i];
      d[i + 1] = rd[i + 1];
      d[i + 2] = rd[i + 2];
      d[i + 3] = 255;
    }
  }

  return out;
}

// Simple deterministic RNG
function mulberry32(a: number) {
  return () => {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
