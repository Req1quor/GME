import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context';
import type { DitherAlgo, DitherParams, AsciiParams, BrutalistParams, CybersigilismParams,
  HalftoneParams, MatrixRainParams, DotsParams, ContourParams, PixelSortParams, BlockifyParams,
  ThresholdEffectParams, EdgeDetectionParams, CrosshatchParams, WaveLinesParams,
  NoiseFieldParams, VoronoiParams, VhsParams } from '../types';
import type { ThermalParams } from '../effects/thermal';
import type { NightVisionParams } from '../effects/nightvision';
import type { InfraredParams } from '../effects/infrared';
import type { PointCloudParams } from '../effects/pointcloud';
import type { TopoParams } from '../effects/topo';

// ─── Palette presets ──────────────────────────────────────────────────────────

const PALETTE_PRESETS: Record<string, { label: string; colors: string[] }> = {
  custom: { label: 'PERSONNALISÉE', colors: [] },
  bw:     { label: 'MONO N/B', colors: ['#000000', '#ffffff'] },
  gameboy: { label: 'GAMEBOY', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  amber:   { label: 'AMBRE CRT', colors: ['#110700', '#3d1c00', '#ff8c00', '#ffcc44'] },
  c64:     { label: 'C64', colors: ['#000000','#ffffff','#883932','#67b6bd','#8b3f96','#55a049','#40318d','#bfce72','#8b5429','#574200','#b86962','#505050','#787878','#94e089','#7869c4','#9f9f9f'] },
  synthwave: { label: 'SYNTHWAVE', colors: ['#0d0221','#7b2d8b','#e040fb','#00e5ff','#ff1744','#1a0533'] },
};

// ─── UI helpers ───────────────────────────────────────────────────────────────

function ParamRow({ label, value, tip, children }: { label: string; value?: string | number; tip?: string; children: React.ReactNode }) {
  return (
    <div className="param-row">
      {label && (
        <div className="param-row-header">
          <span className="param-row-label">
            {label}
            {tip && <Tip text={tip} />}
          </span>
          {value !== undefined && <span className="param-row-value">{value}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

function Tip({ text }: { text: string }) {
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  return (
    <>
      <span
        ref={ref}
        className="tip-icon"
        onMouseEnter={() => {
          if (ref.current) {
            const r = ref.current.getBoundingClientRect();
            setCoords({ x: r.left + r.width / 2, y: r.top });
          }
        }}
        onMouseLeave={() => setCoords(null)}
      >i</span>
      {coords && createPortal(
        <div
          className="tip-box"
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y - 10,
            transform: 'translateX(-50%) translateY(-100%)',
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  );
}

function Slider({ min, max, step = 1, value, onChange }: { min: number; max: number; step?: number; value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const updateFill = (v: number) => {
    if (ref.current) {
      const pct = ((v - min) / (max - min)) * 100;
      ref.current.style.setProperty('--fill', `${pct}%`);
    }
  };
  useEffect(() => { updateFill(value); }, [value, min, max]);
  return (
    <input
      ref={ref}
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => { const v = Number(e.target.value); onChange(v); updateFill(v); }}
    />
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className={`toggle-row${value ? ' toggle-row--on' : ''}`}
      onClick={() => onChange(!value)}
    >
      <span className="toggle-label">{label}</span>
      <span className="toggle-switch" aria-hidden="true">
        <span className="toggle-knob" />
      </span>
    </button>
  );
}

function Accordion({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`accordion${open ? ' open' : ''}`}>
      <button className="accordion-header" onClick={() => setOpen(!open)}>
        <span>{label}</span>
        <span className="accordion-chevron">›</span>
      </button>
      <div className="accordion-inner">
        <div className="accordion-body">{children}</div>
      </div>
    </div>
  );
}

function QuickPresets({ presets }: { presets: { label: string; apply: () => void }[] }) {
  return (
    <div className="quick-presets">
      {presets.map(p => (
        <button key={p.label} className="btn quick-preset-btn" onClick={p.apply}>{p.label}</button>
      ))}
    </div>
  );
}

// ─── Dithering panel ─────────────────────────────────────────────────────────

function PaletteBuilder({ palette, onChange }: { palette: string[]; onChange: (p: string[]) => void }) {
  const add = () => onChange([...palette, '#ffffff']);
  const remove = (i: number) => onChange(palette.filter((_, j) => j !== i));
  const set = (i: number, v: string) => onChange(palette.map((c, j) => j === i ? v : c));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {palette.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <input type="color" value={c} onChange={e => set(i, e.target.value)}
              style={{ width: 22, height: 22, border: '1px solid var(--gm-border)', background: 'none', cursor: 'pointer', padding: 1 }} />
            <button className="btn" style={{ fontSize: 9, padding: '2px 4px', color: 'var(--gm-danger)' }} onClick={() => remove(i)}>✕</button>
          </div>
        ))}
        <button className="btn" style={{ fontSize: 10, padding: '3px 7px' }} onClick={add}>+</button>
      </div>
    </div>
  );
}

function DitherPanel() {
  const { params, updateParams } = useApp();
  const p = params.dither as DitherParams;
  const update = (partial: Partial<DitherParams>) => updateParams('dither', partial);

  const [presetKey, setPresetKey] = useState<string>('custom');

  const applyPreset = (key: string) => {
    setPresetKey(key);
    if (key !== 'custom') {
      update({ palette: PALETTE_PRESETS[key].colors });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Accordion label="Algorithme" defaultOpen>
        <ParamRow label="">
          <select value={p.algo} onChange={e => update({ algo: e.target.value as DitherAlgo })}>
            <optgroup label="Diffusion d'erreur — classique">
              <option value="floyd-steinberg">FLOYD–STEINBERG</option>
              <option value="atkinson">ATKINSON</option>
              <option value="jarvis">JARVIS–JUDICE–NINKE</option>
              <option value="stucki">STUCKI</option>
              <option value="sierra">SIERRA</option>
              <option value="sierra-lite">SIERRA LITE</option>
              <option value="simple2d">SIMPLE 2D</option>
            </optgroup>
            <optgroup label="Diffusion d'erreur — étendue">
              <option value="burkes">BURKES</option>
              <option value="sierra-2row">SIERRA 2 RANGS</option>
              <option value="fake-floyd">FAUX FLOYD–STEINBERG</option>
              <option value="shiau-fan-1">SHIAU–FAN 1</option>
              <option value="shiau-fan-2">SHIAU–FAN 2</option>
              <option value="shiau-fan-3">SHIAU–FAN 3</option>
              <option value="stevenson-arce">STEVENSON–ARCE</option>
              <option value="diagonal-diffusion">DIFFUSION DIAGONALE</option>
            </optgroup>
            <optgroup label="Ordonné — Bayer">
              <option value="bayer2">BAYER 2×2</option>
              <option value="bayer3">BAYER 3×3</option>
              <option value="bayer4">BAYER 4×4</option>
              <option value="bayer8">BAYER 8×8</option>
              <option value="bayer16">BAYER 16×16</option>
              <option value="bayer32">BAYER 32×32</option>
            </optgroup>
            <optgroup label="Ordonné — Points groupés">
              <option value="clustered-4">GROUPÉ 4×4</option>
              <option value="clustered-6">GROUPÉ 6×6</option>
              <option value="clustered-8">GROUPÉ 8×8</option>
            </optgroup>
            <optgroup label="Ordonné — Points dispersés">
              <option value="dispersed-2x2">DISPERSÉ 2×2</option>
              <option value="dispersed-4x4">DISPERSÉ 4×4</option>
              <option value="interleaved-gradient">GRADIENT ENTRELACÉ (IGN)</option>
              <option value="void-dispersed">VIDE DISPERSÉ</option>
              <option value="ulichney-bd">ULICHNEY BD</option>
              <option value="white-point-c">WHITE-POINT CENTRÉ</option>
              <option value="white-point-b">WHITE-POINT ÉQUILIBRÉ</option>
            </optgroup>
            <optgroup label="Patterns">
              <option value="pattern-2x2">PATTERN 2×2</option>
              <option value="pattern-3x3">PATTERN 3×3</option>
              <option value="pattern-4x4">PATTERN 4×4</option>
              <option value="pattern-5x2">PATTERN 5×2</option>
            </optgroup>
            <optgroup label="Bruit & Analogique">
              <option value="bluenoise">BRUIT BLEU</option>
              <option value="random">BRUIT BLANC</option>
              <option value="halftone">HALFTONE</option>
            </optgroup>
            <optgroup label="Spécial">
              <option value="threshold">SEUIL DUR</option>
              <option value="hilbert">COURBE DE HILBERT</option>
            </optgroup>
          </select>
        </ParamRow>
      </Accordion>

      <Accordion label="Ajustements" defaultOpen>
        <ParamRow label="Intensité" value={p.intensity?.toFixed(2)}
          tip="Amplifie ou atténue la force du tramage. En dessous de 1 = effet discret, au-dessus = plus marqué.">
          <Slider min={0} max={2} step={0.05} value={p.intensity ?? 1} onChange={v => update({ intensity: v })} />
        </ParamRow>
        <ParamRow label="Biais" value={((p.bias ?? 0.5) * 100).toFixed(0) + '%'}
          tip="Décale le point médian du tramage. Vers 0 = l'effet s'applique aux ombres, vers 1 = aux hautes lumières.">
          <Slider min={0} max={1} step={0.01} value={p.bias ?? 0.5} onChange={v => update({ bias: v })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.gammaCorrect ?? false} onChange={v => update({ gammaCorrect: v })} label="Correction gamma sRGB" />
          {(p.gammaCorrect ?? false) && <Tip text="Compense la non-linéarité sRGB avant tramage — donne des dégradés plus précis et des gris plus naturels." />}
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.monoMode ?? false} onChange={v => update({ monoMode: v })} label="Mode mono" />
        </ParamRow>
      </Accordion>

      <Accordion label="Teinte & Saturation">
        <ParamRow label="Teinte" value={(p.hueShift ?? 0) + '°'}>
          <Slider min={-180} max={180} value={p.hueShift ?? 0} onChange={v => update({ hueShift: v })} />
        </ParamRow>
        <ParamRow label="Saturation" value={(p.saturation ?? 100) + '%'}>
          <Slider min={0} max={200} value={p.saturation ?? 100} onChange={v => update({ saturation: v })} />
        </ParamRow>
      </Accordion>

      <Accordion label="Mélange">
        <ParamRow label="Fondu original" value={(p.blendOriginal ?? 0) + '%'}
          tip="Fondé l'effet avec l'image originale. 0 = 100% tramé, 100 = image originale intacte.">
          <Slider min={0} max={100} value={p.blendOriginal ?? 0} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>

      <Accordion label="Palette">
        <ParamRow label="Préréglage">
          <select value={presetKey} onChange={e => applyPreset(e.target.value)}>
            {Object.entries(PALETTE_PRESETS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </ParamRow>
        {presetKey === 'custom' && (
          <ParamRow label="Couleurs auto" value={p.paletteSize}>
            <Slider min={2} max={32} value={p.paletteSize} onChange={v => update({ paletteSize: v })} />
          </ParamRow>
        )}
        <ParamRow label="Palette perso">
          <PaletteBuilder palette={p.palette} onChange={pal => { setPresetKey('custom'); update({ palette: pal }); }} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── ASCII panel ─────────────────────────────────────────────────────────────

function AsciiPanel() {
  const { params, updateParams } = useApp();
  const p = params.ascii as AsciiParams;
  const update = (partial: Partial<AsciiParams>) => updateParams('ascii', partial);

  const presets = [
    { label: 'MATRIX', apply: () => update({ charset: '@#$%?!*+:. ', bgColor: '#000000', bgOpacity: 1, colored: false, charSize: 10, contrast: 20 }) },
    { label: 'HACKER', apply: () => update({ charset: '01', bgColor: '#000000', bgOpacity: 1, colored: false, charSize: 8, contrast: 30 }) },
    { label: 'NEON', apply: () => update({ charset: '▓▒░ ', bgColor: '#0d0221', bgOpacity: 1, colored: true, charSize: 12, contrast: 0 }) },
    { label: 'GHOST', apply: () => update({ charset: '.:-=+*#%@', bgColor: '#000000', bgOpacity: 0, colored: true, charSize: 10, contrast: 0 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Rendu" defaultOpen>
        <ParamRow label="Taille char" value={p.charSize + 'px'}>
          <Slider min={4} max={32} value={p.charSize} onChange={v => update({ charSize: v })} />
        </ParamRow>
        <ParamRow label="Ratio cellule" value={(p.cellAspect ?? 0.55).toFixed(2)}
          tip="Rapport hauteur/largeur d'une cellule de caractère. 0.5 environ compense l'espacement vertical des polices mono.">
          <Slider min={0.3} max={1} step={0.01} value={p.cellAspect ?? 0.55} onChange={v => update({ cellAspect: v })} />
        </ParamRow>
        <ParamRow label="Police">
          <select value={p.fontFamily ?? 'IBM Plex Mono'} onChange={e => update({ fontFamily: e.target.value })}>
            <option value="IBM Plex Mono">IBM PLEX MONO</option>
            <option value="Courier New">COURIER NEW</option>
            <option value="monospace">MONOSPACE</option>
            <option value="serif">SERIF</option>
          </select>
        </ParamRow>
        <ParamRow label="Échantillonnage"
          tip="Centre : couleur du pixel central de la cellule. Moyenne : couleur moyenne de tous les pixels couverts par la cellule.">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['center', 'average'] as const).map(m => (
              <button key={m} className={`btn${(p.samplingMode ?? 'center') === m ? ' active' : ''}`}
                style={{ flex: 1, fontSize: 10 }} onClick={() => update({ samplingMode: m })}>
                {m === 'center' ? 'CENTRE' : 'MOYENNE'}
              </button>
            ))}
          </div>
        </ParamRow>
      </Accordion>

      <Accordion label="Charset" defaultOpen>
        <ParamRow label="Séquence">
          <input type="text" value={p.charset} onChange={e => update({ charset: e.target.value })}
            style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.invert ?? false} onChange={v => update({ invert: v })} label="Inverser mapping" />
        </ParamRow>
        <ParamRow label="Mode">
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`btn${!p.colored ? ' active' : ''}`} style={{ flex: 1, fontSize: 10 }} onClick={() => update({ colored: false })}>MONO</button>
            <button className={`btn${p.colored ? ' active' : ''}`} style={{ flex: 1, fontSize: 10 }} onClick={() => update({ colored: true })}>COULEUR</button>
          </div>
        </ParamRow>
      </Accordion>

      <Accordion label="Exposition">
        <ParamRow label="Contraste" value={(p.contrast ?? 0)}>
          <Slider min={-100} max={100} value={p.contrast ?? 0} onChange={v => update({ contrast: v })} />
        </ParamRow>
        <ParamRow label="Luminosité" value={(p.brightness ?? 0)}>
          <Slider min={-100} max={100} value={p.brightness ?? 0} onChange={v => update({ brightness: v })} />
        </ParamRow>
      </Accordion>

      <Accordion label="Couleurs">
        <ParamRow label="Fond">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={p.bgColor ?? '#000000'} onChange={e => update({ bgColor: e.target.value })} />
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--gm-muted)' }}>{(p.bgColor ?? '#000000').toUpperCase()}</span>
          </div>
        </ParamRow>
        <ParamRow label="Opacité fond" value={Math.round((p.bgOpacity ?? 1) * 100) + '%'}
          tip="0% laisse l'image originale visible en transparence sous les caractères. Idéal pour un effet superposé.">
          <Slider min={0} max={1} step={0.05} value={p.bgOpacity ?? 1} onChange={v => update({ bgOpacity: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

function BrutalistPanel() {
  const { params, updateParams } = useApp();
  const p = params.brutalist as BrutalistParams;
  const update = (partial: Partial<BrutalistParams>) => updateParams('brutalist', partial);

  const presets = [
    { label: 'VHS', apply: () => update({ glitch: true, glitchIntensity: 4, glitchSeed: 42, chromaticAberration: true, chromaticAmount: 6, scanlines: true, scanlineIntensity: 0.4, noise: false, posterize: false }) },
    { label: 'GLITCH', apply: () => update({ glitch: true, glitchIntensity: 8, glitchSeed: Math.floor(Math.random() * 9999), chromaticAberration: true, chromaticAmount: 12, scanlines: false, noise: true, noiseAmount: 10, posterize: false }) },
    { label: 'GRAIN', apply: () => update({ noise: true, noiseAmount: 35, glitch: false, chromaticAberration: false, scanlines: false, posterize: false }) },
    { label: 'POSTER', apply: () => update({ posterize: true, posterizeLevels: 4, glitch: false, chromaticAberration: false, scanlines: false, noise: false }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />

      <Accordion label="Tons" defaultOpen>
        <ParamRow label="">
          <Toggle value={p.posterize} onChange={v => update({ posterize: v })} label="Postérisation" />
        </ParamRow>
        {p.posterize && (
          <ParamRow label="Niveaux" value={p.posterizeLevels}>
            <Slider min={2} max={8} value={p.posterizeLevels} onChange={v => update({ posterizeLevels: v })} />
          </ParamRow>
        )}
      </Accordion>

      <Accordion label="Glitch & Bruit" defaultOpen>
        <ParamRow label="">
          <Toggle value={p.glitch} onChange={v => update({ glitch: v })} label="Glitch slices" />
        </ParamRow>
        {p.glitch && (
          <>
            <ParamRow label="Intensité" value={p.glitchIntensity}>
              <Slider min={1} max={10} value={p.glitchIntensity} onChange={v => update({ glitchIntensity: v })} />
            </ParamRow>
            <ParamRow label="SEED" value={p.glitchSeed ?? 42}>
              <div style={{ display: 'flex', gap: 4 }}>
                <input type="number" value={p.glitchSeed ?? 42} onChange={e => update({ glitchSeed: Number(e.target.value) })} style={{ flex: 1 }} />
                <button className="btn" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => update({ glitchSeed: Math.floor(Math.random() * 99999) })}>RNG</button>
              </div>
            </ParamRow>
          </>
        )}
        <ParamRow label="">
          <Toggle value={p.noise ?? false} onChange={v => update({ noise: v })} label="Grain / Bruit" />
        </ParamRow>
        {(p.noise ?? false) && (
          <ParamRow label="Quantité" value={p.noiseAmount ?? 25}>
            <Slider min={1} max={80} value={p.noiseAmount ?? 25} onChange={v => update({ noiseAmount: v })} />
          </ParamRow>
        )}
        <ParamRow label="">
          <Toggle value={p.chromaticAberration ?? false} onChange={v => update({ chromaticAberration: v })} label="Aberration chromatique" />
        </ParamRow>
        {p.chromaticAberration && (
          <ParamRow label="Décalage" value={(p.chromaticAmount ?? 5) + 'px'}>
            <Slider min={1} max={30} value={p.chromaticAmount ?? 5} onChange={v => update({ chromaticAmount: v })} />
          </ParamRow>
        )}
        <ParamRow label="">
          <Toggle value={p.scanlines ?? false} onChange={v => update({ scanlines: v })} label="Scanlines CRT" />
        </ParamRow>
        {p.scanlines && (
          <ParamRow label="Intensité" value={((p.scanlineIntensity ?? 0.5) * 100).toFixed(0) + '%'}>
            <Slider min={0} max={1} step={0.05} value={p.scanlineIntensity ?? 0.5} onChange={v => update({ scanlineIntensity: v })} />
          </ParamRow>
        )}
      </Accordion>

      <Accordion label="Grille">
        <ParamRow label="">
          <Toggle value={p.grid ?? false} onChange={v => update({ grid: v })} label="Grille overlay" />
        </ParamRow>
        {p.grid && (
          <>
            <ParamRow label="Espacement" value={(p.gridSpacing ?? 16) + 'px'}>
              <Slider min={4} max={64} step={2} value={p.gridSpacing ?? 16} onChange={v => update({ gridSpacing: v })} />
            </ParamRow>
            <ParamRow label="Opacité" value={Math.round((p.gridOpacity ?? 0.2) * 100) + '%'}>
              <Slider min={0} max={1} step={0.05} value={p.gridOpacity ?? 0.2} onChange={v => update({ gridOpacity: v })} />
            </ParamRow>
          </>
        )}
      </Accordion>
    </div>
  );
}

// ─── Cybersigilism panel ─────────────────────────────────────────────────────

function CyberPanel() {
  const { params, updateParams } = useApp();
  const p = params.cybersigilism as CybersigilismParams;
  const update = (partial: Partial<CybersigilismParams>) => updateParams('cybersigilism', partial);

  const presets = [
    { label: 'SIGIL', apply: () => update({ complexity: 10, symmetry: 'quad', angularity: 0.65, color: '#818cf8', blendMode: 'screen', opacity: 0.9, strokeWidth: 1.2, glow: false }) },
    { label: 'CIRCUIT', apply: () => update({ complexity: 20, symmetry: 'none', angularity: 0.9, color: '#00e5ff', blendMode: 'screen', opacity: 0.8, strokeWidth: 0.8, glow: true, glowSize: 8 }) },
    { label: 'RUNE', apply: () => update({ complexity: 7, symmetry: 'vertical', angularity: 0.5, color: '#ff1744', blendMode: 'overlay', opacity: 1, strokeWidth: 2, glow: false }) },
    { label: 'COSMOS', apply: () => update({ complexity: 15, symmetry: 'quad', angularity: 0.2, color: '#ffffff', blendMode: 'screen', opacity: 0.6, strokeWidth: 1, glow: true, glowSize: 20 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Structure" defaultOpen>
        <ParamRow label="SEED" value={p.seed}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="number" value={p.seed} onChange={e => update({ seed: Number(e.target.value) })}
              style={{ flex: 1 }} />
            <button className="btn" style={{ fontSize: 10, padding: '4px 8px' }}
              onClick={() => update({ seed: Math.floor(Math.random() * 99999) })}>RNG</button>
          </div>
        </ParamRow>
        <ParamRow label="Complexité" value={p.complexity}>
          <Slider min={3} max={30} value={p.complexity} onChange={v => update({ complexity: v })} />
        </ParamRow>
        <ParamRow label="Symétrie"
          tip="Réfléchit le dessin sur un ou plusieurs axes. Quadrant = symétrie 4x pour un sigil plus structuré.">
          <select value={p.symmetry} onChange={e => update({ symmetry: e.target.value as CybersigilismParams['symmetry'] })}>
            <option value="none">AUCUNE</option>
            <option value="vertical">VERTICALE</option>
            <option value="horizontal">HORIZONTALE</option>
            <option value="quad">QUADRANT</option>
          </select>
        </ParamRow>
        <ParamRow label="Angularité" value={(p.angularity ?? 0.8).toFixed(2)}
          tip="0 = tracés lisses et courbes, 1 = lignes 100% angulaires type circuit électronique ou rune gothique.">
          <Slider min={0} max={1} step={0.01} value={p.angularity ?? 0.8} onChange={v => update({ angularity: v })} />
        </ParamRow>
      </Accordion>

      <Accordion label="Lignes" defaultOpen>
        <ParamRow label="Épaisseur" value={(p.strokeWidth ?? 1.2).toFixed(1)}>
          <Slider min={0.5} max={6} step={0.1} value={p.strokeWidth ?? 1.2} onChange={v => update({ strokeWidth: v })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.lineVariance ?? true} onChange={v => update({ lineVariance: v })} label="Variance épaisseur" />
        </ParamRow>
      </Accordion>

      <Accordion label="Visuel">
        <ParamRow label="Opacité" value={Math.round((p.opacity ?? 0.85) * 100) + '%'}>
          <Slider min={0} max={1} step={0.05} value={p.opacity ?? 0.85} onChange={v => update({ opacity: v })} />
        </ParamRow>
        <ParamRow label="Couleur">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={p.color} onChange={e => update({ color: e.target.value })} />
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--gm-muted)' }}>{p.color.toUpperCase()}</span>
          </div>
        </ParamRow>
        <ParamRow label="Blend mode"
          tip="Screen fonctionne idéalement sur fonds sombres. Overlay intègre le sigil dans l'image. Multiply assombrit.">
          <select value={p.blendMode} onChange={e => update({ blendMode: e.target.value as CybersigilismParams['blendMode'] })}>
            <option value="normal">NORMAL</option>
            <option value="multiply">MULTIPLY</option>
            <option value="screen">SCREEN</option>
            <option value="overlay">OVERLAY</option>
            <option value="hard-light">HARD LIGHT</option>
          </select>
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.bgFill ?? false} onChange={v => update({ bgFill: v })} label="Fond noir" />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.fillShapes ?? false} onChange={v => update({ fillShapes: v })} label="Formes remplies" />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.glow ?? false} onChange={v => update({ glow: v })} label="Glow / Lueur" />
        </ParamRow>
        {(p.glow ?? false) && (
          <ParamRow label="Taille glow" value={(p.glowSize ?? 12) + 'px'}>
            <Slider min={2} max={40} value={p.glowSize ?? 12} onChange={v => update({ glowSize: v })} />
          </ParamRow>
        )}
      </Accordion>
    </div>
  );
}

// ─── Thermal panel ────────────────────────────────────────────────────────────

function ThermalPanel() {
  const { params, updateParams } = useApp();
  const p = params.thermal as ThermalParams;
  const update = (partial: Partial<ThermalParams>) => updateParams('thermal', partial);

  const presets = [
    { label: 'FER', apply: () => update({ palette: 'iron', contrast: 10, brightness: 0, invert: false, blur: 0, edgeEnhance: 0, isotherms: 0, histStretch: false }) },
    { label: 'PLASMA', apply: () => update({ palette: 'plasma', contrast: 15, brightness: 0, invert: false, blur: 1, histStretch: true }) },
    { label: 'FROID', apply: () => update({ palette: 'cool', contrast: 5, brightness: 0, invert: false, blur: 0 }) },
    { label: 'CONTOURS', apply: () => update({ palette: 'greys', contrast: 20, brightness: 0, edgeEnhance: 70, edgeColor: '#00ffee', blur: 2, isotherms: 0 }) },
    { label: 'ISOTHERMES', apply: () => update({ palette: 'inferno', contrast: 10, isotherms: 8, isothermColor: '#00ffee', blur: 2 }) },
    { label: 'VIRIDIS', apply: () => update({ palette: 'viridis', contrast: 15, histStretch: true, blur: 1 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Palette" defaultOpen>
        <ParamRow label="Palette fausse couleur">
          <select value={p.palette} onChange={e => update({ palette: e.target.value as ThermalParams['palette'] })}>
            <option value="iron">FER (caméra thermique)</option>
            <option value="plasma">PLASMA</option>
            <option value="thermal">THERMIQUE (bleu→rouge)</option>
            <option value="cool">FROID (monochrome bleu)</option>
            <option value="spectrum">SPECTRE complet</option>
            <option value="inferno">INFERNO</option>
            <option value="rainbow">ARC-EN-CIEL</option>
            <option value="greys">NIVEAUX DE GRIS</option>
            <option value="viridis">VIRIDIS</option>
            <option value="magma">MAGMA</option>
          </select>
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.invert ?? false} onChange={v => update({ invert: v })} label="Inverser chaud/froid" />
        </ParamRow>
        <ParamRow label="" tip="Étire le range de luminosité pour maximiser le contraste de la palette.">
          <Toggle value={p.histStretch ?? false} onChange={v => update({ histStretch: v })} label="Étirement histogramme (auto-range)" />
        </ParamRow>
      </Accordion>
      <Accordion label="Exposition" defaultOpen>
        <ParamRow label="Contraste" value={p.contrast}>
          <Slider min={-50} max={100} value={p.contrast} onChange={v => update({ contrast: v })} />
        </ParamRow>
        <ParamRow label="Luminosité" value={p.brightness}>
          <Slider min={-50} max={50} value={p.brightness} onChange={v => update({ brightness: v })} />
        </ParamRow>
        <ParamRow label="Flou" value={p.blur ?? 0} tip="Lisse l'image avant la conversion thermique. Utile pour réduire le bruit pixelisé.">
          <Slider min={0} max={6} step={1} value={p.blur ?? 0} onChange={v => update({ blur: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Détection de bords">
        <ParamRow label="Rehaussement" value={(p.edgeEnhance ?? 0) + '%'} tip="Superpose les contours Sobel sur l'image thermique.">
          <Slider min={0} max={100} value={p.edgeEnhance ?? 0} onChange={v => update({ edgeEnhance: v })} />
        </ParamRow>
        {(p.edgeEnhance ?? 0) > 0 && (
          <ParamRow label="Couleur contours">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="color" value={p.edgeColor ?? '#ffffff'} onChange={e => update({ edgeColor: e.target.value })} />
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--gm-muted)' }}>{(p.edgeColor ?? '#ffffff').toUpperCase()}</span>
            </div>
          </ParamRow>
        )}
      </Accordion>
      <Accordion label="Isothermes">
        <ParamRow label="Nombre" value={p.isotherms ?? 0} tip="Trace des courbes de niveau sur les zones de température égale.">
          <Slider min={0} max={15} step={1} value={p.isotherms ?? 0} onChange={v => update({ isotherms: v })} />
        </ParamRow>
        {(p.isotherms ?? 0) > 0 && (
          <ParamRow label="Couleur isotherme">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="color" value={p.isothermColor ?? '#aaffee'} onChange={e => update({ isothermColor: e.target.value })} />
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--gm-muted)' }}>{(p.isothermColor ?? '#aaffee').toUpperCase()}</span>
            </div>
          </ParamRow>
        )}
      </Accordion>
      <Accordion label="Artefacts capteur">
        <ParamRow label="Bruit capteur" value={p.noiseAmount ?? 0} tip="Simule le bruit de blocs 2×2 d'un capteur thermique bas résolution.">
          <Slider min={0} max={30} step={1} value={p.noiseAmount ?? 0} onChange={v => update({ noiseAmount: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Mélange">
        <ParamRow label="Fondu original" value={(p.blendOriginal ?? 0) + '%'}
          tip="0% = rendu thermique pur. 100% = image originale.">
          <Slider min={0} max={100} value={p.blendOriginal ?? 0} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Night Vision panel ───────────────────────────────────────────────────────

function NightVisionPanel() {
  const { params, updateParams } = useApp();
  const p = params.nightvision as NightVisionParams;
  const update = (partial: Partial<NightVisionParams>) => updateParams('nightvision', partial);

  const presets = [
    { label: 'GEN 3', apply: () => update({ generation: 'gen3', gain: 5, noiseAmount: 15, noiseType: 'shot', scanlines: true, scanlineIntensity: 0.3, vignetteStrength: 0.8, phosphorColor: '#1aff44', bloom: 2, haloStrength: 0.2, tubeDistortion: 0.1 }) },
    { label: 'GEN 1', apply: () => update({ generation: 'gen1', gain: 3, noiseAmount: 40, noiseType: 'scintillation', scanlines: true, scanlineIntensity: 0.6, vignetteStrength: 0.95, phosphorColor: '#44ff22', bloom: 1, haloStrength: 0, tubeDistortion: 0.3 }) },
    { label: 'BLANC', apply: () => update({ generation: 'gen3', gain: 4, noiseAmount: 10, noiseType: 'shot', scanlines: false, scanlineIntensity: 0.2, vignetteStrength: 0.5, phosphorColor: '#f0f8ff', bloom: 3, haloStrength: 0.1, tubeDistortion: 0 }) },
    { label: 'CINÉMA', apply: () => update({ generation: 'gen2', gain: 2, noiseAmount: 30, noiseType: 'speckle', scanlines: false, vignetteStrength: 0.6, phosphorColor: '#1aff44', bloom: 5, haloStrength: 0.4, tubeDistortion: 0.05 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Génération" defaultOpen>
        <ParamRow label="Type de tube" tip="Gen 1 = bruit élevé, distorsion barillet marquée. Gen 2 = équilibré. Gen 3 = net, faible bruit.">
          <select value={p.generation ?? 'gen2'} onChange={e => update({ generation: e.target.value as NightVisionParams['generation'] })}>
            <option value="gen1">GEN 1 (années 60-70, tube bruyant)</option>
            <option value="gen2">GEN 2 (années 80, standard militaire)</option>
            <option value="gen3">GEN 3 (années 90+, haute performance)</option>
          </select>
        </ParamRow>
      </Accordion>
      <Accordion label="Amplification" defaultOpen>
        <ParamRow label="Gain" value={p.gain} tip="Amplifie la luminosité. Valeurs élevées = zones très sombres visibles, mais bruit accru.">
          <Slider min={1} max={12} step={0.5} value={p.gain} onChange={v => update({ gain: v })} />
        </ParamRow>
        <ParamRow label="Bloom" value={p.bloom} tip="Diffusion lumineuse autour des points brillants.">
          <Slider min={0} max={8} step={0.5} value={p.bloom} onChange={v => update({ bloom: v })} />
        </ParamRow>
        <ParamRow label="Halo" value={((p.haloStrength ?? 0) * 100).toFixed(0) + '%'} tip="Halo autour des sources lumineuses intenses.">
          <Slider min={0} max={1} step={0.05} value={p.haloStrength ?? 0} onChange={v => update({ haloStrength: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Phosphore" defaultOpen>
        <ParamRow label="Couleur phosphore" tip="Couleur de l'écran phosphorescent. Vert P22 classique, blanc pour gen 3 MILSPEC, bleu-vert pour tubes avancés.">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={p.phosphorColor ?? '#1aff44'} onChange={e => update({ phosphorColor: e.target.value })} />
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--gm-muted)' }}>{(p.phosphorColor ?? '#1aff44').toUpperCase()}</span>
          </div>
        </ParamRow>
      </Accordion>
      <Accordion label="Artefacts" defaultOpen>
        <ParamRow label="Bruit" value={p.noiseAmount}>
          <Slider min={0} max={60} value={p.noiseAmount} onChange={v => update({ noiseAmount: v })} />
        </ParamRow>
        <ParamRow label="Type de bruit" tip="Shot = grains aléatoires. Scintillation = scintillement irrégulier. Speckle = granulation cohérente.">
          <select value={p.noiseType ?? 'shot'} onChange={e => update({ noiseType: e.target.value as NightVisionParams['noiseType'] })}>
            <option value="shot">SHOT (grains aléatoires)</option>
            <option value="scintillation">SCINTILLATION (fluctuant)</option>
            <option value="speckle">SPECKLE (granulaire)</option>
          </select>
        </ParamRow>
        <ParamRow label="Vignette" value={((p.vignetteStrength ?? 0.7) * 100).toFixed(0) + '%'}
          tip="Assombrit les bords comme l'optique d'un tube intensificateur.">
          <Slider min={0} max={1} step={0.05} value={p.vignetteStrength ?? 0.7} onChange={v => update({ vignetteStrength: v })} />
        </ParamRow>
        <ParamRow label="Distorsion tube" value={((p.tubeDistortion ?? 0) * 100).toFixed(0) + '%'} tip="Distorsion barillet optique caractéristique des tubes intensificateurs d'image.">
          <Slider min={0} max={0.5} step={0.02} value={p.tubeDistortion ?? 0} onChange={v => update({ tubeDistortion: v })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.scanlines ?? true} onChange={v => update({ scanlines: v })} label="Scanlines tube" />
        </ParamRow>
        {(p.scanlines ?? true) && (
          <ParamRow label="Intensité" value={((p.scanlineIntensity ?? 0.4) * 100).toFixed(0) + '%'}>
            <Slider min={0} max={1} step={0.05} value={p.scanlineIntensity ?? 0.4} onChange={v => update({ scanlineIntensity: v })} />
          </ParamRow>
        )}
      </Accordion>
      <Accordion label="Mélange">
        <ParamRow label="Fondu original" value={(p.blendOriginal ?? 0) + '%'}>
          <Slider min={0} max={100} value={p.blendOriginal ?? 0} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Infrared panel ───────────────────────────────────────────────────────────

function InfraredPanel() {
  const { params, updateParams } = useApp();
  const p = params.infrared as InfraredParams;
  const update = (partial: Partial<InfraredParams>) => updateParams('infrared', partial);

  const presets = [
    { label: 'AEROCHROME', apply: () => update({ style: 'aerochrome', grassBoost: 1.2, skyDarken: 0.8, saturation: 140, contrast: 15, filmGrain: 8, halation: 30, toneShift: 0, channelMix: 1 }) },
    { label: 'EKTACHROME', apply: () => update({ style: 'ektachrome', grassBoost: 1, skyDarken: 0.7, saturation: 160, contrast: 10, filmGrain: 5, halation: 20, toneShift: 0, channelMix: 1 }) },
    { label: 'HIE MONO', apply: () => update({ style: 'kodak-hie', grassBoost: 1.5, skyDarken: 0.9, saturation: 100, contrast: 25, filmGrain: 15, halation: 0, toneShift: 0, channelMix: 1 }) },
    { label: 'DIGITAL', apply: () => update({ style: 'digital', grassBoost: 0.8, skyDarken: 0.5, saturation: 110, contrast: 5, filmGrain: 0, halation: 10, toneShift: 0, channelMix: 1 }) },
    { label: 'FALSE COLOR', apply: () => update({ style: 'false-color', grassBoost: 1, skyDarken: 0.8, saturation: 180, contrast: 20, filmGrain: 0, halation: 0, toneShift: 0, channelMix: 1 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Style" defaultOpen>
        <ParamRow label="Film / capteur infrarouge"
          tip="Chaque style simule un rendu IR différent. Aerochrome = végétation rose, film Kodak. Kodak HIE = monochrome pur. False-color = cartographie scientifique SWIR.">
          <select value={p.style} onChange={e => update({ style: e.target.value as InfraredParams['style'] })}>
            <option value="aerochrome">AEROCHROME (Kodak EIR, végétation magenta)</option>
            <option value="ektachrome">EKTACHROME IR (végétation jaune, tons chauds)</option>
            <option value="kodak-hie">KODAK HIE (noir & blanc IR pur)</option>
            <option value="digital">DIGITAL (converti moderne, naturel)</option>
            <option value="false-color">FALSE COLOR (SWIR spectral, scientifique)</option>
          </select>
        </ParamRow>
      </Accordion>
      <Accordion label="Paramètres IR" defaultOpen>
        <ParamRow label="Boost végétation" value={p.grassBoost?.toFixed(1)}
          tip="Amplifie le signal IR sur les zones végétales (herbe, arbres — haute réflectance NIR).">
          <Slider min={0} max={2} step={0.1} value={p.grassBoost ?? 1} onChange={v => update({ grassBoost: v })} />
        </ParamRow>
        <ParamRow label="Assombrissement ciel" value={((p.skyDarken ?? 0.7) * 100).toFixed(0) + '%'}
          tip="Crush les zones bleues (ciel). L'atmosphère absorbe le NIR, résultant en un ciel très sombre.">
          <Slider min={0} max={1} step={0.05} value={p.skyDarken ?? 0.7} onChange={v => update({ skyDarken: v })} />
        </ParamRow>
        <ParamRow label="Intensité canal" value={((p.channelMix ?? 1) * 100).toFixed(0) + '%'}
          tip="Intensité du remapping des canaux. 0% = image originale, 100% = full IR.">
          <Slider min={0} max={1} step={0.05} value={p.channelMix ?? 1} onChange={v => update({ channelMix: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Couleur" defaultOpen>
        <ParamRow label="Saturation" value={(p.saturation ?? 130) + '%'}>
          <Slider min={0} max={250} value={p.saturation ?? 130} onChange={v => update({ saturation: v })} />
        </ParamRow>
        <ParamRow label="Contraste" value={p.contrast ?? 10}>
          <Slider min={-50} max={100} value={p.contrast ?? 10} onChange={v => update({ contrast: v })} />
        </ParamRow>
        <ParamRow label="Virage tonal" value={(p.toneShift ?? 0) + '°'} tip="Rotation HSL post-traitement. Permet de décaler créativement les teintes IR.">
          <Slider min={-180} max={180} step={5} value={p.toneShift ?? 0} onChange={v => update({ toneShift: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Caractère film">
        <ParamRow label="Grain film" value={p.filmGrain ?? 0} tip="Grain par blocs 4×4, caractéristique des films IR rapides comme le Kodak HIE.">
          <Slider min={0} max={40} step={1} value={p.filmGrain ?? 0} onChange={v => update({ filmGrain: v })} />
        </ParamRow>
        <ParamRow label="Halation" value={p.halation ?? 0} tip="Bloom orangé sur les hautes lumières, dû à la diffusion de la lumière IR dans l'émulsion.">
          <Slider min={0} max={100} step={5} value={p.halation ?? 0} onChange={v => update({ halation: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Mélange">
        <ParamRow label="Fondu original" value={(p.blendOriginal ?? 0) + '%'}>
          <Slider min={0} max={100} value={p.blendOriginal ?? 0} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Point Cloud panel ────────────────────────────────────────────────────────

function PointCloudPanel() {
  const { params, updateParams } = useApp();
  const p = params.pointcloud as PointCloudParams;
  const update = (partial: Partial<PointCloudParams>) => updateParams('pointcloud', partial);

  const presets = [
    { label: 'LIDAR', apply: () => update({ gridSize: 6, minDotSize: 0.5, maxDotSize: 4, colorMode: 'mono', bgColor: '#000000', jitter: 0.2, shape: 'circle', glow: 0, connectLines: false }) },
    { label: 'SCATTER', apply: () => update({ gridSize: 10, minDotSize: 1, maxDotSize: 8, colorMode: 'original', bgColor: '#000000', jitter: 0.6, shape: 'circle', glow: 3, connectLines: false }) },
    { label: 'RÉSEAU', apply: () => update({ gridSize: 14, minDotSize: 1, maxDotSize: 5, colorMode: 'accent', accentColor: '#a855f7', bgColor: '#000000', jitter: 0.1, shape: 'circle', glow: 6, connectLines: true, connectThreshold: 1.5, connectOpacity: 40 }) },
    { label: 'HEATMAP', apply: () => update({ gridSize: 8, minDotSize: 0.5, maxDotSize: 7, colorMode: 'heatmap', bgColor: '#050010', jitter: 0.3, shape: 'circle', glow: 4, connectLines: false }) },
    { label: 'DIAMANT', apply: () => update({ gridSize: 10, minDotSize: 1, maxDotSize: 6, colorMode: 'luminance', accentColor: '#00ffff', bgColor: '#000000', jitter: 0.15, shape: 'diamond', glow: 5, connectLines: false }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Grille" defaultOpen>
        <ParamRow label="Taille grille" value={p.gridSize + 'px'}
          tip="Distance entre les points d'échantillonnage. Plus petite = plus de points.">
          <Slider min={3} max={40} value={p.gridSize} onChange={v => update({ gridSize: v })} />
        </ParamRow>
        <ParamRow label="Jitter" value={(p.jitter ?? 0.3).toFixed(2)}
          tip="Décale aléatoirement chaque point. 0 = grille parfaite, 1 = nuage organique.">
          <Slider min={0} max={1} step={0.05} value={p.jitter ?? 0.3} onChange={v => update({ jitter: v })} />
        </ParamRow>
        <ParamRow label="SEED" value={p.seed ?? 42}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="number" value={p.seed ?? 42} onChange={e => update({ seed: Number(e.target.value) })} style={{ flex: 1 }} />
            <button className="btn" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => update({ seed: Math.floor(Math.random() * 99999) })}>RNG</button>
          </div>
        </ParamRow>
      </Accordion>
      <Accordion label="Points" defaultOpen>
        <ParamRow label="Forme">
          <select value={p.shape ?? 'circle'} onChange={e => update({ shape: e.target.value as PointCloudParams['shape'] })}>
            <option value="circle">CERCLE</option>
            <option value="square">CARRÉ</option>
            <option value="cross">CROIX</option>
            <option value="ring">ANNEAU</option>
            <option value="diamond">DIAMANT</option>
          </select>
        </ParamRow>
        <ParamRow label="Taille min" value={p.minDotSize?.toFixed(1)}>
          <Slider min={0.5} max={5} step={0.5} value={p.minDotSize ?? 0.5} onChange={v => update({ minDotSize: v })} />
        </ParamRow>
        <ParamRow label="Taille max" value={p.maxDotSize?.toFixed(1)}>
          <Slider min={1} max={20} step={0.5} value={p.maxDotSize ?? 5} onChange={v => update({ maxDotSize: v })} />
        </ParamRow>
        <ParamRow label="Bruit de taille" value={((p.sizeNoise ?? 0) * 100).toFixed(0) + '%'} tip="Variation aléatoire de la taille, indépendante de la luminosité.">
          <Slider min={0} max={1} step={0.05} value={p.sizeNoise ?? 0} onChange={v => update({ sizeNoise: v })} />
        </ParamRow>
        <ParamRow label="Opacité" value={(p.opacity ?? 100) + '%'}>
          <Slider min={10} max={100} step={5} value={p.opacity ?? 100} onChange={v => update({ opacity: v })} />
        </ParamRow>
        <ParamRow label="Glow" value={p.glow ?? 0} tip="Halo lumineux autour de chaque point.">
          <Slider min={0} max={20} step={1} value={p.glow ?? 0} onChange={v => update({ glow: v })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.invert ?? false} onChange={v => update({ invert: v })} label="Inverser taille/luminosité" />
        </ParamRow>
      </Accordion>
      <Accordion label="Couleurs">
        <ParamRow label="Mode couleur">
          <select value={p.colorMode ?? 'original'} onChange={e => update({ colorMode: e.target.value as PointCloudParams['colorMode'] })}>
            <option value="original">COULEUR ORIGINALE</option>
            <option value="mono">MONOCHROME</option>
            <option value="accent">COULEUR ACCENT</option>
            <option value="luminance">DÉGRADÉ LUMINANCE</option>
            <option value="heatmap">HEATMAP (thermique)</option>
          </select>
        </ParamRow>
        {(p.colorMode === 'accent' || p.colorMode === 'luminance') && (
          <ParamRow label="Couleur accent">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="color" value={p.accentColor ?? '#a855f7'} onChange={e => update({ accentColor: e.target.value })} />
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--gm-muted)' }}>{(p.accentColor ?? '#a855f7').toUpperCase()}</span>
            </div>
          </ParamRow>
        )}
        <ParamRow label="Fond">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={p.bgColor ?? '#000000'} onChange={e => update({ bgColor: e.target.value })} />
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--gm-muted)' }}>{(p.bgColor ?? '#000000').toUpperCase()}</span>
          </div>
        </ParamRow>
      </Accordion>
      <Accordion label="Lignes de connexion">
        <ParamRow label="">
          <Toggle value={p.connectLines ?? false} onChange={v => update({ connectLines: v })} label="Connecter les points voisins" />
        </ParamRow>
        {(p.connectLines ?? false) && (
          <>
            <ParamRow label="Seuil" value={(p.connectThreshold ?? 1.5).toFixed(1) + 'x'} tip="Distance max en multiples de la taille de grille.">
              <Slider min={1} max={3} step={0.1} value={p.connectThreshold ?? 1.5} onChange={v => update({ connectThreshold: v })} />
            </ParamRow>
            <ParamRow label="Opacité lignes" value={(p.connectOpacity ?? 40) + '%'}>
              <Slider min={0} max={100} step={5} value={p.connectOpacity ?? 40} onChange={v => update({ connectOpacity: v })} />
            </ParamRow>
          </>
        )}
      </Accordion>
    </div>
  );
}

// ─── Topo panel ───────────────────────────────────────────────────────────────

function TopoPanel() {
  const { params, updateParams } = useApp();
  const p = params.topo as TopoParams;
  const update = (partial: Partial<TopoParams>) => updateParams('topo', partial);

  const presets = [
    { label: 'RELIEF', apply: () => update({ bands: 16, lineColor: '#ffffff', bgColor: '#111113', transparent: false, colorize: false, lineWidth: 0.8, colorPalette: 'mono', contrast: 25, blur: 1, glow: 0, majorLines: 5, majorLineMultiplier: 2.5, noiseAmount: 0 }) },
    { label: 'TERRAIN', apply: () => update({ bands: 12, lineColor: '#d4a547', bgColor: '#1a120a', transparent: false, colorize: true, lineWidth: 1, colorPalette: 'earth', contrast: 15, blur: 2, glow: 0, majorLines: 4, majorLineMultiplier: 2 }) },
    { label: 'NÉON', apply: () => update({ bands: 20, lineColor: '#00ffaa', bgColor: '#000000', transparent: false, colorize: false, lineWidth: 0.8, colorPalette: 'neon', contrast: 30, blur: 1, glow: 8, glowColor: '#00ffaa', majorLines: 0, noiseAmount: 3 }) },
    { label: 'OCÉAN', apply: () => update({ bands: 15, lineColor: '#60efff', bgColor: '#000a18', transparent: false, colorize: true, lineWidth: 1, colorPalette: 'ocean', contrast: 20, blur: 2, glow: 5, glowColor: '#60efff', majorLines: 5, majorLineMultiplier: 2 }) },
    { label: 'OVERLAY', apply: () => update({ bands: 10, lineColor: '#a855f7', bgColor: '#000000', transparent: true, colorize: false, lineWidth: 1.5, colorPalette: 'mono', contrast: 20, blur: 0, glow: 4, glowColor: '#a855f7', majorLines: 0 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Bandes" defaultOpen>
        <ParamRow label="Nombre de bandes" value={p.bands}
          tip="Détermine la résolution des courbes de niveau. Plus de bandes = détail plus fin.">
          <Slider min={3} max={50} value={p.bands} onChange={v => update({ bands: v })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.transparent ?? false} onChange={v => update({ transparent: v })} label="Fond transparent (overlay)" />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.colorize ?? false} onChange={v => update({ colorize: v })} label="Bandes colorisées" />
        </ParamRow>
        {(p.colorize ?? false) && (
          <ParamRow label="Palette bandes">
            <select value={p.colorPalette ?? 'mono'} onChange={e => update({ colorPalette: e.target.value as TopoParams['colorPalette'] })}>
              <option value="mono">MONO (noir→blanc)</option>
              <option value="warm">CHAUD</option>
              <option value="cool">FROID</option>
              <option value="neon">NÉON</option>
              <option value="earth">TERRE</option>
              <option value="ocean">OCÉAN</option>
              <option value="sunset">COUCHER DE SOLEIL</option>
            </select>
          </ParamRow>
        )}
      </Accordion>
      <Accordion label="Lignes" defaultOpen>
        <ParamRow label="Couleur ligne">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={p.lineColor ?? '#ffffff'} onChange={e => update({ lineColor: e.target.value })} />
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--gm-muted)' }}>{(p.lineColor ?? '#ffffff').toUpperCase()}</span>
          </div>
        </ParamRow>
        <ParamRow label="Épaisseur" value={p.lineWidth?.toFixed(1)}>
          <Slider min={0.5} max={4} step={0.5} value={p.lineWidth ?? 1} onChange={v => update({ lineWidth: v })} />
        </ParamRow>
        <ParamRow label="Glow" value={p.glow ?? 0} tip="Halo lumineux autour des lignes de contour.">
          <Slider min={0} max={20} step={1} value={p.glow ?? 0} onChange={v => update({ glow: v })} />
        </ParamRow>
        {(p.glow ?? 0) > 0 && (
          <ParamRow label="Couleur glow">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="color" value={p.glowColor ?? p.lineColor ?? '#ffffff'} onChange={e => update({ glowColor: e.target.value })} />
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--gm-muted)' }}>{(p.glowColor ?? '#ffffff').toUpperCase()}</span>
            </div>
          </ParamRow>
        )}
      </Accordion>
      <Accordion label="Lignes majeures">
        <ParamRow label="Fréquence" value={p.majorLines ?? 0} tip="0 = désactivé. N = toutes les N bandes, une ligne plus épaisse. Comme les courbes maîtresses topographiques.">
          <Slider min={0} max={10} step={1} value={p.majorLines ?? 0} onChange={v => update({ majorLines: v })} />
        </ParamRow>
        {(p.majorLines ?? 0) > 0 && (
          <ParamRow label="Multiplicateur" value={(p.majorLineMultiplier ?? 2).toFixed(1) + 'x'} tip="Combien de fois plus épaisses sont les lignes majeures.">
            <Slider min={1.5} max={5} step={0.5} value={p.majorLineMultiplier ?? 2} onChange={v => update({ majorLineMultiplier: v })} />
          </ParamRow>
        )}
      </Accordion>
      <Accordion label="Fond">
        <ParamRow label="Couleur fond">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={p.bgColor ?? '#000000'} onChange={e => update({ bgColor: e.target.value })} />
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--gm-muted)' }}>{(p.bgColor ?? '#000000').toUpperCase()}</span>
          </div>
        </ParamRow>
      </Accordion>
      <Accordion label="Traitement entrée">
        <ParamRow label="Contraste" value={p.contrast ?? 20}>
          <Slider min={-50} max={100} value={p.contrast ?? 20} onChange={v => update({ contrast: v })} />
        </ParamRow>
        <ParamRow label="Luminosité" value={p.brightness ?? 0}>
          <Slider min={-50} max={50} value={p.brightness ?? 0} onChange={v => update({ brightness: v })} />
        </ParamRow>
        <ParamRow label="Flou" value={p.blur ?? 0} tip="Lisse l'image avant la quantification — produit des courbes de niveau plus douces et organiques.">
          <Slider min={0} max={8} step={1} value={p.blur ?? 0} onChange={v => update({ blur: v })} />
        </ParamRow>
        <ParamRow label="Bruit micro" value={p.noiseAmount ?? 0} tip="Ajoute une légère variation organique au niveau de luminance, pour briser la régularité.">
          <Slider min={0} max={20} step={1} value={p.noiseAmount ?? 0} onChange={v => update({ noiseAmount: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Halftone panel ───────────────────────────────────────────────────────────

function HalftonePanel() {
  const { params, updateParams } = useApp();
  const p = params.halftone as HalftoneParams;
  const update = (partial: Partial<HalftoneParams>) => updateParams('halftone', partial);

  const presets = [
    { label: 'JOURNAL', apply: () => update({ mode: 'mono', dotShape: 'circle', gridSize: 6, angle: 15, invert: false, bgColor: '#ffffff', fgColor: '#000000', gamma: 1.2 }) },
    { label: 'CMYK', apply: () => update({ mode: 'cmyk', dotShape: 'circle', gridSize: 8, angle: 15, invert: false, bgColor: '#ffffff', fgColor: '#000000', gamma: 1 }) },
    { label: 'SERIGRAPHIE', apply: () => update({ mode: 'mono', dotShape: 'circle', gridSize: 12, angle: 0, invert: false, bgColor: '#f5e6c8', fgColor: '#1a1a2e', gamma: 1.5 }) },
    { label: 'NÉGATIF', apply: () => update({ mode: 'mono', dotShape: 'circle', gridSize: 8, angle: 15, invert: true, bgColor: '#000000', fgColor: '#ffffff', gamma: 1 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Trame" defaultOpen>
        <ParamRow label="Mode">
          <select value={p.mode} onChange={e => update({ mode: e.target.value as HalftoneParams['mode'] })}>
            <option value="mono">MONO</option>
            <option value="cmyk">CMYK (4 angles)</option>
            <option value="rgb">RVB</option>
            <option value="custom">PERSONNALISÉ</option>
          </select>
        </ParamRow>
        <ParamRow label="Forme points">
          <select value={p.dotShape} onChange={e => update({ dotShape: e.target.value as HalftoneParams['dotShape'] })}>
            <option value="circle">CERCLE</option>
            <option value="ellipse">ELLIPSE</option>
            <option value="line">LIGNE</option>
            <option value="diamond">DIAMANT</option>
          </select>
        </ParamRow>
        <ParamRow label="Taille grille" value={p.gridSize + 'px'}>
          <Slider min={2} max={40} value={p.gridSize} onChange={v => update({ gridSize: v })} />
        </ParamRow>
        <ParamRow label="Angle" value={p.angle + '°'}>
          <Slider min={0} max={90} value={p.angle} onChange={v => update({ angle: v })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.invert} onChange={v => update({ invert: v })} label="Inverser" />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.softEdge} onChange={v => update({ softEdge: v })} label="Bords doux" />
        </ParamRow>
      </Accordion>
      <Accordion label="Couleurs" defaultOpen>
        <ParamRow label="Fond">
          <input type="color" value={p.bgColor} onChange={e => update({ bgColor: e.target.value })} />
        </ParamRow>
        <ParamRow label="Points">
          <input type="color" value={p.fgColor} onChange={e => update({ fgColor: e.target.value })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Ajustements">
        <ParamRow label="Gamma" value={p.gamma.toFixed(2)}>
          <Slider min={0.5} max={3} step={0.05} value={p.gamma} onChange={v => update({ gamma: v })} />
        </ParamRow>
        <ParamRow label="Contraste" value={p.contrast}>
          <Slider min={-50} max={50} value={p.contrast} onChange={v => update({ contrast: v })} />
        </ParamRow>
        <ParamRow label="Luminosité" value={p.brightness}>
          <Slider min={-50} max={50} value={p.brightness} onChange={v => update({ brightness: v })} />
        </ParamRow>
        <ParamRow label="Fondu original" value={p.blendOriginal + '%'}>
          <Slider min={0} max={100} value={p.blendOriginal} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Matrix Rain panel ────────────────────────────────────────────────────────

function MatrixRainPanel() {
  const { params, updateParams } = useApp();
  const p = params['matrix-rain'] as MatrixRainParams;
  const update = (partial: Partial<MatrixRainParams>) => updateParams('matrix-rain', partial);

  const presets = [
    { label: 'MATRIX', apply: () => update({ chars: 'default', color: '#00ff41', bgColor: '#000000', fontSize: 14, density: 80, speed: 1, trailLength: 0.88, glowEffect: true }) },
    { label: 'ROUGE', apply: () => update({ chars: 'default', color: '#ff2222', bgColor: '#0a0000', fontSize: 12, density: 70, speed: 1.5, trailLength: 0.9, glowEffect: true }) },
    { label: 'BINAIRE', apply: () => update({ chars: '01', color: '#00ccff', bgColor: '#000814', fontSize: 16, density: 90, speed: 0.8, trailLength: 0.85, glowEffect: false }) },
    { label: 'FANTÔME', apply: () => update({ chars: 'default', color: '#aaaaff', bgColor: '#000000', fontSize: 10, density: 60, speed: 0.5, trailLength: 0.95, glowEffect: true, bgOpacity: 0.96 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Caractères" defaultOpen>
        <ParamRow label="Charset">
          <select value={p.chars} onChange={e => update({ chars: e.target.value })}>
            <option value="default">KATAKANA (Matrix)</option>
            <option value="digits">CHIFFRES 0-9</option>
            <option value="binary">BINAIRE 01</option>
            <option value="latin">LATIN a-z A-Z</option>
            <option value="hex">HEXADÉCIMAL</option>
          </select>
        </ParamRow>
        <ParamRow label="Taille" value={p.fontSize + 'px'}>
          <Slider min={6} max={32} value={p.fontSize} onChange={v => update({ fontSize: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Pluie" defaultOpen>
        <ParamRow label="Vitesse" value={p.speed.toFixed(1) + 'x'}>
          <Slider min={0.2} max={5} step={0.1} value={p.speed} onChange={v => update({ speed: v })} />
        </ParamRow>
        <ParamRow label="Densité" value={p.density + '%'}>
          <Slider min={20} max={100} value={p.density} onChange={v => update({ density: v })} />
        </ParamRow>
        <ParamRow label="Traîne" value={(p.trailLength * 100).toFixed(0) + '%'} tip="Persistance de la traîne lumineuse. Plus élevé = traîne plus longue.">
          <Slider min={0.1} max={0.98} step={0.01} value={p.trailLength} onChange={v => update({ trailLength: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Visuel" defaultOpen>
        <ParamRow label="Couleur">
          <input type="color" value={p.color} onChange={e => update({ color: e.target.value })} />
        </ParamRow>
        <ParamRow label="Fond">
          <input type="color" value={p.bgColor} onChange={e => update({ bgColor: e.target.value })} />
        </ParamRow>
        <ParamRow label="Opacité fond" value={Math.round(p.bgOpacity * 100) + '%'}>
          <Slider min={0.7} max={1} step={0.01} value={p.bgOpacity} onChange={v => update({ bgOpacity: v })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.glowEffect} onChange={v => update({ glowEffect: v })} label="Effet glow" />
        </ParamRow>
        <ParamRow label="Variance couleur" value={(p.colorVariance * 100).toFixed(0) + '%'}>
          <Slider min={0} max={0.5} step={0.01} value={p.colorVariance} onChange={v => update({ colorVariance: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="SEED">
        <ParamRow label="SEED" value={p.seed}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="number" value={p.seed} onChange={e => update({ seed: Number(e.target.value) })} style={{ flex: 1 }} />
            <button className="btn" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => update({ seed: Math.floor(Math.random() * 99999) })}>RNG</button>
          </div>
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Dots panel ───────────────────────────────────────────────────────────────

function DotsPanel() {
  const { params, updateParams } = useApp();
  const p = params.dots as DotsParams;
  const update = (partial: Partial<DotsParams>) => updateParams('dots', partial);

  const presets = [
    { label: 'POP ART', apply: () => update({ gridType: 'square', dotSize: 5, spacing: 10, colorMode: 'original', dotShape: 'circle', sizeByLum: true, invert: false }) },
    { label: 'HEX BIO', apply: () => update({ gridType: 'hex', dotSize: 4, spacing: 9, colorMode: 'original', dotShape: 'circle', sizeByLum: true, invert: false }) },
    { label: 'LICHTENSTEIN', apply: () => update({ gridType: 'square', dotSize: 8, spacing: 12, colorMode: 'accent', accentColor: '#ff0080', bgColor: '#ffffff', dotShape: 'circle', sizeByLum: true }) },
    { label: 'RASTER', apply: () => update({ gridType: 'square', dotSize: 3, spacing: 6, colorMode: 'original', dotShape: 'square', sizeByLum: true, angle: 45 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Grille" defaultOpen>
        <ParamRow label="Type">
          <select value={p.gridType} onChange={e => update({ gridType: e.target.value as DotsParams['gridType'] })}>
            <option value="square">CARRÉ</option>
            <option value="hex">HEXAGONAL</option>
            <option value="triangular">TRIANGULAIRE</option>
          </select>
        </ParamRow>
        <ParamRow label="Espacement" value={p.spacing + 'px'}>
          <Slider min={3} max={40} value={p.spacing} onChange={v => update({ spacing: v })} />
        </ParamRow>
        <ParamRow label="Angle" value={p.angle + '°'}>
          <Slider min={0} max={90} value={p.angle} onChange={v => update({ angle: v })} />
        </ParamRow>
        <ParamRow label="Jitter" value={(p.jitter * 100).toFixed(0) + '%'}>
          <Slider min={0} max={0.5} step={0.01} value={p.jitter} onChange={v => update({ jitter: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Points" defaultOpen>
        <ParamRow label="Forme">
          <select value={p.dotShape} onChange={e => update({ dotShape: e.target.value as DotsParams['dotShape'] })}>
            <option value="circle">CERCLE</option>
            <option value="square">CARRÉ</option>
            <option value="diamond">DIAMANT</option>
            <option value="triangle">TRIANGLE</option>
          </select>
        </ParamRow>
        <ParamRow label="Taille" value={p.dotSize + 'px'}>
          <Slider min={1} max={20} value={p.dotSize} onChange={v => update({ dotSize: v })} />
        </ParamRow>
        <ParamRow label="Taille min" value={(p.minSize * 100).toFixed(0) + '%'}>
          <Slider min={0} max={1} step={0.1} value={p.minSize} onChange={v => update({ minSize: v })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.sizeByLum} onChange={v => update({ sizeByLum: v })} label="Taille par luminance" />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.invert} onChange={v => update({ invert: v })} label="Inverser" />
        </ParamRow>
        <ParamRow label="Opacité" value={p.opacity + '%'}>
          <Slider min={10} max={100} value={p.opacity} onChange={v => update({ opacity: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Couleurs">
        <ParamRow label="Mode couleur">
          <select value={p.colorMode} onChange={e => update({ colorMode: e.target.value as DotsParams['colorMode'] })}>
            <option value="original">COULEUR ORIGINALE</option>
            <option value="accent">ACCENT</option>
            <option value="mono">MONO</option>
            <option value="hue-shift">DÉCALAGE TEINTE</option>
          </select>
        </ParamRow>
        {(p.colorMode === 'accent') && (
          <ParamRow label="Couleur accent">
            <input type="color" value={p.accentColor} onChange={e => update({ accentColor: e.target.value })} />
          </ParamRow>
        )}
        <ParamRow label="Fond">
          <input type="color" value={p.bgColor} onChange={e => update({ bgColor: e.target.value })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Contour panel ────────────────────────────────────────────────────────────

function ContourPanel() {
  const { params, updateParams } = useApp();
  const p = params.contour as ContourParams;
  const update = (partial: Partial<ContourParams>) => updateParams('contour', partial);

  const presets = [
    { label: 'GRAVURE', apply: () => update({ mode: 'sobel', threshold: 30, lineColor: '#000000', bgColor: '#f5e6c8', lineWidth: 1, smooth: false, colorize: false, blendOriginal: 0 }) },
    { label: 'NÉON', apply: () => update({ mode: 'sobel', threshold: 25, lineColor: '#00ffaa', bgColor: '#000000', lineWidth: 1.5, smooth: true, colorize: false, blendOriginal: 0 }) },
    { label: 'OVERLAY', apply: () => update({ mode: 'laplacian', threshold: 40, lineColor: '#ffffff', bgTransparent: true, lineWidth: 1, smooth: false, colorize: false, blendOriginal: 60 }) },
    { label: 'MANGA', apply: () => update({ mode: 'sobel', threshold: 20, lineColor: '#000000', bgColor: '#ffffff', lineWidth: 1, smooth: true, colorize: false, blendOriginal: 0 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Détection" defaultOpen>
        <ParamRow label="Mode">
          <select value={p.mode} onChange={e => update({ mode: e.target.value as ContourParams['mode'] })}>
            <option value="sobel">SOBEL</option>
            <option value="laplacian">LAPLACIAN</option>
          </select>
        </ParamRow>
        <ParamRow label="Seuil" value={p.threshold}>
          <Slider min={5} max={200} value={p.threshold} onChange={v => update({ threshold: v })} />
        </ParamRow>
        <ParamRow label="Épaisseur" value={(p.lineWidth ?? 1).toFixed(1)}>
          <Slider min={0.5} max={5} step={0.5} value={p.lineWidth ?? 1} onChange={v => update({ lineWidth: v })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.smooth ?? false} onChange={v => update({ smooth: v })} label="Lissage" />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.invertEdges ?? false} onChange={v => update({ invertEdges: v })} label="Inverser" />
        </ParamRow>
      </Accordion>
      <Accordion label="Couleurs" defaultOpen>
        <ParamRow label="Lignes">
          <input type="color" value={p.lineColor} onChange={e => update({ lineColor: e.target.value })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.bgTransparent ?? false} onChange={v => update({ bgTransparent: v })} label="Fond transparent" />
        </ParamRow>
        {!(p.bgTransparent ?? false) && (
          <ParamRow label="Fond">
            <input type="color" value={p.bgColor} onChange={e => update({ bgColor: e.target.value })} />
          </ParamRow>
        )}
        <ParamRow label="">
          <Toggle value={p.colorize ?? false} onChange={v => update({ colorize: v })} label="Coloriser par angle" />
        </ParamRow>
      </Accordion>
      <Accordion label="Mélange">
        <ParamRow label="Fondu original" value={p.blendOriginal + '%'}>
          <Slider min={0} max={100} value={p.blendOriginal} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Pixel Sort panel ─────────────────────────────────────────────────────────

function PixelSortPanel() {
  const { params, updateParams } = useApp();
  const p = params['pixel-sort'] as PixelSortParams;
  const update = (partial: Partial<PixelSortParams>) => updateParams('pixel-sort', partial);

  const presets = [
    { label: 'GLITCH H', apply: () => update({ axis: 'horizontal', threshold: 80, mode: 'luminance', direction: 'ascending', segmented: true }) },
    { label: 'GLITCH V', apply: () => update({ axis: 'vertical', threshold: 100, mode: 'luminance', direction: 'ascending', segmented: true }) },
    { label: 'SATURÉ', apply: () => update({ axis: 'horizontal', threshold: 60, mode: 'saturation', direction: 'descending', segmented: true }) },
    { label: 'TEINTE', apply: () => update({ axis: 'horizontal', threshold: 50, mode: 'hue', direction: 'ascending', segmented: false }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Tri" defaultOpen>
        <ParamRow label="Axe">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['horizontal', 'vertical', 'both'] as const).map(a => (
              <button key={a} className={`btn${p.axis === a ? ' active' : ''}`}
                style={{ flex: 1, fontSize: 9 }} onClick={() => update({ axis: a })}>
                {a === 'horizontal' ? 'H' : a === 'vertical' ? 'V' : 'B'}
              </button>
            ))}
          </div>
        </ParamRow>
        <ParamRow label="Mode tri">
          <select value={p.mode} onChange={e => update({ mode: e.target.value as PixelSortParams['mode'] })}>
            <option value="luminance">LUMINANCE</option>
            <option value="hue">TEINTE</option>
            <option value="saturation">SATURATION</option>
            <option value="red">ROUGE</option>
            <option value="green">VERT</option>
            <option value="blue">BLEU</option>
          </select>
        </ParamRow>
        <ParamRow label="Direction">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['ascending', 'descending'] as const).map(d => (
              <button key={d} className={`btn${p.direction === d ? ' active' : ''}`}
                style={{ flex: 1, fontSize: 10 }} onClick={() => update({ direction: d })}>
                {d === 'ascending' ? 'ASC ↑' : 'DESC ↓'}
              </button>
            ))}
          </div>
        </ParamRow>
        <ParamRow label="Seuil" value={p.threshold}>
          <Slider min={0} max={255} value={p.threshold} onChange={v => update({ threshold: v })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.segmented} onChange={v => update({ segmented: v })} label="Segmenté (par intervalles)" />
        </ParamRow>
        <ParamRow label="Skip chance" value={Math.round(p.skipChance * 100) + '%'} tip="Probabilité de sauter un segment.">
          <Slider min={0} max={0.9} step={0.05} value={p.skipChance} onChange={v => update({ skipChance: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Mélange">
        <ParamRow label="Fondu original" value={p.blendOriginal + '%'}>
          <Slider min={0} max={100} value={p.blendOriginal} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Blockify panel ───────────────────────────────────────────────────────────

function BlockifyPanel() {
  const { params, updateParams } = useApp();
  const p = params.blockify as BlockifyParams;
  const update = (partial: Partial<BlockifyParams>) => updateParams('blockify', partial);

  const presets = [
    { label: 'PIXEL ART', apply: () => update({ blockSize: 8, samplingMode: 'average', colorMode: 'original', levels: 16, edgeHighlight: false }) },
    { label: 'MOSAÏQUE', apply: () => update({ blockSize: 20, samplingMode: 'average', colorMode: 'quantize', levels: 8, edgeHighlight: true, edgeColor: '#000000', edgeWidth: 1 }) },
    { label: 'MINECRAFT', apply: () => update({ blockSize: 16, samplingMode: 'center', colorMode: 'quantize', levels: 6, edgeHighlight: true, edgeColor: '#000000', edgeWidth: 2 }) },
    { label: 'FAUVISME', apply: () => update({ blockSize: 24, samplingMode: 'average', colorMode: 'quantize', levels: 5, edgeHighlight: true, edgeColor: '#333333', edgeWidth: 1 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Blocs" defaultOpen>
        <ParamRow label="Taille bloc" value={p.blockSize + 'px'}>
          <Slider min={2} max={64} step={2} value={p.blockSize} onChange={v => update({ blockSize: v })} />
        </ParamRow>
        <ParamRow label="Échantillonnage">
          <select value={p.samplingMode} onChange={e => update({ samplingMode: e.target.value as BlockifyParams['samplingMode'] })}>
            <option value="average">MOYENNE</option>
            <option value="center">CENTRE</option>
            <option value="dominant">COULEUR DOMINANTE</option>
          </select>
        </ParamRow>
      </Accordion>
      <Accordion label="Couleurs" defaultOpen>
        <ParamRow label="Mode couleur">
          <select value={p.colorMode} onChange={e => update({ colorMode: e.target.value as BlockifyParams['colorMode'] })}>
            <option value="original">ORIGINALE</option>
            <option value="quantize">QUANTIFIÉE</option>
            <option value="mono">MONO</option>
          </select>
        </ParamRow>
        {p.colorMode === 'quantize' && (
          <ParamRow label="Niveaux" value={p.levels}>
            <Slider min={2} max={32} value={p.levels} onChange={v => update({ levels: v })} />
          </ParamRow>
        )}
      </Accordion>
      <Accordion label="Contours">
        <ParamRow label="">
          <Toggle value={p.edgeHighlight} onChange={v => update({ edgeHighlight: v })} label="Contours de blocs" />
        </ParamRow>
        {p.edgeHighlight && (
          <>
            <ParamRow label="Couleur contour">
              <input type="color" value={p.edgeColor} onChange={e => update({ edgeColor: e.target.value })} />
            </ParamRow>
            <ParamRow label="Épaisseur" value={p.edgeWidth + 'px'}>
              <Slider min={1} max={4} value={p.edgeWidth} onChange={v => update({ edgeWidth: v })} />
            </ParamRow>
          </>
        )}
      </Accordion>
      <Accordion label="Mélange">
        <ParamRow label="Fondu original" value={p.blendOriginal + '%'}>
          <Slider min={0} max={100} value={p.blendOriginal} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Threshold Effect panel ───────────────────────────────────────────────────

function ThresholdEffectPanel() {
  const { params, updateParams } = useApp();
  const p = params['threshold-effect'] as ThresholdEffectParams;
  const update = (partial: Partial<ThresholdEffectParams>) => updateParams('threshold-effect', partial);

  const presets = [
    { label: 'N/B DUR', apply: () => update({ mode: 'binary', threshold: 128, colorA: '#000000', colorB: '#ffffff', invert: false }) },
    { label: 'SÉRIGRAPHIE', apply: () => update({ mode: 'binary', threshold: 100, colorA: '#0d0221', colorB: '#ff1493', invert: false, blendOriginal: 10 }) },
    { label: 'MULTI', apply: () => update({ mode: 'multi', levels: 4, colorA: '#000000', colorB: '#ffffff', colorC: '#888888' }) },
    { label: 'DUOTONE', apply: () => update({ mode: 'duotone', threshold: 128, colorA: '#1a0533', colorB: '#ff80ab' }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Mode" defaultOpen>
        <ParamRow label="Type">
          <select value={p.mode} onChange={e => update({ mode: e.target.value as ThresholdEffectParams['mode'] })}>
            <option value="binary">BINAIRE</option>
            <option value="adaptive">ADAPTATIF</option>
            <option value="multi">MULTI-NIVEAUX</option>
            <option value="duotone">DUOTONE</option>
          </select>
        </ParamRow>
        {(p.mode === 'binary' || p.mode === 'duotone') && (
          <ParamRow label="Seuil" value={p.threshold}>
            <Slider min={0} max={255} value={p.threshold} onChange={v => update({ threshold: v })} />
          </ParamRow>
        )}
        {p.mode === 'adaptive' && (
          <>
            <ParamRow label="Rayon" value={p.adaptiveRadius + 'px'}>
              <Slider min={3} max={50} step={2} value={p.adaptiveRadius} onChange={v => update({ adaptiveRadius: v })} />
            </ParamRow>
            <ParamRow label="Offset" value={p.adaptiveOffset}>
              <Slider min={-50} max={50} value={p.adaptiveOffset} onChange={v => update({ adaptiveOffset: v })} />
            </ParamRow>
          </>
        )}
        {p.mode === 'multi' && (
          <ParamRow label="Niveaux" value={p.levels}>
            <Slider min={2} max={8} value={p.levels} onChange={v => update({ levels: v })} />
          </ParamRow>
        )}
        <ParamRow label="">
          <Toggle value={p.invert} onChange={v => update({ invert: v })} label="Inverser" />
        </ParamRow>
      </Accordion>
      <Accordion label="Couleurs" defaultOpen>
        <ParamRow label="Couleur A (ombres)">
          <input type="color" value={p.colorA} onChange={e => update({ colorA: e.target.value })} />
        </ParamRow>
        <ParamRow label="Couleur B (lumières)">
          <input type="color" value={p.colorB} onChange={e => update({ colorB: e.target.value })} />
        </ParamRow>
        {p.mode === 'multi' && (
          <ParamRow label="Couleur C (tons moyens)">
            <input type="color" value={p.colorC} onChange={e => update({ colorC: e.target.value })} />
          </ParamRow>
        )}
      </Accordion>
      <Accordion label="Mélange">
        <ParamRow label="Fondu original" value={p.blendOriginal + '%'}>
          <Slider min={0} max={100} value={p.blendOriginal} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Edge Detection panel ─────────────────────────────────────────────────────

function EdgeDetectionPanel() {
  const { params, updateParams } = useApp();
  const p = params['edge-detection'] as EdgeDetectionParams;
  const update = (partial: Partial<EdgeDetectionParams>) => updateParams('edge-detection', partial);

  const presets = [
    { label: 'GRAVURE', apply: () => update({ algorithm: 'sobel', threshold: 50, mode: 'on-black', edgeColor: '#ffffff', bgColor: '#000000', lineWidth: 1, invert: false }) },
    { label: 'CRAYON', apply: () => update({ algorithm: 'prewitt', threshold: 40, mode: 'on-white', edgeColor: '#222222', bgColor: '#f5f0e8', lineWidth: 0.8, invert: false }) },
    { label: 'NÉON', apply: () => update({ algorithm: 'sobel', threshold: 30, mode: 'on-black', edgeColor: '#00ffaa', bgColor: '#000000', lineWidth: 1.5, invert: false, blendOriginal: 0 }) },
    { label: 'OVERLAY', apply: () => update({ algorithm: 'laplacian', threshold: 60, mode: 'on-original', edgeColor: '#ff00ff', bgColor: '#000000', lineWidth: 1, blendOriginal: 70 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Algorithme" defaultOpen>
        <ParamRow label="Filtre">
          <select value={p.algorithm} onChange={e => update({ algorithm: e.target.value as EdgeDetectionParams['algorithm'] })}>
            <option value="sobel">SOBEL</option>
            <option value="prewitt">PREWITT</option>
            <option value="laplacian">LAPLACIEN</option>
            <option value="roberts">ROBERTS CROSS</option>
          </select>
        </ParamRow>
        <ParamRow label="Seuil" value={p.threshold}>
          <Slider min={5} max={255} value={p.threshold} onChange={v => update({ threshold: v })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.luminanceOnly} onChange={v => update({ luminanceOnly: v })} label="Luminance seulement" />
        </ParamRow>
      </Accordion>
      <Accordion label="Rendu" defaultOpen>
        <ParamRow label="Mode">
          <select value={p.mode} onChange={e => update({ mode: e.target.value as EdgeDetectionParams['mode'] })}>
            <option value="on-black">SUR FOND NOIR</option>
            <option value="on-white">SUR FOND BLANC</option>
            <option value="overlay">OVERLAY</option>
          </select>
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.colorByAngle} onChange={v => update({ colorByAngle: v })} label="Couleur par angle" />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.invert} onChange={v => update({ invert: v })} label="Inverser" />
        </ParamRow>
      </Accordion>
      <Accordion label="Couleurs">
        <ParamRow label="Contours">
          <input type="color" value={p.edgeColor} onChange={e => update({ edgeColor: e.target.value })} />
        </ParamRow>
        <ParamRow label="Fond">
          <input type="color" value={p.bgColor} onChange={e => update({ bgColor: e.target.value })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Mélange">
        <ParamRow label="Fondu original" value={p.blendOriginal + '%'}>
          <Slider min={0} max={100} value={p.blendOriginal} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Crosshatch panel ─────────────────────────────────────────────────────────

function CrosshatchPanel() {
  const { params, updateParams } = useApp();
  const p = params.crosshatch as CrosshatchParams;
  const update = (partial: Partial<CrosshatchParams>) => updateParams('crosshatch', partial);

  const presets = [
    { label: 'CRAYON', apply: () => update({ layers: 2, angle1: 45, angle2: 135, spacing: 8, lineWidth: 0.8, color: '#1a1a1a', bgColor: '#f5f0e8', bgTransparent: false, lumDriven: true }) },
    { label: 'GRAVURE', apply: () => update({ layers: 3, angle1: 30, angle2: 120, angle3: 75, spacing: 6, lineWidth: 0.6, color: '#000000', bgColor: '#f5e6c8', bgTransparent: false, lumDriven: true }) },
    { label: 'OVERLAY', apply: () => update({ layers: 2, angle1: 45, angle2: 135, spacing: 10, lineWidth: 1, color: '#ffffff', bgTransparent: true, lumDriven: true, blendOriginal: 70 }) },
    { label: 'MANGA', apply: () => update({ layers: 1, angle1: 45, angle2: 135, spacing: 5, lineWidth: 0.7, color: '#000000', bgColor: '#ffffff', bgTransparent: false, lumDriven: true }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Hachures" defaultOpen>
        <ParamRow label="Couches" value={p.layers}>
          <Slider min={1} max={4} value={p.layers} onChange={v => update({ layers: v })} />
        </ParamRow>
        <ParamRow label="Angle 1" value={p.angle1 + '°'}>
          <Slider min={0} max={180} value={p.angle1} onChange={v => update({ angle1: v })} />
        </ParamRow>
        {p.layers >= 2 && (
          <ParamRow label="Angle 2" value={p.angle2 + '°'}>
            <Slider min={0} max={180} value={p.angle2} onChange={v => update({ angle2: v })} />
          </ParamRow>
        )}
        {p.layers >= 3 && (
          <ParamRow label="Angle 3" value={p.angle3 + '°'}>
            <Slider min={0} max={180} value={p.angle3} onChange={v => update({ angle3: v })} />
          </ParamRow>
        )}
        {p.layers >= 4 && (
          <ParamRow label="Angle 4" value={p.angle4 + '°'}>
            <Slider min={0} max={180} value={p.angle4} onChange={v => update({ angle4: v })} />
          </ParamRow>
        )}
        <ParamRow label="Espacement min" value={p.minSpacing + 'px'}>
          <Slider min={1} max={10} value={p.minSpacing} onChange={v => update({ minSpacing: v })} />
        </ParamRow>
        <ParamRow label="Espacement max" value={p.maxSpacing + 'px'}>
          <Slider min={5} max={40} value={p.maxSpacing} onChange={v => update({ maxSpacing: v })} />
        </ParamRow>
        <ParamRow label="Épaisseur" value={p.lineWidth.toFixed(1)}>
          <Slider min={0.3} max={3} step={0.1} value={p.lineWidth} onChange={v => update({ lineWidth: v })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.lumDriven} onChange={v => update({ lumDriven: v })} label="Espacement par luminance" />
        </ParamRow>
      </Accordion>
      <Accordion label="Couleurs" defaultOpen>
        <ParamRow label="Lignes">
          <input type="color" value={p.color} onChange={e => update({ color: e.target.value })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.bgTransparent} onChange={v => update({ bgTransparent: v })} label="Fond transparent" />
        </ParamRow>
        {!p.bgTransparent && (
          <ParamRow label="Fond">
            <input type="color" value={p.bgColor} onChange={e => update({ bgColor: e.target.value })} />
          </ParamRow>
        )}
      </Accordion>
      <Accordion label="Mélange">
        <ParamRow label="Contraste" value={p.contrast}>
          <Slider min={-50} max={100} value={p.contrast} onChange={v => update({ contrast: v })} />
        </ParamRow>
        <ParamRow label="Fondu original" value={p.blendOriginal + '%'}>
          <Slider min={0} max={100} value={p.blendOriginal} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Wave Lines panel ─────────────────────────────────────────────────────────

function WaveLinesPanel() {
  const { params, updateParams } = useApp();
  const p = params['wave-lines'] as WaveLinesParams;
  const update = (partial: Partial<WaveLinesParams>) => updateParams('wave-lines', partial);

  const presets = [
    { label: 'SINUS', apply: () => update({ waveType: 'sine', lineCount: 50, amplitude: 20, frequency: 3, lineWidth: 1, color: '#ffffff', bgColor: '#000000', bgTransparent: false, colorMode: 'solid', lumDriven: false }) },
    { label: 'RELIEF', apply: () => update({ waveType: 'noise', lineCount: 80, amplitude: 30, frequency: 2, lineWidth: 0.8, color: '#aaffee', bgColor: '#000000', bgTransparent: false, colorMode: 'gradient', gradientA: '#00ff88', gradientB: '#0044ff', lumDriven: true }) },
    { label: 'RÉTRO', apply: () => update({ waveType: 'sawtooth', lineCount: 40, amplitude: 25, frequency: 5, lineWidth: 1.5, color: '#ff80ab', bgColor: '#0d0221', bgTransparent: false, colorMode: 'solid', lumDriven: false }) },
    { label: 'OVERLAY', apply: () => update({ waveType: 'sine', lineCount: 60, amplitude: 15, frequency: 4, lineWidth: 0.7, colorMode: 'solid', color: '#ff00ff', bgTransparent: true, lumDriven: true, blendOriginal: 50 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Vague" defaultOpen>
        <ParamRow label="Type">
          <select value={p.waveType} onChange={e => update({ waveType: e.target.value as WaveLinesParams['waveType'] })}>
            <option value="sine">SINUS</option>
            <option value="noise">BRUIT (perlin)</option>
            <option value="square">CARRÉ</option>
            <option value="sawtooth">DENT DE SCIE</option>
          </select>
        </ParamRow>
        <ParamRow label="Nombre de lignes" value={p.lineCount}>
          <Slider min={10} max={200} value={p.lineCount} onChange={v => update({ lineCount: v })} />
        </ParamRow>
        <ParamRow label="Amplitude" value={p.amplitude + 'px'}>
          <Slider min={0} max={100} value={p.amplitude} onChange={v => update({ amplitude: v })} />
        </ParamRow>
        <ParamRow label="Fréquence" value={p.frequency.toFixed(1)}>
          <Slider min={0.5} max={20} step={0.5} value={p.frequency} onChange={v => update({ frequency: v })} />
        </ParamRow>
        <ParamRow label="Phase" value={p.phase.toFixed(2)}>
          <Slider min={0} max={Math.PI * 2} step={0.1} value={p.phase} onChange={v => update({ phase: v })} />
        </ParamRow>
        {p.waveType === 'noise' && (
          <ParamRow label="Échelle bruit" value={p.noiseScale.toFixed(1)}>
            <Slider min={0.5} max={10} step={0.5} value={p.noiseScale} onChange={v => update({ noiseScale: v })} />
          </ParamRow>
        )}
        <ParamRow label="">
          <Toggle value={p.lumDriven} onChange={v => update({ lumDriven: v })} label="Amplitude par luminance" />
        </ParamRow>
      </Accordion>
      <Accordion label="Couleurs" defaultOpen>
        <ParamRow label="Mode">
          <select value={p.colorMode} onChange={e => update({ colorMode: e.target.value as WaveLinesParams['colorMode'] })}>
            <option value="solid">UNIFORME</option>
            <option value="gradient">DÉGRADÉ</option>
            <option value="image">IMAGE SOURCE</option>
          </select>
        </ParamRow>
        {p.colorMode === 'solid' && (
          <ParamRow label="Couleur">
            <input type="color" value={p.color} onChange={e => update({ color: e.target.value })} />
          </ParamRow>
        )}
        {p.colorMode === 'gradient' && (
          <>
            <ParamRow label="Couleur A">
              <input type="color" value={p.gradientA} onChange={e => update({ gradientA: e.target.value })} />
            </ParamRow>
            <ParamRow label="Couleur B">
              <input type="color" value={p.gradientB} onChange={e => update({ gradientB: e.target.value })} />
            </ParamRow>
          </>
        )}
        <ParamRow label="">
          <Toggle value={p.bgTransparent} onChange={v => update({ bgTransparent: v })} label="Fond transparent" />
        </ParamRow>
        {!p.bgTransparent && (
          <ParamRow label="Fond">
            <input type="color" value={p.bgColor} onChange={e => update({ bgColor: e.target.value })} />
          </ParamRow>
        )}
        <ParamRow label="">
          <Toggle value={p.invert} onChange={v => update({ invert: v })} label="Inverser" />
        </ParamRow>
        <ParamRow label="Épaisseur" value={p.lineWidth.toFixed(1)}>
          <Slider min={0.3} max={5} step={0.1} value={p.lineWidth} onChange={v => update({ lineWidth: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Mélange">
        <ParamRow label="Fondu original" value={p.blendOriginal + '%'}>
          <Slider min={0} max={100} value={p.blendOriginal} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Noise Field panel ────────────────────────────────────────────────────────

function NoiseFieldPanel() {
  const { params, updateParams } = useApp();
  const p = params['noise-field'] as NoiseFieldParams;
  const update = (partial: Partial<NoiseFieldParams>) => updateParams('noise-field', partial);

  const presets = [
    { label: 'BRUME', apply: () => update({ noiseType: 'fractal', scale: 4, octaves: 4, persistence: 0.5, colorMode: 'grayscale', blendMode: 'overlay', blendOriginal: 60 }) },
    { label: 'MAGMA', apply: () => update({ noiseType: 'domain-warp', scale: 3, octaves: 5, persistence: 0.6, colorMode: 'custom', colorA: '#000000', colorB: '#ff4400', blendMode: 'normal', blendOriginal: 0 }) },
    { label: 'PLASMA', apply: () => update({ noiseType: 'fractal', scale: 6, octaves: 3, persistence: 0.45, colorMode: 'custom', colorA: '#0d0221', colorB: '#ff00ff', blendMode: 'normal', blendOriginal: 0 }) },
    { label: 'TEXTURE', apply: () => update({ noiseType: 'value', scale: 8, octaves: 1, persistence: 0.5, colorMode: 'grayscale', blendMode: 'multiply', blendOriginal: 50 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Bruit" defaultOpen>
        <ParamRow label="Type">
          <select value={p.noiseType} onChange={e => update({ noiseType: e.target.value as NoiseFieldParams['noiseType'] })}>
            <option value="fractal">FRACTAL (fBm)</option>
            <option value="value">VALUE NOISE</option>
            <option value="domain-warp">DOMAIN WARP</option>
          </select>
        </ParamRow>
        <ParamRow label="Échelle" value={p.scale.toFixed(1)}>
          <Slider min={0.5} max={20} step={0.5} value={p.scale} onChange={v => update({ scale: v })} />
        </ParamRow>
        {p.noiseType !== 'value' && (
          <>
            <ParamRow label="Octaves" value={p.octaves}>
              <Slider min={1} max={8} value={p.octaves} onChange={v => update({ octaves: v })} />
            </ParamRow>
            <ParamRow label="Persistance" value={p.persistence.toFixed(2)}>
              <Slider min={0.1} max={0.9} step={0.05} value={p.persistence} onChange={v => update({ persistence: v })} />
            </ParamRow>
            <ParamRow label="Lacunarité" value={p.lacunarity.toFixed(1)}>
              <Slider min={1.5} max={4} step={0.1} value={p.lacunarity} onChange={v => update({ lacunarity: v })} />
            </ParamRow>
          </>
        )}
      </Accordion>
      <Accordion label="Couleurs" defaultOpen>
        <ParamRow label="Mode">
          <select value={p.colorMode} onChange={e => update({ colorMode: e.target.value as NoiseFieldParams['colorMode'] })}>
            <option value="grayscale">NIVEAUX DE GRIS</option>
            <option value="custom">PALETTE</option>
          </select>
        </ParamRow>
        {p.colorMode === 'custom' && (
          <>
            <ParamRow label="Couleur A (ombres)">
              <input type="color" value={p.colorA} onChange={e => update({ colorA: e.target.value })} />
            </ParamRow>
            <ParamRow label="Couleur B (lumières)">
              <input type="color" value={p.colorB} onChange={e => update({ colorB: e.target.value })} />
            </ParamRow>
          </>
        )}
      </Accordion>
      <Accordion label="Mélange" defaultOpen>
        <ParamRow label="Mode blend">
          <select value={p.blendMode} onChange={e => update({ blendMode: e.target.value as NoiseFieldParams['blendMode'] })}>
            <option value="normal">NORMAL</option>
            <option value="multiply">MULTIPLY</option>
            <option value="screen">SCREEN</option>
            <option value="overlay">OVERLAY</option>
          </select>
        </ParamRow>
        <ParamRow label="Fondu original" value={p.blendOriginal + '%'}>
          <Slider min={0} max={100} value={p.blendOriginal} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
        <ParamRow label="Luminosité" value={p.brightness}>
          <Slider min={-100} max={100} value={p.brightness} onChange={v => update({ brightness: v })} />
        </ParamRow>
        <ParamRow label="Contraste" value={p.contrast}>
          <Slider min={-100} max={100} value={p.contrast} onChange={v => update({ contrast: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="SEED">
        <ParamRow label="SEED" value={p.seed}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="number" value={p.seed} onChange={e => update({ seed: Number(e.target.value) })} style={{ flex: 1 }} />
            <button className="btn" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => update({ seed: Math.floor(Math.random() * 99999) })}>RNG</button>
          </div>
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Voronoi panel ────────────────────────────────────────────────────────────

function VoronoiPanel() {
  const { params, updateParams } = useApp();
  const p = params.voronoi as VoronoiParams;
  const update = (partial: Partial<VoronoiParams>) => updateParams('voronoi', partial);

  const presets = [
    { label: 'MOSAÏQUE', apply: () => update({ cellCount: 40, mode: 'fill', colorMode: 'fromImage', edgeColor: '#ffffff', edgeWidth: 1 }) },
    { label: 'SCHÉMA', apply: () => update({ cellCount: 30, mode: 'edges', colorMode: 'fromImage', edgeColor: '#00ffaa', bgColor: '#000000', edgeWidth: 1 }) },
    { label: 'LOW POLY', apply: () => update({ cellCount: 60, mode: 'fill', colorMode: 'fromImage', edgeColor: '#000000', edgeWidth: 0, jitter: 0.6 }) },
    { label: 'NÉON', apply: () => update({ cellCount: 25, mode: 'edges', colorMode: 'gradient', gradientA: '#ff0080', gradientB: '#0080ff', bgColor: '#000000', edgeWidth: 1.5 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Cellules" defaultOpen>
        <ParamRow label="Nombre" value={p.cellCount}>
          <Slider min={5} max={200} step={5} value={p.cellCount} onChange={v => update({ cellCount: v })} />
        </ParamRow>
        <ParamRow label="Jitter" value={(p.jitter * 100).toFixed(0) + '%'}>
          <Slider min={0} max={1} step={0.05} value={p.jitter} onChange={v => update({ jitter: v })} />
        </ParamRow>
        <ParamRow label="Distance">
          <select value={p.distanceMetric} onChange={e => update({ distanceMetric: e.target.value as VoronoiParams['distanceMetric'] })}>
            <option value="euclidean">EUCLIDIENNE</option>
            <option value="manhattan">MANHATTAN</option>
            <option value="chebyshev">CHEBYSHEV</option>
          </select>
        </ParamRow>
        <ParamRow label="SEED" value={p.seed}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="number" value={p.seed} onChange={e => update({ seed: Number(e.target.value) })} style={{ flex: 1 }} />
            <button className="btn" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => update({ seed: Math.floor(Math.random() * 99999) })}>RNG</button>
          </div>
        </ParamRow>
      </Accordion>
      <Accordion label="Mode" defaultOpen>
        <ParamRow label="Rendu">
          <select value={p.mode} onChange={e => update({ mode: e.target.value as VoronoiParams['mode'] })}>
            <option value="fill">CELLULES REMPLIES</option>
            <option value="edges">CONTOURS</option>
            <option value="points">POINTS CENTRAUX</option>
          </select>
        </ParamRow>
        <ParamRow label="Couleur cellules">
          <select value={p.colorMode} onChange={e => update({ colorMode: e.target.value as VoronoiParams['colorMode'] })}>
            <option value="fromImage">IMAGE SOURCE</option>
            <option value="gradient">DÉGRADÉ</option>
            <option value="random">ALÉATOIRE</option>
          </select>
        </ParamRow>
      </Accordion>
      <Accordion label="Contours">
        <ParamRow label="Couleur">
          <input type="color" value={p.edgeColor} onChange={e => update({ edgeColor: e.target.value })} />
        </ParamRow>
        <ParamRow label="Épaisseur" value={p.edgeWidth.toFixed(1)}>
          <Slider min={0} max={4} step={0.5} value={p.edgeWidth} onChange={v => update({ edgeWidth: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Mélange">
        <ParamRow label="Fondu original" value={p.blendOriginal + '%'}>
          <Slider min={0} max={100} value={p.blendOriginal} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── VHS panel ────────────────────────────────────────────────────────────────

function VhsPanel() {
  const { params, updateParams } = useApp();
  const p = params.vhs as VhsParams;
  const update = (partial: Partial<VhsParams>) => updateParams('vhs', partial);

  const presets = [
    { label: 'SP', apply: () => update({ tracking: 10, colorBleed: 5, ghosting: 3, scanlineIntensity: 0.2, noiseAmount: 8, hSync: 8, tapeSpeed: 'SP', static: 0 }) },
    { label: 'LP', apply: () => update({ tracking: 25, colorBleed: 12, ghosting: 8, scanlineIntensity: 0.4, noiseAmount: 20, hSync: 20, tapeSpeed: 'LP', static: 5 }) },
    { label: 'EP', apply: () => update({ tracking: 40, colorBleed: 20, ghosting: 15, scanlineIntensity: 0.5, noiseAmount: 35, hSync: 35, tapeSpeed: 'EP', static: 15 }) },
    { label: 'DÉGRADÉ', apply: () => update({ tracking: 60, colorBleed: 25, ghosting: 20, scanlineIntensity: 0.6, noiseAmount: 50, hSync: 50, static: 25 }) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <QuickPresets presets={presets} />
      <Accordion label="Bande" defaultOpen>
        <ParamRow label="Vitesse bande">
          <select value={p.tapeSpeed} onChange={e => update({ tapeSpeed: e.target.value as VhsParams['tapeSpeed'] })}>
            <option value="SP">SP (Standard Play — meilleure qualité)</option>
            <option value="LP">LP (Long Play)</option>
            <option value="EP">EP (Extended Play — pire qualité)</option>
          </select>
        </ParamRow>
        <ParamRow label="Tracking" value={p.tracking}>
          <Slider min={0} max={100} value={p.tracking} onChange={v => update({ tracking: v })} />
        </ParamRow>
        <ParamRow label="Sync H" value={p.hSync} tip="Instabilité horizontale — la ligne de synchro se déplace.">
          <Slider min={0} max={100} value={p.hSync} onChange={v => update({ hSync: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Vidéo" defaultOpen>
        <ParamRow label="Saignée couleur" value={p.colorBleed} tip="Diffusion latérale des chrominances, défaut optique VHS.">
          <Slider min={0} max={40} value={p.colorBleed} onChange={v => update({ colorBleed: v })} />
        </ParamRow>
        <ParamRow label="Fantôme" value={p.ghosting} tip="Double image fantôme, due aux réflexions de signal.">
          <Slider min={0} max={30} value={p.ghosting} onChange={v => update({ ghosting: v })} />
        </ParamRow>
        <ParamRow label="">
          <Toggle value={p.rgbOffset} onChange={v => update({ rgbOffset: v })} label="Décalage RGB" />
        </ParamRow>
        {p.rgbOffset && (
          <ParamRow label="Décalage" value={p.rgbOffsetAmount + 'px'}>
            <Slider min={1} max={15} value={p.rgbOffsetAmount} onChange={v => update({ rgbOffsetAmount: v })} />
          </ParamRow>
        )}
      </Accordion>
      <Accordion label="Artefacts" defaultOpen>
        <ParamRow label="Scanlines" value={Math.round(p.scanlineIntensity * 100) + '%'}>
          <Slider min={0} max={1} step={0.05} value={p.scanlineIntensity} onChange={v => update({ scanlineIntensity: v })} />
        </ParamRow>
        <ParamRow label="Bruit" value={p.noiseAmount}>
          <Slider min={0} max={80} value={p.noiseAmount} onChange={v => update({ noiseAmount: v })} />
        </ParamRow>
        <ParamRow label="Statique" value={p.static}>
          <Slider min={0} max={60} value={p.static} onChange={v => update({ static: v })} />
        </ParamRow>
      </Accordion>
      <Accordion label="Image">
        <ParamRow label="Luminance" value={p.luma}>
          <Slider min={-50} max={50} value={p.luma} onChange={v => update({ luma: v })} />
        </ParamRow>
        <ParamRow label="Saturation" value={p.saturation + '%'}>
          <Slider min={0} max={150} value={p.saturation} onChange={v => update({ saturation: v })} />
        </ParamRow>
        <ParamRow label="Fondu original" value={p.blendOriginal + '%'}>
          <Slider min={0} max={100} value={p.blendOriginal} onChange={v => update({ blendOriginal: v })} />
        </ParamRow>
      </Accordion>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

const PANELS: Record<string, React.ComponentType> = {
  dither: DitherPanel,
  ascii: AsciiPanel,
  brutalist: BrutalistPanel,
  cybersigilism: CyberPanel,
  thermal: ThermalPanel,
  nightvision: NightVisionPanel,
  infrared: InfraredPanel,
  pointcloud: PointCloudPanel,
  topo: TopoPanel,
  halftone: HalftonePanel,
  'matrix-rain': MatrixRainPanel,
  dots: DotsPanel,
  contour: ContourPanel,
  'pixel-sort': PixelSortPanel,
  blockify: BlockifyPanel,
  'threshold-effect': ThresholdEffectPanel,
  'edge-detection': EdgeDetectionPanel,
  crosshatch: CrosshatchPanel,
  'wave-lines': WaveLinesPanel,
  'noise-field': NoiseFieldPanel,
  voronoi: VoronoiPanel,
  vhs: VhsPanel,
};

const PANEL_LABELS: Record<string, string> = {
  dither:             'Dithering',
  ascii:              'ASCII',
  brutalist:          'Brutalisme',
  cybersigilism:      'Cybersigilism',
  thermal:            'Thermique',
  nightvision:        'Vision nocturne',
  infrared:           'Infrarouge',
  pointcloud:         'Point cloud',
  topo:               'Topo contours',
  halftone:           'Similigravure',
  'matrix-rain':      'Matrix Rain',
  dots:               'Points',
  contour:            'Contours',
  'pixel-sort':       'Tri de pixels',
  blockify:           'Mosaïque',
  'threshold-effect': 'Seuillage',
  'edge-detection':   'Détection bords',
  crosshatch:         'Hachures',
  'wave-lines':       'Lignes ondulées',
  'noise-field':      'Champ de bruit',
  voronoi:            'Voronoï',
  vhs:                'VHS',
};

const PANEL_ICONS: Record<string, string> = {
  dither:             '▒',
  ascii:              'A',
  brutalist:          '▪',
  cybersigilism:      '✦',
  thermal:            '◈',
  nightvision:        '◉',
  infrared:           '⊛',
  pointcloud:         '⋮',
  topo:               '≋',
  halftone:           '◎',
  'matrix-rain':      '雨',
  dots:               '∷',
  contour:            '⌇',
  'pixel-sort':       '⇅',
  blockify:           '⊞',
  'threshold-effect': '◐',
  'edge-detection':   '⌸',
  crosshatch:         '⊘',
  'wave-lines':       '∿',
  'noise-field':      '⣿',
  voronoi:            '⬡',
  vhs:                '⏿',
};

export function EffectPanel() {
  const { selectedEffect, effects, selectEffect, toggleEffect, originalImage, resetParams, toggleEffectLive, liveEffects, randomizeEffect } = useApp();
  const active = selectedEffect ?? effects.find(e => e.enabled)?.type ?? null;

  if (!active) {
    return (
      <div className="panel-empty-state">
        <div className="panel-empty-title">
          {originalImage ? 'Sélectionne un effet' : 'Commence par charger une image'}
        </div>
        <div className="panel-empty-sub">
          {originalImage ? 'Active un effet dans la barre latérale pour accéder à ses paramètres.' : 'Glisse une photo dans la zone centrale, ou clique dessus pour parcourir.'}
        </div>
        {originalImage && (
          <div className="panel-effect-grid">
            {effects.map(e => (
              <button
                key={e.type}
                className={`panel-effect-card${e.enabled ? ' panel-effect-card--on' : ''}`}
                onClick={() => { if (!e.enabled) toggleEffect(e.type); selectEffect(e.type); }}
              >
                <span className="panel-effect-card-icon">{PANEL_ICONS[e.type]}</span>
                <span className="panel-effect-card-name">{PANEL_LABELS[e.type]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const Panel = PANELS[active];
  const isEnabled = effects.find(e => e.type === active)?.enabled ?? false;
  const isLive = liveEffects[active];
  return (
    <div className="panel-content">
      <div className="panel-header">
        <span className="panel-header-icon">{PANEL_ICONS[active]}</span>
        <span style={{ flex: 1 }}>{PANEL_LABELS[active]}</span>
        <button
          className={`panel-header-btn panel-live-btn${isLive ? ' panel-live-btn--on' : ''}`}
          onClick={() => toggleEffectLive(active as import('../types').EffectType)}
          title={isLive ? 'Désactiver le mode live' : 'Activer le mode live (animation automatique)'}
        >
          <span className={`panel-live-dot${isLive ? ' panel-live-dot--on' : ''}`} />
          Live
        </button>
        <button
          className="panel-header-btn panel-random-btn"
          onClick={() => randomizeEffect(active as import('../types').EffectType)}
          title="Paramètres aléatoires pour cet effet"
        >
          🎲
        </button>
        <button
          className={`panel-header-btn panel-toggle-btn${isEnabled ? ' panel-toggle-btn--on' : ''}`}
          onClick={() => toggleEffect(active as import('../types').EffectType)}
          title={isEnabled ? 'Désactiver cet effet' : 'Activer cet effet'}
        >
          {isEnabled ? 'ON' : 'OFF'}
        </button>
        <button
          className="panel-header-btn"
          onClick={() => resetParams(active as import('../types').EffectType)}
          title="Réinitialiser les paramètres"
        >
          ↺
        </button>
        <button
          className="panel-header-btn panel-close-btn"
          onClick={() => selectEffect(null)}
          title="Fermer le panneau"
        >
          ✕
        </button>
      </div>
      {Panel && <Panel />}
    </div>
  );
}
