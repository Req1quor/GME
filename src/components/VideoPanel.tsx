import { useRef, useState, useCallback, useEffect } from 'react';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { useApp } from '../context';
import { ExportModal } from './ExportModal';


export function VideoPanel() {
  const {
    processRawFrame, setDirectResult, setDirectSource,
    setAppMode, pendingVideoUrl, setPendingVideoUrl,
    processGPU, gpuReady, setCanvasSizeOnly,
    effects, params, adjustments,
  } = useApp();

  const videoRef     = useRef<HTMLVideoElement>(null);
  const tempCanvas   = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const rafRef       = useRef<number>(0);
  const processRef   = useRef(processRawFrame);
  const processGPURef = useRef(processGPU);
  const gpuReadyRef   = useRef(gpuReady);
  // Adaptive throttle: skip frames when GPU is struggling to keep up
  const lastFrameMs    = useRef(0);
  const frameIntervalMs = useRef(0); // 0 = run every RAF

  const [loaded,      setLoaded]      = useState(false);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [duration,    setDuration]    = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed,       setSpeed]       = useState(1);
  const [loop,        setLoop]        = useState(true);
  const [volume,      setVolume]      = useState(1);
  const [showExport,  setShowExport]  = useState(false);
  const isGifRef = useRef(false);

  useEffect(() => { processRef.current = processRawFrame; }, [processRawFrame]);
  useEffect(() => { processGPURef.current = processGPU; }, [processGPU]);
  useEffect(() => { gpuReadyRef.current = gpuReady; }, [gpuReady]);

  const pause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video || isGifRef.current) return;
    video.play().catch(() => {});
    setIsPlaying(true);
  }, []);

  const seek = useCallback((t: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = t;
    setCurrentTime(t);
  }, []);

  const eject = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    pause();
    video.src = '';
    setLoaded(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAppMode('image');
  }, [pause, setAppMode]);

  const setVideoSpeed = useCallback((s: number) => {
    setSpeed(s);
    if (videoRef.current) videoRef.current.playbackRate = s;
  }, []);

  // Keep isPlaying in a ref so the effects-change watcher can read it without re-subscribing
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Render a single frame to canvas (used on seek/loadeddata while paused)
  const drawSingleFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    if (gpuReadyRef.current) {
      processGPURef.current(video);
    } else {
      const tc = tempCanvas.current;
      if (tc.width !== video.videoWidth || tc.height !== video.videoHeight) {
        tc.width = video.videoWidth; tc.height = video.videoHeight;
      }
      const ctx2 = tc.getContext('2d', { willReadFrequently: true })!;
      ctx2.drawImage(video, 0, 0);
      const raw = ctx2.getImageData(0, 0, tc.width, tc.height);
      const out = processRef.current(raw);
      setDirectResult(out);
      setDirectSource(raw, tc.width, tc.height);
    }
  }, [setDirectResult, setDirectSource]);

  // Redraw when effects/params/adjustments change while video is paused
  useEffect(() => {
    if (!loaded || isPlayingRef.current || isGifRef.current) return;
    drawSingleFrame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effects, params, adjustments]);

  // Load video/gif from pendingVideoUrl
  useEffect(() => {
    if (!pendingVideoUrl) return;
    const video = videoRef.current;
    if (!video) return;
    const { url, isGif: srcIsGif } = pendingVideoUrl;
    setPendingVideoUrl(null);
    isGifRef.current = srcIsGif;
    if (srcIsGif) {
      // parse GIF
      fetch(url).then(r => r.arrayBuffer()).then(async ab => {
        const gif = parseGIF(ab);
        const frames = decompressFrames(gif, true);
        if (!frames.length) return;
        const w = gif.lsd.width, h = gif.lsd.height;
        setCanvasSizeOnly(w, h);
        setLoaded(true);
        const cvs = document.createElement('canvas');
        cvs.width = w; cvs.height = h;
        const ctx = cvs.getContext('2d')!;
        const composite = document.createElement('canvas');
        composite.width = w; composite.height = h;
        const cctx = composite.getContext('2d')!;
        let fi = 0;
        const playFrame = () => {
          const frame = frames[fi % frames.length];
          const img = ctx.createImageData(frame.dims.width, frame.dims.height);
          img.data.set(frame.patch);
          if (frame.disposalType === 2) cctx.clearRect(0, 0, w, h);
          cctx.putImageData(img, frame.dims.left, frame.dims.top);
          const full = cctx.getImageData(0, 0, w, h);
          const out = processRef.current(full);
          setDirectResult(out);
          setDirectSource(full, w, h);
          fi++;
          rafRef.current = window.setTimeout(playFrame, frame.delay || 100) as unknown as number;
        };
        playFrame();
      });
    } else {
      const updateDuration = () => {
        if (isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
      };
      video.addEventListener('loadedmetadata', () => {
        updateDuration();
        setCanvasSizeOnly(video.videoWidth, video.videoHeight);
      }, { once: true });
      video.addEventListener('durationchange', updateDuration);
      video.addEventListener('timeupdate', () => {
        setCurrentTime(video.currentTime);
        if (!isFinite(video.duration) === false && video.duration > 0) setDuration(video.duration);
      });
      video.src = url;
      video.load();
      setLoaded(true);
      const drawLoop = () => {
        const now = performance.now();
        if (!video.paused && !video.ended && (now - lastFrameMs.current) >= frameIntervalMs.current) {
          if (gpuReadyRef.current) {
            // Pass video element directly â€” no CPU readback, no getImageData
            const t0 = performance.now();
            processGPURef.current(video);
            const elapsed = performance.now() - t0;
            // Adaptive throttle: if processing > 20ms, limit rate to avoid GPU starvation
            frameIntervalMs.current = elapsed > 20 ? elapsed * 1.05 : 0;
            lastFrameMs.current = now;
          } else {
            // CPU fallback â€” still needs pixel readback
            const tc = tempCanvas.current;
            if (tc.width !== video.videoWidth || tc.height !== video.videoHeight) {
              tc.width = video.videoWidth; tc.height = video.videoHeight;
            }
            const ctx2 = tc.getContext('2d', { willReadFrequently: true })!;
            ctx2.drawImage(video, 0, 0);
            const raw = ctx2.getImageData(0, 0, tc.width, tc.height);
            const out = processRef.current(raw);
            setDirectResult(out);
            setDirectSource(raw, tc.width, tc.height);
            lastFrameMs.current = now;
          }
        }
        rafRef.current = requestAnimationFrame(drawLoop);
      };
      video.addEventListener('play', () => { setIsPlaying(true); rafRef.current = requestAnimationFrame(drawLoop); });
      video.addEventListener('pause', () => { setIsPlaying(false); cancelAnimationFrame(rafRef.current); });
      video.addEventListener('ended', () => setIsPlaying(false));
      video.addEventListener('seeked', drawSingleFrame);
      video.loop = loop;
      video.play().catch(() => {});
    }
    return () => { cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingVideoUrl]);


  const fmt = (s: number) => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';
  const seekPct = (duration > 0 && isFinite(duration)) ? Math.min(100, currentTime / duration * 100) : 0;

  return (
    <div className="vph">
      <video ref={videoRef} style={{ display: 'none' }} playsInline loop={loop} />

      {/* LEFT — transport + speed */}
      <div className="vph-left">
        <button className="vph-btn" onClick={isPlaying ? pause : play} title={isPlaying ? 'Pause' : 'Lecture'}>
          {isPlaying
            ? <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>
            : <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><polygon points="3,1 14,8 3,15"/></svg>
          }
        </button>
        {!isGifRef.current && (
          <button
            className={`vph-btn${loop ? ' vph-btn--on' : ''}`}
            onClick={() => { const l = !loop; setLoop(l); if (videoRef.current) videoRef.current.loop = l; }}
            title="Boucle"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4h10a4 4 0 0 1 0 8H5"/>
              <polyline points="3,2 1,4 3,6"/>
              <polyline points="5,10 7,12 5,14"/>
            </svg>
          </button>
        )}
        {!isGifRef.current && (
          <>
            <div className="vph-sep" />
            {([0.5, 1, 2] as const).map(s => (
              <button key={s}
                className={`vph-spd${speed === s ? ' vph-spd--on' : ''}`}
                onClick={() => setVideoSpeed(s)}
              >{s}×</button>
            ))}
          </>
        )}
      </div>

      {/* CENTER — timeline */}
      {!isGifRef.current && (
        <div className="vph-center">
          <span className="vph-t">{fmt(currentTime)}</span>
          <input
            type="range" className="vph-seek"
            min={0} max={duration > 0 ? duration : 1} step={0.033}
            value={duration > 0 ? Math.min(currentTime, duration) : 0}
            style={{ '--pct': `${seekPct}%` } as React.CSSProperties}
            onChange={e => seek(Number(e.target.value))}
          />
          <span className="vph-t">{fmt(duration)}</span>
        </div>
      )}
      {isGifRef.current && <div className="vph-center" />}

      {/* RIGHT — volume + actions */}
      <div className="vph-right">
        {!isGifRef.current && (
          <>
            <button
              className="vph-btn"
              onClick={() => { const v = volume > 0 ? 0 : 1; setVolume(v); if (videoRef.current) videoRef.current.volume = v; }}
              title={`Volume : ${Math.round(volume * 100)}%`}
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
                {volume === 0
                  ? <><path d="M9 3v10l-5-3.5H1V6.5h3L9 3z"/><line x1="11" y1="6" x2="15" y2="10" stroke="currentColor" strokeWidth="1.5"/><line x1="15" y1="6" x2="11" y2="10" stroke="currentColor" strokeWidth="1.5"/></>
                  : volume < 0.5
                  ? <><path d="M9 3v10l-5-3.5H1V6.5h3L9 3z"/><path d="M11.5 5.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>
                  : <><path d="M9 3v10l-5-3.5H1V6.5h3L9 3z"/><path d="M11.5 5.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M13 3.5a6 6 0 0 1 0 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>
                }
              </svg>
            </button>
            <input
              type="range" className="vph-vol"
              min={0} max={1} step={0.02}
              value={volume}
              style={{ '--pct': `${volume * 100}%` } as React.CSSProperties}
              onChange={e => { const v = Number(e.target.value); setVolume(v); if (videoRef.current) videoRef.current.volume = v; }}
            />
            <div className="vph-sep" />
            <button className="vph-export" onClick={() => setShowExport(true)}>
              <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2v8M4 7l4 4 4-4"/><path d="M2 13h12"/>
              </svg>
              Exporter
            </button>
          </>
        )}
        <div className="vph-sep" />
        <button className="vph-btn vph-btn--eject" onClick={eject} title="Éjecter">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
            <polygon points="8,2 14,9 2,9"/>
            <rect x="2" y="11" width="12" height="2.5" rx="1"/>
          </svg>
        </button>
      </div>

      {showExport && (
        <ExportModal
          videoRef={videoRef}
          isPlaying={isPlaying}
          isGif={isGifRef.current}
          processRef={processRef}
          onClose={() => setShowExport(false)}
          onPause={pause}
          onPlay={play}
        />
      )}
    </div>
  );
}
