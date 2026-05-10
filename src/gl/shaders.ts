/**
 * GLSL 3.0 ES shader source strings for the WebGL2 real-time pipeline.
 * All fragment shaders share the same vertex shader (fullscreen quad).
 */

// ─── Vertex shader (shared) ──────────────────────────────────────────────────
export const VS = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// ─── Passthrough ─────────────────────────────────────────────────────────────
export const FS_PASSTHROUGH = /* glsl */ `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 fragColor;
void main() { fragColor = texture(u_tex, v_uv); }`;

// ─── Adjustments ─────────────────────────────────────────────────────────────
export const FS_ADJUSTMENTS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_brightness;   // -1.0 to 1.0  (adj.brightness / 100)
uniform float u_contrast;     // factor        ((100 + adj.contrast) / 100)
uniform float u_saturation;   // 0.0 to 2.0   (adj.saturation / 100)
uniform float u_gamma;        // 0.2 to 3.0
out vec4 fragColor;
void main() {
  vec4 c = texture(u_tex, v_uv);
  vec3 rgb = c.rgb;
  if (abs(u_gamma - 1.0) > 0.001)
    rgb = pow(max(rgb, vec3(1e-4)), vec3(1.0 / max(u_gamma, 1e-4)));
  rgb += u_brightness;
  rgb = (rgb - 0.5) * u_contrast + 0.5;
  float lum = dot(rgb, vec3(0.2989, 0.5870, 0.1140));
  rgb = mix(vec3(lum), rgb, u_saturation);
  fragColor = vec4(clamp(rgb, 0.0, 1.0), c.a);
}`;

// ─── Thermal ─────────────────────────────────────────────────────────────────
// u_lut: 256×1 RGBA texture built on CPU from the palette stops
export const FS_THERMAL = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_lut;
uniform float u_contrast;      // ((100 + value) / 100)
uniform float u_brightness;    // value / 50  → approx. [-1, 1]
uniform int   u_invert;
uniform float u_blendOriginal; // 0–1
out vec4 fragColor;
void main() {
  vec4 src = texture(u_tex, v_uv);
  float lum = dot(src.rgb, vec3(0.2989, 0.5870, 0.1140));
  lum = clamp((lum + u_brightness) * u_contrast, 0.0, 1.0);
  if (u_invert == 1) lum = 1.0 - lum;
  // Sample LUT: map [0,1] to texel centres [0.5/256, 255.5/256]
  vec3 color = texture(u_lut, vec2(lum * (255.0/256.0) + 0.5/256.0, 0.5)).rgb;
  color = mix(color, src.rgb, u_blendOriginal);
  fragColor = vec4(clamp(color, 0.0, 1.0), src.a);
}`;

// ─── Night Vision ─────────────────────────────────────────────────────────────
export const FS_NIGHTVISION = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2  u_resolution;
uniform float u_gain;
uniform float u_noiseAmount;
uniform int   u_scanlines;
uniform float u_scanlineIntensity;
uniform float u_vignetteStrength;
uniform vec3  u_phosphorColor;
uniform float u_tubeDistortion;
uniform float u_blendOriginal;
uniform float u_frame;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 74.23);
  return fract(p.x * p.y);
}

vec2 barrelDistort(vec2 uv, float k) {
  vec2 c = uv * 2.0 - 1.0;
  float r2 = dot(c, c);
  c /= 1.0 + k * r2 * 3.5;
  return c * 0.5 + 0.5;
}

