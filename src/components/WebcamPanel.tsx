import { useRef, useState, useCallback, useEffect } from 'react';
import { useApp } from '../context';

interface VideoDevice {
  deviceId: string;
  label: string;
}

export function WebcamPanel() {
  const {
    processGPU, gpuReady, processRawFrame,
    setDirectResult, setDirectSource,
    setCanvasSizeOnly, setAppMode, getDisplayCanvas,
  } = useApp();

  const videoRef        = useRef<HTMLVideoElement>(null);
  const tempCanvas      = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const rafRef          = useRef<number>(0);
  const streamRef       = useRef<MediaStream | null>(null);
  const processGPURef   = useRef(processGPU);
  const processRef      = useRef(processRawFrame);
  const gpuReadyRef     = useRef(gpuReady);
  const lastFrameMs     = useRef(0);
  const frameIntervalMs = useRef(0);

  // Recording
  const recorderRef     = useRef<MediaRecorder | null>(null);
  const chunksRef       = useRef<BlobPart[]>([]);
  const recTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording,   setIsRecording]   = useState(false);
  const [recDuration,   setRecDuration]   = useState(0);

  const [devices,          setDevices]          = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isStreaming,      setIsStreaming]       = useState(false);
  const [resolution,       setResolution]        = useState<{ w: number; h: number } | null>(null);
  const [error,            setError]             = useState<string | null>(null);

  useEffect(() => { processGPURef.current = processGPU; },   [processGPU]);
  useEffect(() => { processRef.current    = processRawFrame; }, [processRawFrame]);
  useEffect(() => { gpuReadyRef.current   = gpuReady; },     [gpuReady]);

  const stopStream = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsStreaming(false);
    setResolution(null);
  }, []);

  const startStream = useCallback(async (deviceId?: string) => {
    stopStream();
    setError(null);
    try {
      const videoConstraints: MediaTrackConstraints = {
        width:     { ideal: 3840 },
        height:    { ideal: 2160 },
        frameRate: { ideal: 60 },
      };
      if (deviceId) videoConstraints.deviceId = { exact: deviceId };
      const constraints: MediaStreamConstraints = { video: videoConstraints, audio: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Get the actual deviceId assigned by the browser
      const actualId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? '';
      setSelectedDeviceId(actualId);

      // Enumerate devices now that we have permission (labels are available)
      const all = await navigator.mediaDevices.enumerateDevices();
      const videoDevs: VideoDevice[] = all
        .filter(d => d.kind === 'videoinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `CamÃ©ra ${i + 1}` }));
      setDevices(videoDevs);

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      // Wait for video dimensions
      await new Promise<void>(resolve => {
        if (video.videoWidth > 0) { resolve(); return; }
        video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      });

      const w = video.videoWidth;
      const h = video.videoHeight;
      setResolution({ w, h });
      setCanvasSizeOnly(w, h);
      setIsStreaming(true);

      // RAF draw loop â€” mirrors VideoPanel's approach exactly
      const drawLoop = () => {
        const now = performance.now();
        if (video.readyState >= 2 && (now - lastFrameMs.current) >= frameIntervalMs.current) {
          if (gpuReadyRef.current) {
            const t0 = performance.now();
            processGPURef.current(video);
            const elapsed = performance.now() - t0;
            frameIntervalMs.current = elapsed > 20 ? elapsed * 1.05 : 0;
            lastFrameMs.current = now;
          } else {
            const tc  = tempCanvas.current;
            const vw  = video.videoWidth;
            const vh  = video.videoHeight;
            if (tc.width !== vw || tc.height !== vh) { tc.width = vw; tc.height = vh; }
            const ctx = tc.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(video, 0, 0);
            const raw = ctx.getImageData(0, 0, vw, vh);
            const out = processRef.current(raw);
            setDirectResult(out);
            setDirectSource(raw, vw, vh);
            lastFrameMs.current = now;
          }
        }
        rafRef.current = requestAnimationFrame(drawLoop);
      };
      rafRef.current = requestAnimationFrame(drawLoop);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isPermission = /notallowed|permission denied/i.test(msg);
      setError(isPermission
        ? 'AccÃ¨s refusÃ© Ã  la camÃ©ra. VÃ©rifiez les permissions Electron.'
        : `Erreur : ${msg}`);
    }
  }, [stopStream, setCanvasSizeOnly, setDirectResult, setDirectSource]);

  // Auto-start with default camera on mount
  useEffect(() => {
    startStream();
    return () => stopStream();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eject = useCallback(() => {
    stopRecording();
    stopStream();
    setAppMode('image');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopStream, setAppMode]);

  const handleDeviceChange = useCallback((deviceId: string) => {
    startStream(deviceId);
  }, [startStream]);

  // â”€â”€â”€ Recording â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    if (recTimerRef.current !== null) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setIsRecording(false);
    setRecDuration(0);
  }, []);

  const startRecording = useCallback(() => {
    // Capture directly from the WebGL display canvas â€” includes all GPU effects
    const displayCanvas = getDisplayCanvas();
    if (!displayCanvas) return;

    const fps = resolution ? Math.min(60, 30) : 30;
    const captureStream = displayCanvas.captureStream(fps);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(captureStream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      const d    = new Date();
      const ts   = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
      a.download = `gme_webcam_${ts}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };
    recorder.start(100);
    recorderRef.current = recorder;
    setIsRecording(true);
    setRecDuration(0);
    recTimerRef.current = setInterval(() => setRecDuration(d => d + 1), 1000);
  }, [getDisplayCanvas, resolution]);

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  const fmtDuration = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="video-panel">
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />

      {error && (
        <div className="webcam-error">{error}</div>
      )}

      <div className="video-controls">
        {/* Device selector â€” only shown when multiple cameras are available */}
        {devices.length > 1 && (
          <div className="webcam-device-row">
            <select
              className="webcam-device-select"
              value={selectedDeviceId}
              onChange={e => handleDeviceChange(e.target.value)}
            >
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="video-ctrl-row">
          {/* Play / Pause */}
          <button
            className="video-btn"
            onClick={() => isStreaming ? stopStream() : startStream(selectedDeviceId)}
            title={isStreaming ? 'Suspendre' : 'Reprendre'}
          >
            {isStreaming
              ? <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>
              : <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><polygon points="3,1 14,8 3,15"/></svg>
            }
          </button>

          {/* Resolution badge */}
          {resolution && (
            <span className="webcam-resolution">{resolution.w}Ã—{resolution.h}</span>
          )}

          {/* Live indicator */}
          {isStreaming && !isRecording && (
            <span className="webcam-live-indicator">
              <span className="webcam-live-dot" />
              Live
            </span>
          )}

          {/* Recording indicator */}
          {isRecording && (
            <span className="webcam-rec-indicator">
              <span className="webcam-rec-dot" />
              REC {fmtDuration(recDuration)}
            </span>
          )}

          {/* Eject */}
          <button className="video-btn video-btn--eject" onClick={eject} title="Quitter le mode webcam">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <polygon points="8,2 14,9 2,9"/>
              <rect x="2" y="11" width="12" height="2.5" rx="1"/>
            </svg>
          </button>
        </div>

        {/* Record row */}
        {isStreaming && (
          <div className="webcam-record-row">
            <button
              className={`webcam-record-btn${isRecording ? ' webcam-record-btn--on' : ''}`}
              onClick={toggleRecording}
              title={isRecording ? 'ArrÃªter l\'enregistrement' : 'Enregistrer le flux avec effets (.webm)'}
            >
              {isRecording
                ? <>
                    <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="1"/></svg>
                    ArrÃªter
                  </>
                : <>
                    <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><circle cx="8" cy="8" r="6"/></svg>
                    Enregistrer
                  </>
              }
            </button>
            {isRecording && (
              <span className="webcam-record-hint">webm Â· vp9</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
