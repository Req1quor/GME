import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useApp } from '../context';
import type { ActiveEffect, EffectType, EffectCategory } from '../types';
import { EFFECT_CATEGORIES } from '../types';

const EFFECT_LABELS: Record<EffectType, string> = {
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

const EFFECT_ICONS: Record<EffectType, string> = {
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

const EFFECT_DESCS: Record<EffectType, string> = {
  dither:             'quantisation · bruit',
  ascii:              'caractères · typo',
  brutalist:          'glitch · aberration · bruit',
  cybersigilism:      'sigil · nœuds · symétrie',
  thermal:            'fausse couleur · heatmap',
  nightvision:        'phosphore · tube · intensif.',
  infrared:           'Aerochrome · IR · canaux',
  pointcloud:         'LiDAR · points · scatter',
  topo:               'iso-contours · bandes',
  halftone:           'points · trame · impression',
  'matrix-rain':      'katakana · colonnes · vert',
  dots:               'grille · hexagonal · triangulaire',
  contour:            'Sobel · Laplacian · lignes',
  'pixel-sort':       'luminance · segment · direction',
  blockify:           'mosaïque · bloc · palette',
  'threshold-effect': 'binaire · adaptatif · duotone',
  'edge-detection':   'Sobel · Prewitt · Roberts',
  crosshatch:         'hachures · couches · angle',
  'wave-lines':       'sinus · bruit · sawtooth',
  'noise-field':      'fractal · perlin · domain-warp',
  voronoi:            'cellules · Voronoï · distance',
  vhs:                'bande · ghosting · tracking',
};

const CATEGORY_LABELS: Record<EffectCategory, string> = {
  analog:    '📼 Analogique',
  glitch:    '⚡ Glitch',
  art:       '🎨 Art numérique',
  print:     '🖨 Impression',
  structure: '🔬 Structure',
  sculpt:    '🗿 Sculpture',
};

const CATEGORY_ORDER: EffectCategory[] = ['analog', 'glitch', 'art', 'print', 'structure', 'sculpt'];

function SortableEffectCard({
  effect,
  selectedEffect,
  onSelect,
  onToggle,
  audioActive,
  onToggleAudio,
}: {
  effect: ActiveEffect;
  selectedEffect: EffectType | null;
  onSelect: (t: EffectType) => void;
  onToggle: (t: EffectType) => void;
  audioActive: boolean;
  onToggleAudio: (t: EffectType) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: effect.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 99 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="effect-card"
      data-selected={String(selectedEffect === effect.type)}
      data-enabled={String(effect.enabled)}
      onClick={() => onSelect(effect.type)}
    >
      <div
        className="effect-card-drag"
        title="Glisser pour réordonner"
        {...attributes}
        {...listeners}
        onClick={e => e.stopPropagation()}
      >
        ⠿
      </div>
      <div className="effect-card-icon">{EFFECT_ICONS[effect.type]}</div>
      <div className="effect-card-info">
        <span className="effect-card-label">{EFFECT_LABELS[effect.type]}</span>
        <span className="effect-card-desc">{EFFECT_DESCS[effect.type]}</span>
      </div>
      <button
        className="effect-audio-toggle"
        data-active={String(audioActive)}
        onClick={e => { e.stopPropagation(); onToggleAudio(effect.type); }}
        title={audioActive ? 'Désactiver réactivité audio' : 'Activer réactivité audio'}
        style={{ opacity: audioActive ? 1 : 0.3, fontSize: '10px', marginRight: 4, background: 'none', border: 'none', cursor: 'pointer', color: audioActive ? '#a855f7' : '#888' }}
      >
        ♪
      </button>
      <button
        className="effect-toggle"
        data-enabled={String(effect.enabled)}
        onClick={e => {
          e.stopPropagation();
          onToggle(effect.type);
          onSelect(effect.type);
        }}
        title={effect.enabled ? 'Désactiver' : 'Activer'}
      >
        <div className="effect-toggle-dot" />
      </button>
    </div>
  );
}

export function EffectList() {
  const { effects, toggleEffect, selectEffect, selectedEffect, reorderEffects, audioReactiveEffects, toggleEffectAudio } = useApp();
  const activeCount = effects.filter(e => e.enabled).length;
  const [collapsedCats, setCollapsedCats] = useState<Set<EffectCategory>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = effects.findIndex(e => e.id === active.id);
    const toIdx   = effects.findIndex(e => e.id === over.id);
    if (fromIdx !== -1 && toIdx !== -1) reorderEffects(fromIdx, toIdx);
  };

  const toggleCat = (cat: EffectCategory) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Group effects by category preserving per-category order from CATEGORY_ORDER
  const byCategory = new Map<EffectCategory, ActiveEffect[]>();
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, []);
  for (const effect of effects) {
    const cat = EFFECT_CATEGORIES[effect.type];
    byCategory.get(cat)?.push(effect);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
      <div className="effect-list-header">
        Effets
        {activeCount > 0 && (
          <span className="effect-list-badge">{activeCount}</span>
        )}
      </div>
      <div className="effect-list-hint">Clic = sélectionner · ● = activer · ♪ = audio · ⠿ glisser</div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={effects.map(e => e.id)} strategy={verticalListSortingStrategy}>
          {CATEGORY_ORDER.map(cat => {
            const catEffects = byCategory.get(cat) ?? [];
            if (catEffects.length === 0) return null;
            const collapsed = collapsedCats.has(cat);
            const catActive = catEffects.filter(e => e.enabled).length;
            return (
              <div key={cat} style={{ marginBottom: 4 }}>
                <button
                  onClick={() => toggleCat(cat)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '4px 6px', background: 'rgba(255,255,255,0.04)', border: 'none',
                    borderRadius: 4, cursor: 'pointer', color: '#ccc', fontSize: '11px', fontWeight: 600,
                    letterSpacing: '0.05em', marginBottom: collapsed ? 0 : 2,
                  }}
                >
                  <span>{CATEGORY_LABELS[cat]}</span>
                  <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {catActive > 0 && <span style={{ background: '#a855f7', color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: '9px' }}>{catActive}</span>}
                    <span style={{ fontSize: '9px', opacity: 0.6 }}>{collapsed ? '▶' : '▼'}</span>
                  </span>
                </button>
                {!collapsed && catEffects.map(effect => (
                  <SortableEffectCard
                    key={effect.id}
                    effect={effect}
                    selectedEffect={selectedEffect}
                    onSelect={selectEffect}
                    onToggle={toggleEffect}
                    audioActive={audioReactiveEffects[effect.type]}
                    onToggleAudio={toggleEffectAudio}
                  />
                ))}
              </div>
            );
          })}
        </SortableContext>
      </DndContext>
    </div>
  );
}
