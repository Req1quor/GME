import './App.css';
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppProvider, useApp } from './context';
import { Canvas } from './components/Canvas';
import { EffectList } from './components/EffectList';
import { EffectPanel } from './components/EffectPanel';
import { ExportBar } from './components/ExportBar';
import { GridOverlay } from './components/GridOverlay';
import { HeaderControls } from './components/HeaderControls';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AdjustmentsPanel } from './components/AdjustmentsPanel';
import { PresetBar } from './components/PresetBar';
import { AudioVisualizer } from './components/AudioVisualizer';
import { WebcamPanel } from './components/WebcamPanel';

// Inner layout uses context (must be inside AppProvider)
function AppLayout({ theme, onToggleTheme }: { theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const { appMode, setOriginalImage, processImage, setAppMode, setPendingVideoUrl, setPendingAudioFile } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback((file: File) => {
    if (file.type.startsWith('video/') || file.type === 'image/gif') {
      setAppMode('video');
      setPendingVideoUrl({ url: URL.createObjectURL(file), isGif: file.type === 'image/gif' });
      return;
    }
    if (file.type.startsWith('audio/')) {
      setAppMode('audio');
      setPendingAudioFile(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 2000;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        setOriginalImage(canvas.getContext('2d')!.getImageData(0, 0, w, h), w, h);
        processImage();
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [setOriginalImage, processImage, setAppMode, setPendingVideoUrl, setPendingAudioFile]);

  return (
    <div className="app-layout">

      {/* Hidden file input for load button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) { loadFile(f); e.target.value = ''; } }}
      />

      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">✦</div>
          <div className="app-logo-text">
            <span className="app-logo-name">GME</span>
            <span className="app-logo-sep"> | </span>
            <span className="app-logo-brand">grandemaisonzoo.com</span>
          </div>
        </div>
        <div className="app-header-sep" />
        <button
          className="header-webcam-btn"
          onClick={() => { setAppMode('webcam'); }}
          title="Flux vidéo en direct (webcam, CamLink…)"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: 5}}>
            <rect x="1" y="4" width="10" height="8" rx="1.5"/>
            <polygon points="11,7 15,5 15,11 11,9"/>
          </svg>
          Webcam
        </button>
        <button
          className="header-load-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Charger une image, vidéo ou musique"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: 5}}>
            <path d="M8 11V3M4 7l4-4 4 4"/>
            <path d="M2 13h12"/>
          </svg>
          Charger
        </button>
        <button
          className="header-theme-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Passer en light mode' : 'Passer en dark mode'}
        >
          {theme === 'dark' ? '☀' : '◐'}
        </button>
        <HeaderControls />
      </header>

      {/* Left sidebar — media source + effect list */}
      <aside className="app-sidebar-left">
        {/* Source panel */}
        <div className="app-source-panel">
          {appMode === 'audio'   && <AudioVisualizer />}
          {appMode === 'webcam'  && <WebcamPanel />}
        </div>
        {/* Effect list always visible */}
        <EffectList />
      </aside>

      {/* Canvas area */}
      <main className="app-canvas-area">
        <Canvas />
        <GridOverlay />
      </main>

      {/* Right sidebar */}
      <aside className="app-sidebar-right" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <EffectPanel />
        <AdjustmentsPanel />
        <PresetBar />
        <ExportBar />
      </aside>

    </div>
  );
}

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <ErrorBoundary>
      <AppProvider>
        <AppLayout theme={theme} onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;


