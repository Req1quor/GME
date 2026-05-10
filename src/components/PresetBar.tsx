import { useState } from 'react';
import { useApp } from '../context';
import type { Preset } from '../types';

export function PresetBar() {
  const { presets, savePreset, loadPreset, deletePreset, originalImage, canUndo, canRedo, undo, redo } = useApp();
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [showList, setShowList] = useState(false);

  const handleSave = () => {
    if (!originalImage) return;
    savePreset(saveName || `Preset ${presets.length + 1}`);
    setSaveName('');
    setShowSave(false);
  };

  return (
    <div className="preset-bar">
      {/* Undo / Redo */}
      <button
        className="preset-btn"
        onClick={undo}
        disabled={!canUndo}
        title="Annuler (Ctrl+Z)"
      >
        ↩
      </button>
      <button
        className="preset-btn"
        onClick={redo}
        disabled={!canRedo}
        title="Rétablir (Ctrl+Y)"
      >
        ↪
      </button>

      <div className="preset-sep" />

      {/* Save preset */}
      {showSave ? (
        <div className="preset-save-row">
          <input
            className="preset-name-input"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSave(false); }}
            placeholder="Nom du preset…"
            autoFocus
          />
          <button className="preset-btn preset-btn--accent" onClick={handleSave} disabled={!originalImage}>✓</button>
          <button className="preset-btn" onClick={() => setShowSave(false)}>✕</button>
        </div>
      ) : (
        <button
          className="preset-btn"
          onClick={() => setShowSave(true)}
          disabled={!originalImage}
          title="Sauvegarder la configuration actuelle"
        >
          + Preset
        </button>
      )}

      {/* Preset list */}
      {presets.length > 0 && (
        <div className="preset-dropdown-wrap">
          <button
            className={`preset-btn${showList ? ' preset-btn--on' : ''}`}
            onClick={() => setShowList(v => !v)}
            title="Charger un preset"
          >
            ▼ {presets.length}
          </button>
          {showList && (
            <div className="preset-dropdown" onClick={e => e.stopPropagation()}>
              {[...presets].reverse().map((p: Preset) => (
                <div key={p.id} className="preset-item">
                  <button
                    className="preset-item-name"
                    onClick={() => { loadPreset(p); setShowList(false); }}
                    title={new Date(p.createdAt).toLocaleString('fr-FR')}
                  >
                    {p.name}
                  </button>
                  <button
                    className="preset-item-del"
                    onClick={() => deletePreset(p.id)}
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
