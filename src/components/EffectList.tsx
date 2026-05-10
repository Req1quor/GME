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
import type { ActiveEffect, EffectType } from '../types';

const EFFECT_LABELS: Record<EffectType, string> = {
  dither:        'Dithering',
  ascii:         'ASCII',
  brutalist:     'Brutalisme',
  cybersigilism: 'Cybersigilism',
  thermal:       'Thermique',
  nightvision:   'Vision nocturne',
  infrared:      'Infrarouge',
  pointcloud:    'Point cloud',
  topo:          'Topo contours',
};

const EFFECT_ICONS: Record<EffectType, string> = {
  dither:        '▒',
  ascii:         'A',
  brutalist:     '▪',
  cybersigilism: '✦',
  thermal:       '◈',
  nightvision:   '◉',
  infrared:      '⊛',
  pointcloud:    '⋮',
  topo:          '≋',
};

const EFFECT_DESCS: Record<EffectType, string> = {
  dither:        'quantisation · bruit',
  ascii:         'caractères · typo',
  brutalist:     'glitch · contours · tri',
  cybersigilism: 'sigil · nœuds · symétrie',
  thermal:       'fausse couleur · heatmap',
  nightvision:   'phosphore · tube · intensif.',
  infrared:      'Aerochrome · IR · canaux',
  pointcloud:    'LiDAR · points · scatter',
  topo:          'iso-contours · bandes',
};

function SortableEffectCard({
  effect,
  selectedEffect,
  onSelect,
  onToggle,
}: {
  effect: ActiveEffect;
  selectedEffect: EffectType | null;
  onSelect: (t: EffectType) => void;
  onToggle: (t: EffectType) => void;
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
  const { effects, toggleEffect, selectEffect, selectedEffect, reorderEffects } = useApp();
  const activeCount = effects.filter(e => e.enabled).length;

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
      <div className="effect-list-header">
        Effets
        {activeCount > 0 && (
          <span className="effect-list-badge">{activeCount}</span>
        )}
      </div>
      <div className="effect-list-hint">Clic = sélectionner · ● = activer · ⠿ glisser pour réordonner</div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={effects.map(e => e.id)} strategy={verticalListSortingStrategy}>
          {effects.map(effect => (
            <SortableEffectCard
              key={effect.id}
              effect={effect}
              selectedEffect={selectedEffect}
              onSelect={selectEffect}
              onToggle={toggleEffect}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