void main() {
  vec2 uv = u_tubeDistortion > 0.001 ? barrelDistort(v_uv, u_tubeDistortion) : v_uv;
  vec4 src = texture(u_tex, clamp(uv, vec2(0.0), vec2(1.0)));
  float lum = dot(src.rgb, vec3(0.2989, 0.5870, 0.1140));
  // Amplification
  lum = clamp(lum * u_gain / 3.0, 0.0, 1.0);
  // Animated shot noise
  vec2 noiseCoord = v_uv * u_resolution + vec2(u_frame * 7.13, u_frame * 3.77);
  float noise = hash21(noiseCoord) * 2.0 - 1.0;
  lum = clamp(lum + noise * u_noiseAmount / 200.0, 0.0, 1.0);
  // Scanlines
  if (u_scanlines == 1) {
    float line = mod(floor(v_uv.y * u_resolution.y), 2.0);
    lum *= 1.0 - line * u_scanlineIntensity * 0.5;
  }
  // Phosphor color
  vec3 rgb = lum * u_phosphorColor;
  // Vignette
  vec2 uv2 = v_uv * 2.0 - 1.0;
  float vignette = 1.0 - dot(uv2, uv2) * u_vignetteStrength * 0.5;
  rgb *= clamp(vignette, 0.0, 1.0);
  // Blend with original
  rgb = mix(rgb, src.rgb, u_blendOriginal);
  fragColor = vec4(clamp(rgb, 0.0, 1.0), src.a);
}`;

// ─── Infrared Film ───────────────────────────────────────────────────────────
// u_style: 0=aerochrome, 1=ektachrome, 2=kodak-hie, 3=digital, 4=false-color
export const FS_INFRARED = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform int   u_style;
uniform float u_grassBoost;
uniform float u_skyDarken;
uniform float u_saturation;
uniform float u_contrast;
uniform float u_channelMix;
uniform float u_toneShift;     // degrees
uniform float u_blendOriginal;
out vec4 fragColor;

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0; if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q-p)*6.0*t;
  if (t < 0.5) return q;
  if (t < 2.0/3.0) return p + (q-p)*(2.0/3.0-t)*6.0;
  return p;
}
vec3 hueRotate(vec3 rgb, float deg) {
  if (abs(deg) < 0.5) return rgb;
  float mx = max(rgb.r, max(rgb.g, rgb.b));
  float mn = min(rgb.r, min(rgb.g, rgb.b));
  float l = (mx + mn) * 0.5;
  if (mx == mn) return rgb;
  float d = mx - mn;
  float s = l > 0.5 ? d/(2.0-mx-mn) : d/(mx+mn);
  float h;
  if (mx == rgb.r) h = (rgb.g-rgb.b)/d + (rgb.g < rgb.b ? 6.0 : 0.0);
  else if (mx == rgb.g) h = (rgb.b-rgb.r)/d + 2.0;
  else h = (rgb.r-rgb.g)/d + 4.0;
  h = fract(h/6.0 + deg/360.0);
  float q = l < 0.5 ? l*(1.0+s) : l+s-l*s;
  float p = 2.0*l - q;
  return vec3(hue2rgb(p,q,h+1.0/3.0), hue2rgb(p,q,h), hue2rgb(p,q,h-1.0/3.0));
}

void main() {
  vec4 src = texture(u_tex, v_uv);
  vec3 c = src.rgb;
  float mx = u_channelMix;
  // IR proxy: vegetation = high green relative to blue
  float ir   = clamp(c.g * 1.3 - c.b * 0.5, 0.0, 1.0) * u_grassBoost;
  float sky  = clamp(c.b - c.r * 0.5 - c.g * 0.3, 0.0, 1.0);
  vec3 out_c;
  if (u_style == 0) {
    // Aerochrome: IR→red, red→green, green→blue; sky stays dark
    out_c = vec3(mix(c.r, ir, mx), mix(c.g, c.r, mx * 0.7), mix(c.b, c.g * (1.0 - u_skyDarken * sky), mx));
  } else if (u_style == 1) {
    // Ektachrome: yellower shift
    out_c = vec3(mix(c.r, c.g * 1.1, mx), mix(c.g, c.r * 0.9 + ir * 0.2, mx),
                 mix(c.b, c.b * (1.0 - u_skyDarken * sky * 0.5), mx));
  } else if (u_style == 2) {
    // Kodak HIE: monochrome with vegetation bright
    float mono = clamp(c.g * 1.5 - c.b * 0.3, 0.0, 1.0) * u_grassBoost;
    out_c = vec3(mono);
  } else if (u_style == 3) {
    // Digital IR: channel swap
    out_c = vec3(mix(c.r, c.g, mx), mix(c.g, c.b, mx), mix(c.b, c.r, mx));
  } else {
    // False color: dramatic spectral mapping
    out_c = clamp(vec3(ir * 1.2, c.b * 0.9, (1.0 - c.g) * 1.1), 0.0, 1.0);
  }
  // Contrast
  out_c = (out_c - 0.5) * u_contrast + 0.5;
  // Saturation
  float lum = dot(out_c, vec3(0.2989, 0.5870, 0.1140));
  out_c = mix(vec3(lum), out_c, u_saturation);
  // Tone shift
  if (abs(u_toneShift) > 0.5) out_c = hueRotate(clamp(out_c, 0.0, 1.0), u_toneShift);
  // Blend
  out_c = mix(out_c, src.rgb, u_blendOriginal);
  fragColor = vec4(clamp(out_c, 0.0, 1.0), src.a);
}`;

