import { useRef, useState, useCallback, useEffect } from 'react';
import { useApp } from '../context';
import { renderVisualizer, resetVisualizerState } from '../effects/visualizer';
import type { VizMode } from '../types';

const VIZ_WIDTH = 800;
const VIZ_HEIGHT = 600;

const VIZ_LABELS: Record<VizMode, string> = {
  bars: 'Barres',
  waveform: 'Oscilloscope',
  radial: 'Radial',
  spectrogram: 'Spectrogramme',
};

export function AudioVisualizer() {
  const { processRawFrame, setDirectResult, setDirectSource, setAppMode, visualizerParams, updateVisualizerParams, pendingAudioFile, setPendingAudioFile } = useApp();
  const processRef = useRef(processRawFrame);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number>(0);

  const [loaded, setLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [startedAt, setStartedAt] = useState(0); // audioCtx time when play() was called
  const [pausedAt, setPausedAt] = useState(0);   // offset in seconds
  const [currentTime, setCurrentTime] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [fileName, setFileName] = useState('');

  useEffect(() => { processRef.current = processRawFrame; }, [processRawFrame]);

  // Re-render current frame when effects/params change while paused
  useEffect(() => {
    if (!isPlaying && analyserRef.current) {
      const frame = renderVisualizer(analyserRef.current, VIZ_WIDTH, VIZ_HEIGHT, visualizerParams);
      setDirectResult(processRef.current(frame));
    }
  }, [processRawFrame, visualizerParams, isPlaying, setDirectResult]);

  const rafLoop = useCallback(() => {
    const analyser = analyserRef.current;
    const ctx = audioCtxRef.current;
    if (!analyser || !ctx) return;

    const frame = renderVisualizer(analyser, VIZ_WIDTH, VIZ_HEIGHT, visualizerParams);
    setDirectResult(processRef.current(frame));
    setCurrentTime(ctx.currentTime - startedAt + pausedAt);
    rafRef.current = requestAnimationFrame(rafLoop);
  // visualizerParams intentionally excluded — read via closure is fine since renderVisualizer uses latest opts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setDirectResult, startedAt, pausedAt]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

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
    const elapsed = ctx.currentTime - startedAt + pausedAt;
    sourceRef.current?.stop();
    sourceRef.current = null;
    setIsPlaying(false);
    cancelAnimationFrame(rafRef.current);
    setPausedAt(elapsed);
    setCurrentTime(elapsed);
  }, [startedAt, pausedAt]);

  const seek = useCallback((t: number) => {
    const wasPlaying = isPlaying;
    if (wasPlaying) {
      sourceRef.current?.stop();
      sourceRef.current = null;
      cancelAnimationFrame(rafRef.current);
    }
    setPausedAt(t);
    setCurrentTime(t);
    if (wasPlaying && audioBuffer && audioCtxRef.current) {
      setTimeout(() => play(t), 0);
    }
  }, [isPlaying, audioBuffer, play]);

  const loadFile = useCallback(async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.smoothingTimeConstant = 0;
    analyser.fftSize = 2048;
    const buffer = await audioCtx.decodeAudioData(arrayBuffer);

    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;
    setAudioBuffer(buffer);
    setDuration(buffer.duration);
    setFileName(file.name);
    setLoaded(true);
    setPausedAt(0);
    setCurrentTime(0);
    setAppMode('audio');
    resetVisualizerState();

    // Set canvas size
    const blank = new ImageData(VIZ_WIDTH, VIZ_HEIGHT);
    setDirectSource(blank, VIZ_WIDTH, VIZ_HEIGHT);
  }, [setAppMode, setDirectSource]);

  // Consume pendingAudioFile set by DropZone (must be after loadFile declaration)
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
    sourceRef.current = null;
    setLoaded(false);
    setIsPlaying(false);
    setAudioBuffer(null);
    setCurrentTime(0);
    setFileName('');
    resetVisualizerState();
    setAppMode('image');
  }, [pause, setAppMode]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="audio-visualizer">
      {!loaded ? null : (
        <div className="audio-controls">
          {/* File name */}
          <div className="audio-filename" title={fileName}>{fileName}</div>

          {/* Seek bar */}
          <div className="video-seek-row">
            <span className="video-time-label">{fmt(currentTime)}</span>
            <input
              type="range"
              className="video-seek"
              min={0} max={duration || 1} step={0.1}
              value={currentTime}
              onChange={e => seek(Number(e.target.value))}
            />
            <span className="video-time-label">{fmt(duration)}</span>
          </div>

          {/* Play controls */}
          <div className="video-ctrl-row">
            <button className="video-btn" onClick={isPlaying ? pause : () => play()} title={isPlaying ? 'Pause' : 'Lecture'}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="video-btn video-btn--eject" onClick={eject} title="Changer de fichier">⏏</button>
          </div>

          {/* Visualizer mode */}
          <div className="viz-mode-row">
            {(Object.keys(VIZ_LABELS) as VizMode[]).map(m => (
              <button
                key={m}
                className={`viz-mode-btn${visualizerParams.mode === m ? ' viz-mode-btn--on' : ''}`}
                onClick={() => updateVisualizerParams({ mode: m })}
              >{VIZ_LABELS[m]}</button>
            ))}
          </div>

          {/* Params */}
          <div className="viz-params">
            <VizRow label="Barres" min={16} max={256} value={visualizerParams.barCount} step={8}
              onChange={v => updateVisualizerParams({ barCount: v })} />
            <VizRow label="Amplitud." min={0.3} max={2.5} value={visualizerParams.scale} step={0.1}
              onChange={v => updateVisualizerParams({ scale: v })} fmt={v => v.toFixed(1)} />
            <VizRow label="Smooth" min={0} max={95} value={Math.round(visualizerParams.smooth * 100)} step={5}
              onChange={v => updateVisualizerParams({ smooth: v / 100 })} fmt={v => `${v}%`} />
            <VizRow label="Trait" min={1} max={8} value={visualizerParams.lineWidth} step={0.5}
              onChange={v => updateVisualizerParams({ lineWidth: v })} fmt={v => v.toFixed(1)} />

            <div className="viz-color-row">
              <label className="viz-color-label">Couleur 1</label>
              <input type="color" className="viz-color-input" value={visualizerParams.color}
                onChange={e => updateVisualizerParams({ color: e.target.value })} />
              <label className="viz-color-label">Couleur 2</label>
              <input type="color" className="viz-color-input" value={visualizerParams.color2}
                onChange={e => updateVisualizerParams({ color2: e.target.value })} />
              <label className="viz-color-label">Fond</label>
              <input type="color" className="viz-color-input" value={visualizerParams.bgColor}
                onChange={e => updateVisualizerParams({ bgColor: e.target.value })} />
            </div>

            <div className="viz-toggle-row">
              {[
                { key: 'gradient', label: 'Dégradé' },
                { key: 'symmetric', label: 'Symétrique' },
                { key: 'glow', label: 'Lueur' },
                { key: 'fill', label: 'Remplissage' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  className={`viz-toggle${visualizerParams[key as keyof typeof visualizerParams] ? ' viz-toggle--on' : ''}`}
                  onClick={() => updateVisualizerParams({ [key]: !visualizerParams[key as keyof typeof visualizerParams] })}
                >{label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-component: slider row ─────────────────────────────────────────────────

function VizRow({
  label, min, max, step, value, onChange, fmt = String,
}: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <div className="viz-row">
      <span className="viz-row-label">{label}</span>
      <input
        type="range" className="viz-row-slider"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="viz-row-value">{fmt(value)}</span>
    </div>
  );
}
