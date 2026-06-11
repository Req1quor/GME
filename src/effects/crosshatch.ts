import type { CrosshatchParams } from '../types';

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt((hex ?? '#000000').replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function applyCrosshatch(src: ImageData, params: CrosshatchParams): ImageData {
  const { width: w, height: h, data } = src;
  const offscreen = new OffscreenCanvas(w, h);
  const ctx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;

  const [bgR, bgG, bgB] = hexToRgb(params.bgColor ?? '#ffffff');
  const [lr, lg, lb] = hexToRgb(params.color ?? '#000000');
  const blend = (params.blendOriginal ?? 0) / 100;

  if (!params.bgTransparent) {
    ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
    ctx.fillRect(0, 0, w, h);
  }

  const numLayers = Math.max(1, Math.min(4, params.layers ?? 2));
  const baseSpacing = Math.max(2, params.spacing ?? 8);
  const angles = [
    params.angle1 ?? 45,
    params.angle2 ?? 135,
    params.angle3 ?? 0,
    params.angle4 ?? 90,
  ];

  ctx.strokeStyle = `rgb(${lr},${lg},${lb})`;
  ctx.lineWidth = Math.max(0.5, params.lineWidth ?? 1);

  // Apply contrast to luminance
  const cf = (100 + (params.contrast ?? 0)) / 100;

  const diag = Math.sqrt(w * w + h * h);

  for (let layer = 0; layer < numLayers; layer++) {
    const rad = (angles[layer] * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);

    const spacing = params.lumDriven ? baseSpacing : baseSpacing;
    const steps = Math.ceil(diag / spacing) + 2;

    for (let k = -steps; k <= steps; k++) {
      const offset = k * spacing;
      // Start/end points for this hatch line across the canvas
      const x1 = -diag * cos + offset * (-sin) + w / 2;
      const y1 = -diag * sin + offset * cos + h / 2;
      const x2 =  diag * cos + offset * (-sin) + w / 2;
      const y2 =  diag * sin + offset * cos + h / 2;

      if (params.lumDriven) {
        // Sample luminance along line and draw segments based on darkness
        const steps2 = Math.floor(diag);
        let inSeg = false;

        for (let s = 0; s <= steps2; s++) {
          const t = s / steps2;
          const px = Math.round(x1 + (x2 - x1) * t);
          const py = Math.round(y1 + (y2 - y1) * t);
          if (px < 0 || px >= w || py < 0 || py >= h) {
            if (inSeg) { ctx.stroke(); inSeg = false; }
            continue;
          }
          const idx2 = (py * w + px) * 4;
          const l = (0.299 * data[idx2] + 0.587 * data[idx2 + 1] + 0.114 * data[idx2 + 2]);
          const lc = Math.max(0, Math.min(255, (l - 128) * cf + 128));
          const norm = lc / 255;
          // Darker pixels = draw hatch
          const minS = params.minSpacing ?? spacing * 0.5;
          const maxS2 = params.maxSpacing ?? spacing * 2;
          const effectiveSpacing = minS + norm * (maxS2 - minS);
          const shouldDraw = Math.abs((k * spacing - offset) % effectiveSpacing) < spacing * 0.5;

          if (shouldDraw) {
            if (!inSeg) { ctx.beginPath(); ctx.moveTo(px, py); inSeg = true; }
            else ctx.lineTo(px, py);
          } else if (inSeg) {
            ctx.stroke(); inSeg = false;
          }
        }
        if (inSeg) ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
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
