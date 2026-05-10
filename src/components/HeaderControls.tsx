import { useEffect } from 'react';
import { useApp } from '../context';
import type { LiveSpeed } from '../context';

const SPEED_LABELS: Record<LiveSpeed, string> = { slow: '½×', normal: '1×', fast: '3×' };
const SPEED_TITLES: Record<LiveSpeed, string> = { slow: 'Lent (2.4s)', normal: 'Normal (1.2s)', fast: 'Rapide (0.4s)' };

export function HeaderControls() {
  const { originalImage, appMode, destroyAmount, setDestroyAmount, liveMode, toggleLiveMode, liveSpeed, setLiveSpeed, randomize } = useApp();

  // Spacebar = capture (stop live mode) / L = toggle live
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); if (liveMode) toggleLiveMode(); }
      if (e.code === 'KeyL')  { e.preventDefault(); toggleLiveMode(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [liveMode, toggleLiveMode]);

  if (!originalImage && appMode !== 'video') return null;

  return (
    <>
      <div className="header-destroy">
        <span className="header-destroy-label">Destroy</span>
        <input
          type="range"
          min={0} max={100} step={1}
          value={destroyAmount}
          onChange={e => setDestroyAmount(Number(e.target.value))}
          className="header-destroy-slider"
          style={{ '--fill': `${destroyAmount}%` } as React.CSSProperties}
          title={`Destroy: ${destroyAmount}%`}
        />
        <span className="header-destroy-value">{destroyAmount}%</span>
      </div>

      <button
        className="header-random-btn"
        onClick={randomize}
        title="Effets et paramètres aléatoires"
      >
        🎲
      </button>

      <button
        className={`header-live-btn${liveMode ? ' header-live-btn--on' : ''}`}
        onClick={toggleLiveMode}
        title={liveMode ? 'Espace ou L pour capturer' : 'Activer le mode live (L)'}
      >
        <span className={`header-live-dot${liveMode ? ' header-live-dot--on' : ''}`} />
        Live
      </button>

      {/* Speed selector — only visible when live mode is on */}
      {liveMode && (
        <div className="header-live-speed">
          {(Object.keys(SPEED_LABELS) as LiveSpeed[]).map(s => (
            <button
              key={s}
              className={`header-speed-btn${liveSpeed === s ? ' header-speed-btn--on' : ''}`}
              onClick={() => setLiveSpeed(s)}
              title={SPEED_TITLES[s]}
            >
              {SPEED_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