// ─── Bayer / Ordered Dither ──────────────────────────────────────────────────
// u_bits: 0=threshold, -1=random, 1–5=Bayer 2^n×2^n
export const FS_BAYER = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2  u_resolution;
uniform int   u_bits;           // 0=threshold, -1=random, 1-5=Bayer bits
uniform float u_intensity;      // threshold amplitude (0–2)
uniform float u_bias;           // 0=dark, 0.5=neutral, 1=bright
uniform float u_hueShift;
uniform float u_saturation;     // 0–2
uniform int   u_monoMode;
uniform int   u_paletteSize;
uniform vec3  u_palette[32];
uniform float u_blendOriginal;
out vec4 fragColor;

// ── Bayer threshold via bit interleaving (analytically correct) ──────────────
// Produces the same matrices as the standard recursive Bayer construction.
float bayerThreshold(int px, int py, int bits) {
  int val = 0;
  for (int i = 0; i < 8; i++) {
    if (i >= bits) break;
    int xb = (px >> i) & 1;
    int yb = (py >> i) & 1;
    val |= (yb << (2*i+1));
    val |= ((xb ^ yb) << (2*i));
  }
  // Bit-reverse the lower 2*bits bits
  int rev = 0;
  int total = 2 * bits;
  for (int i = 0; i < 16; i++) {
    if (i >= total) break;
    rev |= (((val >> i) & 1) << (total - 1 - i));
  }
  return float(rev) / float(1 << total);
}

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float hue2rgb3(float p, float q, float t) {
  if (t < 0.0) t += 1.0; if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q-p)*6.0*t;
  if (t < 0.5) return q;
  if (t < 2.0/3.0) return p + (q-p)*(2.0/3.0-t)*6.0;
  return p;
}
vec3 applyHueSat(vec3 rgb, float deg, float sat) {
  // Saturation
  float lum = dot(rgb, vec3(0.2989, 0.5870, 0.1140));
  rgb = mix(vec3(lum), rgb, sat);
  if (abs(deg) < 0.5) return rgb;
  // Hue rotation via HSL
  float mx = max(rgb.r, max(rgb.g, rgb.b));
  float mn = min(rgb.r, min(rgb.g, rgb.b));
  float l = (mx + mn) * 0.5;
  if (mx == mn) return rgb;
  float d = mx - mn;
  float s = l > 0.5 ? d/(2.0-mx-mn) : d/(mx+mn);
  float h;
  if (mx == rgb.r) h = (rgb.g-rgb.b)/d + (rgb.g < rgb.b ? 6.0 : 0.0);
  else if (mx == rgb.g) h = (rgb.b-rgb.r)/d + 2.0;
  else h = (rgb.r-rgb.g)/d + 4.0;
  h = fract(h/6.0 + deg/360.0);
  float q = l < 0.5 ? l*(1.0+s) : l+s-l*s;
  float p = 2.0*l - q;
  return vec3(hue2rgb3(p,q,h+1.0/3.0), hue2rgb3(p,q,h), hue2rgb3(p,q,h-1.0/3.0));
}

