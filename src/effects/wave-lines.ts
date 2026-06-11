import type { WaveLinesParams } from '../types';

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt((hex ?? '#000000').replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// Simple value noise 2D
function noise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const xt = xf * xf * (3 - 2 * xf), yt = yf * yf * (3 - 2 * yf);
  const h = (a: number, b: number) => {
    let s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  return h(xi, yi) * (1 - xt) * (1 - yt)
       + h(xi+1, yi) * xt * (1 - yt)
       + h(xi, yi+1) * (1 - xt) * yt
       + h(xi+1, yi+1) * xt * yt;
}

let _frameOffset = 0;

export function advanceWavePhase(dt: number) { _frameOffset += dt; }

export function applyWaveLines(src: ImageData, params: WaveLinesParams): ImageData {
  const { width: w, height: h, data } = src;
  const offscreen = new OffscreenCanvas(w, h);
  const ctx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;

  const [bgR, bgG, bgB] = hexToRgb(params.bgColor ?? '#000000');
  const [cr, cg, cb] = hexToRgb(params.color ?? '#ffffff');
  const [gAr, gAg, gAb] = hexToRgb(params.gradientA ?? '#ff0088');
  const [gBr, gBg, gBb] = hexToRgb(params.gradientB ?? '#00ccff');
  const blend = (params.blendOriginal ?? 0) / 100;

  if (!params.bgTransparent) {
    ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
    ctx.fillRect(0, 0, w, h);
  }

  const lineCount = Math.max(5, Math.min(200, params.lineCount ?? 50));
  const amplitude = params.amplitude ?? 40;
  const freq = params.frequency ?? 3;
  const lineWidth = Math.max(0.5, params.lineWidth ?? 1);
  const phaseOff = ((params.phase ?? 0) * Math.PI) / 180;
  const noiseScale = params.noiseScale ?? 0.01;
  const waveType = params.waveType ?? 'sine';
  const invert = params.invert ?? false;

  ctx.lineWidth = lineWidth;

  for (let li = 0; li < lineCount; li++) {
    const baseY = (li / lineCount) * h;
    const phaseShift = (li / lineCount) * Math.PI * 2;

    ctx.beginPath();
    let firstPoint = true;

    for (let x = 0; x <= w; x += 2) {
      const normX = x / w;
      let sampleY = baseY;

      // Sample source luminance for lum-driven lines
      const lumAt = () => {
        const px = Math.max(0, Math.min(w - 1, x));
        const py = Math.max(0, Math.min(h - 1, Math.round(baseY)));
        const idx2 = (py * w + px) * 4;
        return (0.299 * data[idx2] + 0.587 * data[idx2+1] + 0.114 * data[idx2+2]) / 255;
      };

      const amp = params.lumDriven ? amplitude * (invert ? lumAt() : 1 - lumAt()) : amplitude;
      const t = normX * freq * Math.PI * 2 + phaseShift + phaseOff + _frameOffset;

      let displacement: number;
      if (waveType === 'sine') displacement = Math.sin(t) * amp;
      else if (waveType === 'square') displacement = Math.sign(Math.sin(t)) * amp;
      else if (waveType === 'sawtooth') displacement = ((t % (Math.PI * 2)) / (Math.PI * 2) - 0.5) * amp * 2;
      else if (waveType === 'noise') {
        displacement = (noise(x * noiseScale, baseY * noiseScale * 0.3 + _frameOffset * 0.1) * 2 - 1) * amp;
      } else { // combined
        displacement = (Math.sin(t) * 0.6 + (noise(x * noiseScale * 2, baseY * noiseScale) * 2 - 1) * 0.4) * amp;
      }

      sampleY += displacement;

      if (firstPoint) { ctx.moveTo(x, sampleY); firstPoint = false; }
      else ctx.lineTo(x, sampleY);
    }

    // Color
    const t = li / (lineCount - 1);
    if (params.colorMode === 'gradient') {
      const r2 = Math.round(gAr + (gBr - gAr) * t);
      const g2 = Math.round(gAg + (gBg - gAg) * t);
      const b2 = Math.round(gAb + (gBb - gAb) * t);
      ctx.strokeStyle = `rgb(${r2},${g2},${b2})`;
    } else if (params.colorMode === 'fromImage') {
      const py2 = Math.max(0, Math.min(h - 1, Math.round(baseY)));
      const px2 = Math.floor(w * 0.5);
      const idx2 = (py2 * w + px2) * 4;
      ctx.strokeStyle = `rgb(${data[idx2]},${data[idx2+1]},${data[idx2+2]})`;
    } else {
      ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
    }
    ctx.stroke();
  }

  const result = ctx.getImageData(0, 0, w, h);
  if (blend > 0) {
    for (let i = 0; i < result.data.length; i += 4) {
      result.data[i]     = result.data[i]     * (1 - blend) + data[i]     * blend;
      result.data[i + 1] = result.data[i + 1] * (1 - blend) + data[i + 1] * blend;
      result.data[i + 2] = result.data[i + 2] * (1 - blend) + data[i + 2] * blend;
    }
  }
  return result;
}
