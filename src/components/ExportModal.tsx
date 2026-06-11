import { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../context';
import { glRenderer } from '../gl/renderer';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

// ── helpers ──────────────────────────────────────────────────────────────────
function ts() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function imageDataToCanvas(img: ImageData) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

// ── types ─────────────────────────────────────────────────────────────────────
type ImgFormat = 'png' | 'jpeg' | 'webp';
type VidFormat = 'frame' | 'gif' | 'webm';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  isGif: boolean;
  onClose: () => void;
  onPause: () => void;
  onPlay: () => void;
  processRef: React.RefObject<(img: ImageData) => ImageData>;
}

export function ExportModal({ videoRef, isPlaying, onClose, onPause, onPlay, processRef }: Props) {
  const { appMode, resultImage, getDisplayCanvas } = useApp();
  const isVideo = appMode === 'video' || appMode === 'audio';

  const [quality, setQuality]       = useState(92);

  // ── GIF settings ──────────────────────────────────────────────────────────
  const [gifFps,      setGifFps]      = useState(15);
  const [gifDuration, setGifDuration] = useState(5);
  const [gifColors,   setGifColors]   = useState(256);
  const [gifScale,    setGifScale]    = useState(100); // %

  // ── WebM settings ─────────────────────────────────────────────────────────
  const [webmBitrate,  setWebmBitrate]  = useState(12);  // Mbps
  const [webmDuration, setWebmDuration] = useState(10);  // seconds (audio viz only)

  // ── State ─────────────────────────────────────────────────────────────────
  const [progress,    setProgress]    = useState<number | null>(null);
  const [status,      setStatus]      = useState('');
  const [tab,         setTab]         = useState<ImgFormat | VidFormat>(isVideo ? 'webm' : 'png');
  const busy = progress !== null;
  const abortRef = useRef(false);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Get current rendered frame ─────────────────────────────────────────────
  const getFrame = useCallback((): ImageData | null => {
    // GPU path (most modes when at least one effect is active)
    if (glRenderer.ready && glRenderer.width > 0) return glRenderer.readback();
    // Fallback: read directly from the display canvas (audio mode no-effects path)
    const display = getDisplayCanvas();
    if (display && display.width > 0 && display.height > 0) {
      return display.getContext('2d')!.getImageData(0, 0, display.width, display.height);
    }
    return resultImage;
  }, [resultImage, getDisplayCanvas]);

  // ── Image export ──────────────────────────────────────────────────────────
  const exportImage = useCallback(async (fmt: ImgFormat) => {
    const img = getFrame();
    if (!img) return;
    const canvas = imageDataToCanvas(img);
    const mime   = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[fmt];
    const ext    = fmt === 'jpeg' ? 'jpg' : fmt;
    const q      = fmt === 'png' ? undefined : quality / 100;
    canvas.toBlob(blob => { if (blob) download(blob, `gme_${ts()}.${ext}`); }, mime, q);
  }, [getFrame, quality]);

  const copyToClipboard = useCallback(async () => {
    const img = getFrame();
    if (!img) return;
    const canvas = imageDataToCanvas(img);
    canvas.toBlob(async blob => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setStatus('✓ Copié dans le presse-papier');
        setTimeout(() => setStatus(''), 2000);
      } catch {
        setStatus('✗ Clipboard non supporté');
        setTimeout(() => setStatus(''), 3000);
      }
    }, 'image/png');
  }, [getFrame]);

  // ── Export frame from video ───────────────────────────────────────────────
  const exportVideoFrame = useCallback(async () => {
    await exportImage('png');
  }, [exportImage]);

  // ── GIF export ────────────────────────────────────────────────────────────
  const exportGif = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const wasPlaying = isPlaying;
    if (wasPlaying) onPause();
    abortRef.current = false;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const sw = Math.round(vw * gifScale / 100);
    const sh = Math.round(vh * gifScale / 100);
    const maxDur = Math.min(gifDuration, isFinite(video.duration) ? video.duration : gifDuration);
    const frameCount = Math.round(maxDur * gifFps);
    const delay = Math.round(1000 / gifFps);

    setProgress(0);
    setStatus('Encodage GIF…');

    const encoder = GIFEncoder();
    const tc = document.createElement('canvas');
    tc.width = sw; tc.height = sh;
    const ctx = tc.getContext('2d', { willReadFrequently: true })!;

    for (let i = 0; i < frameCount; i++) {
      if (abortRef.current) break;
      video.currentTime = (i / Math.max(frameCount - 1, 1)) * maxDur;
      await new Promise<void>(r => {
        const h = () => { video.removeEventListener('seeked', h); r(); };
        video.addEventListener('seeked', h);
      });
      ctx.drawImage(video, 0, 0, sw, sh);
      const raw  = ctx.getImageData(0, 0, sw, sh);
      const proc = processRef.current(raw);
      const rgba = new Uint8ClampedArray(proc.data);
      const pal  = quantize(rgba, gifColors);
      const idx  = applyPalette(rgba, pal);
      encoder.writeFrame(idx, sw, sh, { palette: pal, delay });
      setProgress(Math.round(((i + 1) / frameCount) * 100));
      setStatus(`Frame ${i + 1}/${frameCount}…`);
    }

    if (!abortRef.current) {
      encoder.finish();
      const blob = new Blob([encoder.bytes().buffer as ArrayBuffer], { type: 'image/gif' });
      download(blob, `gme_${ts()}.gif`);
      setStatus('✓ GIF exporté');
    } else {
      setStatus('Annulé');
    }
    setProgress(null);
    setTimeout(() => setStatus(''), 2000);
    if (wasPlaying) onPlay();
  }, [videoRef, isPlaying, onPause, onPlay, gifFps, gifDuration, gifColors, gifScale, processRef]);

  // ── WebM export — capture the live display canvas stream ─────────────────
  const exportWebm = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const displayCanvas = getDisplayCanvas();
    if (!displayCanvas) return;
    const wasPlaying = isPlaying;
    abortRef.current = false;

    // Supported codec?
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find(m => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';

    const stream   = displayCanvas.captureStream(60);

    // Add audio from the video element if available
    try {
      const videoStream = (video as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
      videoStream.getAudioTracks().forEach(track => stream.addTrack(track));
    } catch {
      // No audio or not supported — continue with video-only
    }

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: webmBitrate * 1_000_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    setStatus('Enregistrement…');
    setProgress(0);

    // Seek to start
    video.loop = false;
    video.currentTime = 0;
    await new Promise<void>(r => { const h = () => { video.removeEventListener('seeked', h); r(); }; video.addEventListener('seeked', h); });

    recorder.start(100);
    video.play();

    const duration = isFinite(video.duration) ? video.duration : 0;

    await new Promise<void>(resolve => {
      const onEnded = () => { video.removeEventListener('ended', onEnded); resolve(); };
      video.addEventListener('ended', onEnded);

      const tick = () => {
        if (video.ended || video.paused || abortRef.current) { resolve(); return; }
        if (duration > 0) setProgress(Math.round((video.currentTime / duration) * 100));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    recorder.stop();

    await new Promise<void>(r => { recorder.onstop = () => r(); });
    const blob = new Blob(chunks, { type: 'video/webm' });
    if (!abortRef.current) {
      download(blob, `gme_${ts()}.webm`);
      setStatus('✓ WebM exporté');
    } else {
      setStatus('Annulé');
    }

    video.loop = true;
    setProgress(null);
    setTimeout(() => setStatus(''), 2000);
    if (wasPlaying) onPlay();
  }, [videoRef, isPlaying, onPlay, getDisplayCanvas, webmBitrate]);

  // ── Audio visualizer WebM export (canvas capture, no video element needed) ──
  const exportAudioViz = useCallback(async () => {
    const displayCanvas = getDisplayCanvas();
    if (!displayCanvas) return;
    abortRef.current = false;
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find(m => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
    const stream   = displayCanvas.captureStream(60);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: webmBitrate * 1_000_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    setStatus('Enregistrement…');
    setProgress(0);
    recorder.start(100);
    const duration = webmDuration;
    await new Promise<void>(resolve => {
      const start = performance.now();
      const tick = () => {
        if (abortRef.current) { resolve(); return; }
        const elapsed = (performance.now() - start) / 1000;
        setProgress(Math.min(100, Math.round((elapsed / duration) * 100)));
        if (elapsed >= duration) { resolve(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    recorder.stop();
    await new Promise<void>(r => { recorder.onstop = () => r(); });
    if (!abortRef.current) {
      const blob = new Blob(chunks, { type: 'video/webm' });
      download(blob, `gme_viz_${ts()}.webm`);
      setStatus('✓ WebM exporté');
    } else {
      setStatus('Annulé');
    }
    setProgress(null);
    setTimeout(() => setStatus(''), 2000);
  }, [getDisplayCanvas, webmBitrate, webmDuration]);

  const abort = () => { abortRef.current = true; };

  // ── Render ─────────────────────────────────────────────────────────────────
  const imgTabs: { id: ImgFormat; label: string }[] = [
    { id: 'png',  label: 'PNG'  },
    { id: 'jpeg', label: 'JPG'  },
    { id: 'webp', label: 'WEBP' },
  ];
  const vidTabs: { id: VidFormat; label: string }[] = appMode === 'audio'
    ? [{ id: 'frame', label: 'Image' }, { id: 'webm', label: 'WebM' }]
    : [{ id: 'frame', label: 'Image' }, { id: 'gif', label: 'GIF' }, { id: 'webm', label: 'WebM' }];
  const tabs = isVideo ? vidTabs : imgTabs;

  return (
    <div className="export-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="export-modal">
        <div className="export-modal-header">
          <span className="export-modal-title">Exporter</span>
          <button className="export-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Format tabs */}
        <div className="export-modal-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`export-modal-tab${tab === t.id ? ' export-modal-tab--on' : ''}`}
              onClick={() => setTab(t.id)}
              disabled={busy}
            >{t.label}</button>
          ))}
        </div>

        {/* Settings */}
        <div className="export-modal-body">

          {/* PNG — no settings */}
          {tab === 'png' && (
            <div className="export-modal-info">Export sans perte · alpha supporté</div>
          )}

          {/* JPG / WEBP — quality */}
          {(tab === 'jpeg' || tab === 'webp') && (
            <label className="export-modal-row">
              <span className="export-modal-label">Qualité</span>
              <input type="range" min={50} max={100} step={1} value={quality}
                onChange={e => setQuality(+e.target.value)} className="export-modal-slider" />
              <span className="export-modal-val">{quality}%</span>
            </label>
          )}

          {/* Frame */}
          {tab === 'frame' && (
            <div className="export-modal-info">Export de la frame actuelle en PNG</div>
          )}

          {/* GIF */}
          {tab === 'gif' && (
            <>
              <label className="export-modal-row">
                <span className="export-modal-label">FPS</span>
                <input type="range" min={5} max={30} step={1} value={gifFps}
                  onChange={e => setGifFps(+e.target.value)} className="export-modal-slider" />
                <span className="export-modal-val">{gifFps}</span>
              </label>
              <label className="export-modal-row">
                <span className="export-modal-label">Durée max</span>
                <input type="range" min={1} max={30} step={0.5} value={gifDuration}
                  onChange={e => setGifDuration(+e.target.value)} className="export-modal-slider" />
                <span className="export-modal-val">{gifDuration}s</span>
              </label>
              <label className="export-modal-row">
                <span className="export-modal-label">Résolution</span>
                <input type="range" min={25} max={100} step={5} value={gifScale}
                  onChange={e => setGifScale(+e.target.value)} className="export-modal-slider" />
                <span className="export-modal-val">{gifScale}%</span>
              </label>
              <label className="export-modal-row">
                <span className="export-modal-label">Couleurs</span>
                <input type="range" min={16} max={256} step={16} value={gifColors}
                  onChange={e => setGifColors(+e.target.value)} className="export-modal-slider" />
                <span className="export-modal-val">{gifColors}</span>
              </label>
              <div className="export-modal-info">⚠ GIF est lent à encoder (frame par frame)</div>
            </>
          )}

          {/* WebM */}
          {tab === 'webm' && (
            <>
              <label className="export-modal-row">
                <span className="export-modal-label">Bitrate</span>
                <input type="range" min={2} max={40} step={2} value={webmBitrate}
                  onChange={e => setWebmBitrate(+e.target.value)} className="export-modal-slider" />
                <span className="export-modal-val">{webmBitrate} Mbps</span>
              </label>
              {appMode === 'audio' && (
                <label className="export-modal-row">
                  <span className="export-modal-label">Durée</span>
                  <input type="range" min={5} max={120} step={5} value={webmDuration}
                    onChange={e => setWebmDuration(+e.target.value)} className="export-modal-slider" />
                  <span className="export-modal-val">{webmDuration}s</span>
                </label>
              )}
              <div className="export-modal-info">
                {appMode === 'audio'
                  ? `Capture du canvas visualiseur · ${webmDuration}s · 60fps`
                  : 'Enregistrement en temps réel depuis le canvas GPU · 60fps'}
              </div>
            </>
          )}

          {/* Progress */}
          {progress !== null && (
            <div className="export-modal-progress-wrap">
              <div className="export-modal-progress-bar" style={{ width: `${progress}%` }} />
              <span className="export-modal-progress-label">{status || `${progress}%`}</span>
            </div>
          )}
          {progress === null && status && (
            <div className="export-modal-status">{status}</div>
          )}
        </div>

        {/* Footer */}
        <div className="export-modal-footer">
          {busy ? (
            <button className="export-modal-btn export-modal-btn--danger" onClick={abort}>Annuler</button>
          ) : (
            <>
              {/* Image mode */}
              {!isVideo && (
                <>
                  <button className="export-modal-btn export-modal-btn--secondary" onClick={copyToClipboard}>
                    ⎘ Copier
                  </button>
                  <button className="export-modal-btn export-modal-btn--primary" onClick={() => exportImage(tab as ImgFormat)}>
                    ↓ Télécharger
                  </button>
                </>
              )}
              {/* Video mode */}
              {isVideo && tab === 'frame' && <button className="export-modal-btn export-modal-btn--primary" onClick={exportVideoFrame}>↓ Frame PNG</button>}
              {isVideo && tab === 'gif'   && <button className="export-modal-btn export-modal-btn--primary" onClick={exportGif}>↓ Exporter GIF</button>}
              {isVideo && tab === 'webm'  && <button className="export-modal-btn export-modal-btn--primary" onClick={appMode === 'audio' ? exportAudioViz : exportWebm}>⏺ Exporter WebM</button>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
