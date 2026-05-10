import type { AsciiParams } from '../types';

export const DEFAULT_CHARSET = '@#S%?*+;:,. ';

export function applyAscii(imageData: ImageData, params: AsciiParams): ImageData {
  const {
    charSize,
    charset,
    colored,
    bgColor = '#000000',
    bgOpacity = 1,
    contrast = 0,
    brightness = 0,
    invert = false,
    cellAspect = 0.55,
    samplingMode = 'center',
    fontFamily = 'IBM Plex Mono',
  } = params;

  const { width, height } = imageData;

  const chars = charset.length > 0 ? charset : DEFAULT_CHARSET;

  // Cell dimensions: charSize wide, charSize/cellAspect tall
  const cellW = charSize;
  const cellH = Math.max(1, Math.round(charSize / cellAspect));

  const cols = Math.floor(width / cellW);
  const rows = Math.floor(height / cellH);

  const offscreen = document.createElement('canvas');
  offscreen.width = cols * cellW;
  offscreen.height = rows * cellH;
  const ctx = offscreen.getContext('2d')!;

  // If bgOpacity < 1, show the original image through the background
  if (bgOpacity < 1) {
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = cols * cellW;
    srcCanvas.height = rows * cellH;
    const srcCtx = srcCanvas.getContext('2d')!;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width; tempCanvas.height = height;
    tempCanvas.getContext('2d')!.putImageData(imageData, 0, 0);
    srcCtx.drawImage(tempCanvas, 0, 0, cols * cellW, rows * cellH);
    ctx.drawImage(srcCanvas, 0, 0);
  }

  // Draw background at bgOpacity (1 = solid, 0 = skip completely)
  if (bgOpacity > 0) {
    ctx.globalAlpha = bgOpacity;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx.globalAlpha = 1;
  }

  ctx.font = `${charSize}px "${fontFamily}", monospace`;
  ctx.textBaseline = 'top';

  // Contrast/brightness multipliers (applied to 0-255 luminance)
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  const processLum = (lum: number): number => {
    // brightness: shift by -100..100 mapped to -0.39..+0.39
    let v = lum + brightness / 255;
    // contrast: expand/contract around 0.5
    v = contrastFactor * (v - 0.5) + 0.5;
    v = Math.max(0, Math.min(1, v));
    if (invert) v = 1 - v;
    return v;
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let r = 0, g = 0, b = 0;

      if (samplingMode === 'average') {
        // Average all pixels in the cell from source imageData
        let count = 0;
        for (let dy = 0; dy < cellH; dy++) {
          for (let dx = 0; dx < cellW; dx++) {
            const px = Math.min(col * cellW + dx, width - 1);
            const py = Math.min(row * cellH + dy, height - 1);
            const idx = (py * width + px) * 4;
            r += imageData.data[idx];
            g += imageData.data[idx + 1];
            b += imageData.data[idx + 2];
            count++;
          }
        }
        r = r / count; g = g / count; b = b / count;
      } else {
        // Center pixel sample
        const px = Math.min(Math.floor(col * cellW + cellW / 2), width - 1);
        const py = Math.min(Math.floor(row * cellH + cellH / 2), height - 1);
        const idx = (py * width + px) * 4;
        r = imageData.data[idx];
        g = imageData.data[idx + 1];
        b = imageData.data[idx + 2];
      }

      const rawLum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const lum = processLum(rawLum);
      const charIdx = Math.floor(lum * (chars.length - 1));
      const ch = chars[Math.max(0, Math.min(charIdx, chars.length - 1))];

      if (colored) {
        ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
      } else {
        const v = Math.round(lum * 255);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
      }

      ctx.fillText(ch, col * cellW, row * cellH);
    }
  }

  return ctx.getImageData(0, 0, offscreen.width, offscreen.height);
}
