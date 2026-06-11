import { useRef, useState, useCallback, useEffect } from 'react';
import { useApp } from '../context';
import { drawVisualizerFrame, resetVisualizerState } from '../effects/visualizer';
import type { VizMode } from '../types';

const VIZ_WIDTH  = 960;
const VIZ_HEIGHT = 540;

const VIZ_LABELS: Record<VizMode, string> = {
  bars:        'BARS',
  scope:       'SCOPE',
  spectrogram: 'SPECTRO',
  rings:       'RINGS',
  mirror:      'MIRROR',
  storm:       'STORM',
  flux:        'FLUX',
  vortex:      'VORTEX',
  attractor:   'CHAOS',
  petals:      'MANDALA',
  scape:       'RELIEF',
  weave:       'TRAME',
};

const MODES = Object.keys(VIZ_LABELS) as VizMode[];

export function AudioVisualizer() {
  const {
    processRawFrame, processGPU, setDirectResult, setDirectSource, setAppMode,
    visualizerParams, updateVisualizerParams,
    pendingAudioFile, setPendingAudioFile,
    effects, adjustments,
    getDisplayCanvas,
    setAudioData,
  } = useApp();

  // ── Refs for stale-closure-safe RAF loop ───────────────────────────────────
  const processRef          = useRef(processRawFrame);
  const processGPURef       = useRef(processGPU);
  const setAudioDataRef     = useRef(setAudioData);
  const vizParamsRef        = useRef(visualizerParams);
  const startedAtRef        = useRef(0);
  const pausedAtRef         = useRef(0);
  const effectsRef          = useRef(effects);
  const adjustmentsRef      = useRef(adjustments);
  const getDisplayCanvasRef = useRef(getDisplayCanvas);
  const audioCtxRef         = useRef<AudioContext | null>(null);
  const analyserRef         = useRef<AnalyserNode | null>(null);
  const sourceRef           = useRef<AudioBufferSourceNode | null>(null);
  const rafRef              = useRef<number>(0);

  const [loaded,      setLoaded]      = useState(false);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [duration,    setDuration]    = useState(0);
  const [startedAt,   setStartedAt]   = useState(0);
  const [pausedAt,    setPausedAt]    = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [fileName,    setFileName]    = useState('');

  // Keep refs in sync
  useEffect(() => { processRef.current          = processRawFrame;   }, [processRawFrame]);
  useEffect(() => { processGPURef.current        = processGPU;        }, [processGPU]);
  useEffect(() => { setAudioDataRef.current      = setAudioData;      }, [setAudioData]);
  useEffect(() => { vizParamsRef.current         = visualizerParams;  }, [visualizerParams]);
  useEffect(() => { startedAtRef.current         = startedAt;         }, [startedAt]);
  useEffect(() => { pausedAtRef.current          = pausedAt;          }, [pausedAt]);
  useEffect(() => { effectsRef.current           = effects;           }, [effects]);
  useEffect(() => { adjustmentsRef.current       = adjustments;       }, [adjustments]);
  useEffect(() => { getDisplayCanvasRef.current  = getDisplayCanvas;  }, [getDisplayCanvas]);

  // Wire smooth parameter to analyser
  useEffect(() => {
    if (analyserRef.current) {
      analyserRef.current.smoothingTimeConstant = visualizerParams.smooth;
    }
  }, [visualizerParams.smooth]);

  // ── Frame rendering ────────────────────────────────────────────────────────

  const needsProcessing = useCallback((): boolean => {
    if (effectsRef.current.some(e => e.enabled)) return true;
    const a = adjustmentsRef.current;
    return !(a.brightness === 0 && a.contrast === 0 && a.saturation === 100 && a.gamma === 1.0);
  }, []);

  const drawFrame = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    // ── Extract audio metrics every frame and feed reactivity system ───────
    const fLen    = analyser.frequencyBinCount;
    const fBuf    = new Uint8Array(fLen);
    analyser.getByteFrequencyData(fBuf);
    const bassEnd = Math.max(1, Math.floor(fLen * 0.06));
    const midEnd  = Math.max(1, Math.floor(fLen * 0.40));
    let bass = 0, mid = 0, treble = 0;
    for (let i = 0;       i < bassEnd; i++) bass   += fBuf[i];
    for (let i = bassEnd; i < midEnd;  i++) mid    += fBuf[i];
    for (let i = midEnd;  i < fLen;    i++) treble += fBuf[i];
    bass   /= bassEnd            * 255;
    mid    /= (midEnd - bassEnd) * 255;
    treble /= (fLen   - midEnd)  * 255;
    setAudioDataRef.current({ bass, mid, treble, amplitude: bass * 0.5 + mid * 0.35 + treble * 0.15 });

    const vizCanvas = drawVisualizerFrame(analyser, VIZ_WIDTH, VIZ_HEIGHT, vizParamsRef.current);

    if (needsProcessing()) {
      // GPU pipeline — no expensive getImageData() readback
      processGPURef.current(vizCanvas);
    } else {
      const display = getDisplayCanvasRef.current();
      if (display) {
        if (display.width !== VIZ_WIDTH || display.height !== VIZ_HEIGHT) {
          display.width  = VIZ_WIDTH;
          display.height = VIZ_HEIGHT;
        }
        display.getContext('2d')!.drawImage(vizCanvas, 0, 0);
      }
    }
  }, [needsProcessing]);

  // Redraw on param / effect change while paused
  useEffect(() => {
    if (!isPlaying && analyserRef.current) drawFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processRawFrame, visualizerParams, effects, adjustments, isPlaying]);

  const rafLoop = useCallback(() => {
    const analyser = analyserRef.current;
    const ctx      = audioCtxRef.current;
    if (!analyser || !ctx) return;
    drawFrame();
    setCurrentTime(ctx.currentTime - startedAtRef.current + pausedAtRef.current);
    rafRef.current = requestAnimationFrame(rafLoop);
  }, [drawFrame]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── Transport ──────────────────────────────────────────────────────────────

  const createSource = useCallback((buffer: AudioBuffer, offset: number) => {
    const ctx = audioCtxRef.current!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(analyserRef.current!);
    analyserRef.current!.connect(ctx.destination);
    src.start(0, offset);
    src.onended = () => {
      if (src === sourceRef.current) {
        setIsPlaying(false);
        cancelAnimationFrame(rafRef.current);
        setPausedAt(0);
        setCurrentTime(0);
      }
    };
    sourceRef.current = src;
  }, [rafLoop]);

  const play = useCallback((offset = pausedAt) => {
    if (!audioBuffer || !audioCtxRef.current) return;
    createSource(audioBuffer, offset);
    const t = audioCtxRef.current.currentTime;
    setStartedAt(t);
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(rafLoop);
  }, [audioBuffer, pausedAt, createSource, rafLoop]);

  const pause = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const elapsed = ctx.currentTime - startedAtRef.current + pausedAtRef.current;
    sourceRef.current?.stop();
    sourceRef.current = null;
    setIsPlaying(false);
    cancelAnimationFrame(rafRef.current);
    setPausedAt(elapsed);
    pausedAtRef.current = elapsed;
    setCurrentTime(elapsed);
  }, []);

  const seek = useCallback((t: number) => {
    const wasPlaying = isPlaying;
    if (wasPlaying) { sourceRef.current?.stop(); sourceRef.current = null; cancelAnimationFrame(rafRef.current); }
    setPausedAt(t);
    setCurrentTime(t);
    if (wasPlaying && audioBuffer && audioCtxRef.current) setTimeout(() => play(t), 0);
  }, [isPlaying, audioBuffer, play]);

  const loadFile = useCallback(async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx    = new AudioContext();
    const analyser    = audioCtx.createAnalyser();
    analyser.fftSize                  = 2048;
    analyser.smoothingTimeConstant    = vizParamsRef.current.smooth;

    const buffer = await audioCtx.decodeAudioData(arrayBuffer);
    audioCtxRef.current  = audioCtx;
    analyserRef.current  = analyser;
    setAudioBuffer(buffer);
    setDuration(buffer.duration);
    setFileName(file.name);
    setLoaded(true);
    setPausedAt(0);
    setCurrentTime(0);
    setAppMode('audio');
    resetVisualizerState();

    const blank = new ImageData(VIZ_WIDTH, VIZ_HEIGHT);
    setDirectSource(blank, VIZ_WIDTH, VIZ_HEIGHT);
    setDirectResult(blank);
  }, [setAppMode, setDirectSource, setDirectResult]);

  useEffect(() => {
    if (!pendingAudioFile) return;
    setPendingAudioFile(null);
    loadFile(pendingAudioFile);
  }, [pendingAudioFile, setPendingAudioFile, loadFile]);

  const eject = useCallback(() => {
    pause();
    sourceRef.current?.stop();
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    sourceRef.current   = null;
    setLoaded(false);
    setIsPlaying(false);
    setAudioBuffer(null);
    setCurrentTime(0);
    setFileName('');
    resetVisualizerState();
    setAppMode('image');
  }, [pause, setAppMode]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const mode         = visualizerParams.mode;
  const hasBarCount  = mode === 'bars'  || mode === 'storm'  || mode === 'petals' || mode === 'scape';
  const hasDecay     = mode === 'flux'  || mode === 'vortex' || mode === 'storm'  || mode === 'scope';
  const activeEffects = effects.filter(e => e.enabled).length;

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const pct = duration > 0 ? `${(currentTime / duration) * 100}%` : '0%';

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!loaded) return <div className="audio-visualizer" />;

  return (
    <div className="audio-visualizer">
      <div className="avc">

        {/* ── Transport ─────────────────────────────────────────────── */}
        <div className="avc-transport">
          <button className="avc-play-btn" onClick={isPlaying ? pause : () => play()} title={isPlaying ? 'Pause' : 'Lecture'}>
            {isPlaying
              ? <svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12"/><rect x="9.5" y="2" width="3.5" height="12"/></svg>
              : <svg viewBox="0 0 16 16" fill="currentColor"><polygon points="4,2 14,8 4,14"/></svg>
            }
          </button>
          <div className="avc-seek-col">
            <div className="avc-filename" title={fileName}>{fileName}</div>
            <div className="avc-seek-row">
              <span className="avc-time">{fmt(currentTime)}</span>
              <input
                type="range" className="avc-seekbar"
                min={0} max={duration || 1} step={0.1} value={currentTime}
                style={{ '--fill': pct } as React.CSSProperties}
                onChange={e => seek(Number(e.target.value))}
              />
              <span className="avc-time">{fmt(duration)}</span>
            </div>
          </div>
          <button className="avc-eject-btn" onClick={eject} title="Éjecter">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <polygon points="8,2 14,9 2,9"/>
              <rect x="2" y="11" width="12" height="2.5"/>
            </svg>
          </button>
        </div>

        {/* ── Mode grid ─────────────────────────────────────────────── */}
        <div className="avc-modegrid">
          {MODES.map(m => (
            <button
              key={m}
              className={`avc-modekey${mode === m ? ' avc-modekey--on' : ''}`}
              onClick={() => updateVisualizerParams({ mode: m })}
            >{VIZ_LABELS[m]}</button>
          ))}
        </div>

        {/* ── Parameters ────────────────────────────────────────────── */}
        <div className="avc-params">
          <ParamRow label="GAIN"
            min={0.3} max={4} step={0.1} value={visualizerParams.gain}
            onChange={v => updateVisualizerParams({ gain: v })}
            fmt={v => v.toFixed(1) + '×'} />
          <ParamRow label="SMOOTH"
            min={0} max={95} step={5} value={Math.round(visualizerParams.smooth * 100)}
            onChange={v => updateVisualizerParams({ smooth: v / 100 })}
            fmt={v => v + '%'} />
          <ParamRow label="WIDTH"
            min={0.5} max={6} step={0.5} value={visualizerParams.lineWidth}
            onChange={v => updateVisualizerParams({ lineWidth: v })}
            fmt={v => v.toFixed(1)} />
          {hasBarCount && (
            <ParamRow label="RÉS"
              min={32} max={256} step={8} value={visualizerParams.barCount}
              onChange={v => updateVisualizerParams({ barCount: v })} />
          )}
          {hasDecay && (
            <ParamRow label="TRAIL"
              min={2} max={55} step={1} value={Math.round(visualizerParams.decay * 100)}
              onChange={v => updateVisualizerParams({ decay: v / 100 })}
              fmt={v => v + '%'} />
          )}
          {visualizerParams.glow && (
            <ParamRow label="GLOW"
              min={2} max={40} step={2} value={visualizerParams.glowSize}
              onChange={v => updateVisualizerParams({ glowSize: v })} />
          )}
        </div>

        {/* ── Options ───────────────────────────────────────────────── */}
        <div className="avc-opts">
          <ColorBtn label="C1"   value={visualizerParams.color}   onChange={v => updateVisualizerParams({ color:   v })} />
          <ColorBtn label="C2"   value={visualizerParams.color2}  onChange={v => updateVisualizerParams({ color2:  v })} />
          <ColorBtn label="BG"   value={visualizerParams.bgColor} onChange={v => updateVisualizerParams({ bgColor: v })} />
          <span className="avc-opts-spacer" />
          <Chip on={visualizerParams.glow} onClick={() => updateVisualizerParams({ glow: !visualizerParams.glow })}>GLOW</Chip>
          {activeEffects > 0 && <span className="avc-fx-badge">FX·{activeEffects}</span>}
        </div>

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ParamRow({
  label, min, max, step, value, onChange,
  fmt = (v: number) => String(Math.round(v)),
}: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <div className="avc-param-row">
      <span className="avc-param-label">{label}</span>
      <input
        type="range" className="avc-param-slider"
        min={min} max={max} step={step} value={value}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="avc-param-val">{fmt(value)}</span>
    </div>
  );
}

function ColorBtn({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="avc-color-btn" title={label}>
      <span className="avc-color-dot" style={{ background: value }} />
      <span className="avc-color-lbl">{label}</span>
      <input type="color" className="avc-color-input" value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`avc-chip${on ? ' avc-chip--on' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
