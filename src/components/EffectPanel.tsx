import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context';
import type { DitherAlgo, DitherParams, AsciiParams, BrutalistParams, CybersigilismParams } from '../types';
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

// ─── Brutalist panel ─────────────────────────────────────────────────────────

function BrutalistPanel() {
  const { params, updateParams } = useApp();
  const p = params.brutalist as BrutalistParams;
  const update = (partial: Partial<BrutalistParams>) => updateParams('brutalist', partial);

  const presets = [
    { label: 'VHS', apply: () => update({ glitch: true, glitchIntensity: 4, glitchSeed: 42, chromaticAberration: true, chromaticAmount: 6, scanlines: true, scanlineIntensity: 0.4, noise: false, posterize: false, threshold: false, edgeDetect: false, pixelSort: false }) },
    { label: 'GLITCH', apply: () => update({ glitch: true, glitchIntensity: 8, glitchSeed: Math.floor(Math.random() * 9999), chromaticAberration: true, chromaticAmount: 12, scanlines: false, noise: true, noiseAmount: 10, posterize: false, threshold: false, edgeDetect: false, pixelSort: false }) },
    { label: 'GRAVURE', apply: () => update({ edgeDetect: true, edgeThreshold: 60, edgeColor: '#ffffff', posterize: false, threshold: false, glitch: false, chromaticAberration: false, scanlines: false, noise: false, pixelSort: false }) },
    { label: 'DATA', apply: () => update({ pixelSort: true, pixelSortAxis: 'horizontal', pixelSortThreshold: 100, glitch: true, glitchIntensity: 3, glitchSeed: 7, noise: true, noiseAmount: 15, posterize: false, threshold: false, edgeDetect: false, chromaticAberration: false, scanlines: false }) },
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
        <ParamRow label="">
          <Toggle value={p.threshold} onChange={v => update({ threshold: v })} label="Seuillage N/B" />
        </ParamRow>
        {p.threshold && (
          <ParamRow label="Seuil" value={p.thresholdValue}>
            <Slider min={0} max={255} value={p.thresholdValue} onChange={v => update({ thresholdValue: v })} />
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
          {(p.chromaticAberration ?? false) && <Tip text="Décale les canaux rouge et bleu horizontalement, imitant les lentilles optiques défectueuses ou les capteurs CRT." />}
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

      <Accordion label="Structures">
        <ParamRow label="">
          <Toggle value={p.edgeDetect ?? false} onChange={v => update({ edgeDetect: v })} label="Sobel edges" />
          {(p.edgeDetect ?? false) && <Tip text="Filtre Sobel : détecte les contours par gradient. Isole les arêtes de l'image — idéal pour un rendu gravure ou manga." />}
        </ParamRow>
        {p.edgeDetect && (
          <>
            <ParamRow label="Seuil" value={p.edgeThreshold ?? 100}>
              <Slider min={0} max={360} value={p.edgeThreshold ?? 100} onChange={v => update({ edgeThreshold: v })} />
            </ParamRow>
            <ParamRow label="Couleur contour">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="color" value={p.edgeColor ?? '#ffffff'} onChange={e => update({ edgeColor: e.target.value })} />
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--gm-muted)' }}>{(p.edgeColor ?? '#ffffff').toUpperCase()}</span>
              </div>
            </ParamRow>
          </>
        )}
        <ParamRow label="">
          <Toggle value={p.pixelSort ?? false} onChange={v => update({ pixelSort: v })} label="Pixel sort" />
          {(p.pixelSort ?? false) && <Tip text="Trie les pixels de chaque ligne (ou colonne) par luminosité — crée un effet de ruissellement caractéristique du glitch art." />}
        </ParamRow>
        {p.pixelSort && (
          <>
            <ParamRow label="Axe">
              <div style={{ display: 'flex', gap: 6 }}>
                {(['horizontal', 'vertical'] as const).map(a => (
                  <button key={a} className={`btn${(p.pixelSortAxis ?? 'horizontal') === a ? ' active' : ''}`}
                    style={{ flex: 1, fontSize: 10 }} onClick={() => update({ pixelSortAxis: a })}>
                    {a === 'horizontal' ? 'HORIZONTAL' : 'VERTICAL'}
                  </button>
                ))}
              </div>
            </ParamRow>
            <ParamRow label="Seuil" value={p.pixelSortThreshold ?? 128}>
              <Slider min={0} max={255} value={p.pixelSortThreshold ?? 128} onChange={v => update({ pixelSortThreshold: v })} />
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
};

const PANEL_LABELS: Record<string, string> = {
  dither: 'Dithering',
  ascii: 'ASCII',
  brutalist: 'Brutalisme',
  cybersigilism: 'Cybersigilism',
  thermal: 'Thermique',
  nightvision: 'Vision nocturne',
  infrared: 'Infrarouge',
  pointcloud: 'Point cloud',
  topo: 'Topo contours',
};

export function EffectPanel() {
  const { selectedEffect, effects, selectEffect, toggleEffect, originalImage, resetParams } = useApp();
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
            {effects.map(e => {
              const ICONS: Record<string, string> = { dither: '▒', ascii: 'A', brutalist: '▪', cybersigilism: '✦', thermal: '◈', nightvision: '◉', infrared: '⊛', pointcloud: '⋮', topo: '≋' };
              const NAMES: Record<string, string> = { dither: 'Dithering', ascii: 'ASCII', brutalist: 'Brutalisme', cybersigilism: 'Cybersigilism', thermal: 'Thermique', nightvision: 'Vision nocturne', infrared: 'Infrarouge', pointcloud: 'Point cloud', topo: 'Topo contours' };
              return (
                <button
                  key={e.type}
                  className={`panel-effect-card${e.enabled ? ' panel-effect-card--on' : ''}`}
                  onClick={() => { if (!e.enabled) toggleEffect(e.type); selectEffect(e.type); }}
                >
                  <span className="panel-effect-card-icon">{ICONS[e.type]}</span>
                  <span className="panel-effect-card-name">{NAMES[e.type]}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const Panel = PANELS[active];
  const PANEL_ICONS: Record<string, string> = { dither: '▒', ascii: 'A', brutalist: '▪', cybersigilism: '✦', thermal: '◈', nightvision: '◉', infrared: '⊛', pointcloud: '⋮', topo: '≋' };
  const isEnabled = effects.find(e => e.type === active)?.enabled ?? false;
  return (
    <div className="panel-content">
      <div className="panel-header">
        <span className="panel-header-icon">{PANEL_ICONS[active]}</span>
        <span style={{ flex: 1 }}>{PANEL_LABELS[active]}</span>
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
