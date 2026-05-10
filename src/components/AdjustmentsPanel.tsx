import { useApp } from '../context';

export function AdjustmentsPanel() {
  const { adjustments, updateAdjustments, resetAdjustments, originalImage } = useApp();
  if (!originalImage) return null;

  const hasChanges = adjustments.brightness !== 0 || adjustments.contrast !== 0
    || adjustments.saturation !== 100 || adjustments.gamma !== 1.0;

  return (
    <div className="adj-panel">
      <div className="adj-header">
        <span className="adj-title">Réglages image</span>
        {hasChanges && (
          <button className="adj-reset-btn" onClick={resetAdjustments} title="Réinitialiser">
            ↺
          </button>
        )}
      </div>
      <div className="adj-rows">
        <AdjRow
          label="Luminosité"
          value={adjustments.brightness}
          min={-100} max={100} step={1}
          onChange={v => updateAdjustments({ brightness: v })}
          display={v => (v > 0 ? '+' : '') + v}
        />
        <AdjRow
          label="Contraste"
          value={adjustments.contrast}
          min={-100} max={100} step={1}
          onChange={v => updateAdjustments({ contrast: v })}
          display={v => (v > 0 ? '+' : '') + v}
        />
        <AdjRow
          label="Saturation"
          value={adjustments.saturation}
          min={0} max={200} step={1}
          onChange={v => updateAdjustments({ saturation: v })}
          display={v => v + '%'}
        />
        <AdjRow
          label="Gamma"
          value={adjustments.gamma}
          min={0.2} max={3.0} step={0.05}
          onChange={v => updateAdjustments({ gamma: v })}
          display={v => v.toFixed(2)}
        />
      </div>
    </div>
  );
}

function AdjRow({
  label, value, min, max, step, onChange, display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: (v: number) => string;
}) {
  return (
    <div className="adj-row">
      <span className="adj-label">{label}</span>
      <input
        type="range"
        className="adj-slider"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="adj-value">{display(value)}</span>
    </div>
  );
}