vec3 nearestColor(vec3 c) {
  vec3 best = u_palette[0];
  float bestDist = dot(c - u_palette[0], c - u_palette[0]);
  for (int i = 1; i < 32; i++) {
    if (i >= u_paletteSize) break;
    float d = dot(c - u_palette[i], c - u_palette[i]);
    if (d < bestDist) { bestDist = d; best = u_palette[i]; }
  }
  return best;
}

void main() {
  vec4 src = texture(u_tex, v_uv);
  vec3 c = src.rgb;
  // Pre-processing
  if (abs(u_hueShift) > 0.5 || abs(u_saturation - 1.0) > 0.01)
    c = applyHueSat(c, u_hueShift, u_saturation);
  if (u_monoMode == 1) { float l = dot(c, vec3(0.2989,0.5870,0.1140)); c = vec3(l); }

  // Compute dither threshold in [0,1)
  ivec2 px = ivec2(floor(v_uv * u_resolution));
  float threshold;
  if (u_bits == 0) {
    threshold = 0.5;
  } else if (u_bits < 0) {
    threshold = hash21(vec2(px));
  } else {
    threshold = bayerThreshold(int(px.x), int(px.y), u_bits);
  }
  // Scale and bias the threshold
  float offset = (threshold - 0.5) * u_intensity * 0.5;

  // Apply dither offset to input and find nearest palette colour
  vec3 dithered = clamp(c + vec3(offset), 0.0, 1.0);
  vec3 result   = nearestColor(dithered);

  result = mix(result, src.rgb, u_blendOriginal);
  fragColor = vec4(clamp(result, 0.0, 1.0), src.a);
}`;

// ─── Brutalist ───────────────────────────────────────────────────────────────
// Handles all GPU-compatible sub-effects. pixelSort and glitch require CPU.
export const FS_BRUTALIST = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2  u_resolution;
uniform int   u_posterize;
uniform float u_posterizeLevels;
uniform int   u_threshold;
uniform float u_thresholdValue;
uniform int   u_noise;
uniform float u_noiseAmount;
uniform int   u_edgeDetect;
uniform float u_edgeThreshold;
uniform vec3  u_edgeColor;
uniform int   u_chromatic;
uniform float u_chromaticAmount;
uniform int   u_scanlines;
uniform float u_scanlineIntensity;
uniform int   u_grid;
uniform float u_gridSpacing;
uniform float u_gridOpacity;
out vec4 fragColor;

float hash21b(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// Luminance of a texel at offset from current UV
float lumAt(vec2 uv) {
  return dot(texture(u_tex, uv).rgb, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec2 texel = 1.0 / u_resolution;
  vec4 src;

  // Chromatic aberration: sample R/G/B at horizontal offsets
  if (u_chromatic == 1) {
    float off = u_chromaticAmount * texel.x;
    src.r = texture(u_tex, v_uv + vec2( off, 0.0)).r;
    src.g = texture(u_tex, v_uv).g;
    src.b = texture(u_tex, v_uv + vec2(-off, 0.0)).b;
    src.a = texture(u_tex, v_uv).a;
  } else {
    src = texture(u_tex, v_uv);
  }

  vec3 rgb = src.rgb;

  // Posterize
  if (u_posterize == 1 && u_posterizeLevels > 1.0) {
    float s = 1.0 / (u_posterizeLevels - 1.0);
    rgb = round(rgb / s) * s;
  }

  // Threshold (binarize by luminance)
  if (u_threshold == 1) {
    float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
    float v = lum >= u_thresholdValue ? 1.0 : 0.0;
    rgb = vec3(v);
  }

  // Noise (hash grain)
  if (u_noise == 1) {
    float grain = (hash21b(v_uv * u_resolution) * 2.0 - 1.0) * u_noiseAmount;
    rgb = clamp(rgb + vec3(grain), 0.0, 1.0);
  }

  // Edge detection (Sobel on source texture)
  if (u_edgeDetect == 1) {
    float gx =
      -lumAt(v_uv + texel*vec2(-1,-1)) + lumAt(v_uv + texel*vec2(1,-1))
      - 2.0*lumAt(v_uv + texel*vec2(-1, 0)) + 2.0*lumAt(v_uv + texel*vec2(1, 0))
      - lumAt(v_uv + texel*vec2(-1, 1)) + lumAt(v_uv + texel*vec2(1, 1));
    float gy =
      -lumAt(v_uv + texel*vec2(-1,-1)) - 2.0*lumAt(v_uv + texel*vec2(0,-1)) - lumAt(v_uv + texel*vec2(1,-1))
      + lumAt(v_uv + texel*vec2(-1, 1)) + 2.0*lumAt(v_uv + texel*vec2(0, 1)) + lumAt(v_uv + texel*vec2(1, 1));
    float mag = sqrt(gx*gx + gy*gy);
    if (mag > u_edgeThreshold) rgb = u_edgeColor;
  }

  // Scanlines
  if (u_scanlines == 1) {
    float line = mod(floor(v_uv.y * u_resolution.y), 2.0);
    rgb *= 1.0 - line * u_scanlineIntensity * 0.5;
  }

  // Grid overlay
  if (u_grid == 1) {
    vec2 fc = v_uv * u_resolution;
    bool onLine = mod(fc.x, u_gridSpacing) < 1.0 || mod(fc.y, u_gridSpacing) < 1.0;
    if (onLine) rgb = mix(rgb, vec3(0.5), u_gridOpacity);
  }

  fragColor = vec4(clamp(rgb, 0.0, 1.0), src.a);
}`;

// ─── Topographic Contour Lines ────────────────────────────────────────────────
// Quantizes image luminance into N bands and draws contour lines at boundaries.
export const FS_TOPO = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2  u_resolution;
uniform float u_bands;        // 4–50
uniform vec3  u_lineColor;
uniform vec3  u_bgColor;
uniform int   u_transparent;  // 1 = original shows through
uniform float u_lineWidth;    // in pixels
uniform int   u_colorize;     // 1 = fill bands with gradient
uniform float u_contrast;     // (100 + contrast) / 100
uniform float u_brightness;   // brightness / 100
out vec4 fragColor;

float getLum(vec2 uv) {
  float l = dot(texture(u_tex, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
  return clamp((l + u_brightness) * u_contrast, 0.0, 1.0);
}

void main() {
  vec2 texel = 1.0 / u_resolution;
  vec4 src = texture(u_tex, v_uv);
  float lum  = getLum(v_uv);
  float band = floor(lum * u_bands);

  // Sample 8 neighbours at distance lineWidth/2 to detect band boundaries
  float halfLW = max(0.5, u_lineWidth * 0.5);
  bool onLine = false;
  vec2 dirs[8] = vec2[8](
    vec2(1.0,0.0), vec2(-1.0,0.0), vec2(0.0,1.0), vec2(0.0,-1.0),
    vec2(0.707,0.707), vec2(-0.707,0.707), vec2(0.707,-0.707), vec2(-0.707,-0.707)
  );
  for (int i = 0; i < 8; i++) {
    float nl = getLum(v_uv + dirs[i] * texel * halfLW);
    if (floor(nl * u_bands) != band) { onLine = true; break; }
  }

  vec3 rgb;
  if (onLine) {
    rgb = u_lineColor;
  } else if (u_transparent == 1) {
    rgb = src.rgb;
  } else if (u_colorize == 1) {
    float t = (band + 0.5) / u_bands;
    rgb = mix(u_bgColor, u_lineColor, t);
  } else {
    rgb = u_bgColor;
  }

  fragColor = vec4(rgb, 1.0);
}`;

// ─── Point Cloud / Halftone Dots ─────────────────────────────────────────────
// Renders the image as a grid of luminance-driven dots.
export const FS_POINTCLOUD = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2  u_resolution;
uniform float u_gridSize;    // px spacing
uniform float u_minDotSize;  // min radius px
uniform float u_maxDotSize;  // max radius px
uniform float u_jitter;      // 0–1
uniform int   u_invert;      // luminance→size inversion
uniform vec3  u_bgColor;
uniform vec3  u_accentColor;
uniform int   u_colorMode;   // 0=original 1=mono 2=accent 3=luminance 4=heatmap
uniform int   u_shape;       // 0=circle 1=square 2=diamond 3=ring 4=cross
uniform float u_opacity;
uniform int   u_seed;
out vec4 fragColor;

float hash2(float cx, float cy) {
  return fract(sin(cx * 127.1 + cy * 311.7 + float(u_seed) * 0.01) * 43758.5453);
}

vec3 heatmap(float t) {
  vec3 c0 = vec3(0.0,0.0,0.016);
  vec3 c1 = vec3(0.157,0.043,0.329);
  vec3 c2 = vec3(0.624,0.165,0.388);
  vec3 c3 = vec3(0.831,0.282,0.259);
  vec3 c4 = vec3(0.961,0.490,0.082);
  vec3 c5 = vec3(0.988,1.0,0.643);
  float fi = t * 5.0;
  int i = clamp(int(fi), 0, 4);
  float f = fi - float(i);
  if (i == 0) return mix(c0,c1,f);
  if (i == 1) return mix(c1,c2,f);
  if (i == 2) return mix(c2,c3,f);
  if (i == 3) return mix(c3,c4,f);
  return mix(c4,c5,f);
}

void main() {
  vec2 px = v_uv * u_resolution;
  float gs = u_gridSize;
  vec2 cellIdx = floor(px / gs);
  vec2 cellCenter = (cellIdx + 0.5) * gs;

  float jx = (hash2(cellIdx.x, cellIdx.y + 0.3)       * 2.0 - 1.0) * gs * u_jitter * 0.45;
  float jy = (hash2(cellIdx.x + 0.7, cellIdx.y + 1.1) * 2.0 - 1.0) * gs * u_jitter * 0.45;
  vec2 dotCenter = cellCenter + vec2(jx, jy);

  vec2 sampleUV = clamp(dotCenter / u_resolution, vec2(0.0), vec2(1.0));
  vec4 srcColor = texture(u_tex, sampleUV);
  float lum = dot(srcColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  if (u_invert == 1) lum = 1.0 - lum;

  float radius = mix(u_minDotSize, u_maxDotSize, lum);
  vec2 d = px - dotCenter;

  vec3 dotColor;
  if      (u_colorMode == 1) dotColor = vec3(lum);
  else if (u_colorMode == 2) dotColor = u_accentColor;
  else if (u_colorMode == 3) dotColor = vec3(lum);
  else if (u_colorMode == 4) dotColor = heatmap(lum);
  else                       dotColor = srcColor.rgb;

  bool inDot;
  if (u_shape == 1) {
    inDot = max(abs(d.x), abs(d.y)) <= radius;
  } else if (u_shape == 2) {
    inDot = (abs(d.x) + abs(d.y)) <= radius * 1.414;
  } else if (u_shape == 3) {
    float r = length(d);
    inDot = (r <= radius) && (r >= radius * 0.55);
  } else if (u_shape == 4) {
    float arm = radius * 0.35;
    inDot = (abs(d.x) <= arm || abs(d.y) <= arm) && length(d) <= radius;
  } else {
    inDot = length(d) <= radius;
  }

  float alpha = inDot ? u_opacity : 0.0;
  fragColor = vec4(mix(u_bgColor, dotColor, alpha), 1.0);
}`;
