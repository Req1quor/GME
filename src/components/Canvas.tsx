import { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '../context';
import { glRenderer } from '../gl/renderer';
import { DropZone } from './DropZone';
import { VideoPanel } from './VideoPanel';

export function Canvas() {
  const { resultImage, canvasSize, originalImage, isProcessing, effects, processingTime, gpuReady, gpuFrameCount, setDisplayCanvas, appMode } = useApp();
  const frameRef = useRef<HTMLDivElement>(null);
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // Callback ref: fires whenever the canvas element appears/disappears in the DOM.
  // A plain useEffect won't work because it runs once on component mount, but at that
  // point the component returns <DropZone /> so the canvas doesn't exist yet.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasCallbackRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    setDisplayCanvas(node);
  }, [setDisplayCanvas]);

  // B/A state
  const [baMode, setBaMode] = useState(false);
  const [baSplit, setBaSplit] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  // Sync skipBlit flag with baMode so processGPU doesn't overwrite B/A composite
  useEffect(() => {
    glRenderer.skipBlit = baMode;
    return () => { glRenderer.skipBlit = false; };
  }, [baMode]);

  // Zoom / pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Draw to canvas — GPU path: blit is done synchronously in the RAF loop (processGPU).
  //                  CPU path / B/A mode: putImageData here.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // In GPU mode without B/A, the blit is handled directly by processGPU.
    // Only handle the CPU / B/A fallback path here.
    const useGpu = appMode !== 'webcam' && gpuReady && glRenderer.ready && glRenderer.width > 0 && gpuFrameCount > 0;
    if (useGpu && !baMode) return;

    if (!baMode) {
      // Pure CPU mode (no GPU), just draw result
      if (!resultImage) return;
      canvas.width  = resultImage.width;
      canvas.height = resultImage.height;
      canvas.getContext('2d')!.putImageData(resultImage, 0, 0);
      return;
    }

    // B/A mode — get processed frame from GPU readback if available, else from state
    const processed = (useGpu && glRenderer.width > 0) ? glRenderer.readback() : resultImage;
    if (!processed || !originalImage) return;

    canvas.width  = processed.width;
    canvas.height = processed.height;
    const ctx = canvas.getContext('2d')!;
    const splitX = Math.round(processed.width * baSplit / 100);
    ctx.putImageData(processed, 0, 0);
    ctx.putImageData(originalImage, 0, 0, 0, 0, splitX, processed.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, processed.height);
    ctx.stroke();
  }, [resultImage, baMode, baSplit, originalImage, gpuReady, gpuFrameCount]);

  // B/A split drag
  const updateSplit = useCallback((e: React.PointerEvent<HTMLDivElement>) => {

    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    setBaSplit(Math.max(2, Math.min(98, (e.clientX - rect.left) / rect.width * 100)));
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom(z => Math.max(0.1, Math.min(8, z * factor)));
  }, []);

  // Pan: middle mouse or Alt+drag
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const isPanGesture = e.button === 1 || e.altKey;
    if (isPanGesture) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      return;
    }
    if (!baMode) return;
    setIsDragging(true);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    updateSplit(e);
  }, [baMode, pan.x, pan.y, updateSplit]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanning) {
      setPan({
        x: panStart.current.px + (e.clientX - panStart.current.x),
        y: panStart.current.py + (e.clientY - panStart.current.y),
      });
      return;
    }
    if (isDragging) updateSplit(e);
  }, [isPanning, isDragging, updateSplit]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setIsPanning(false);
  }, []);

  // Double-click to reset zoom/pan
  const handleDoubleClick = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  if (!originalImage && !canvasSize.width && appMode !== 'video') {
    return <DropZone />;
  }

  const { width, height } = canvasSize;
  const activeCount = effects.filter(e => e.enabled).length;

  return (
    <div
      ref={frameRef}
      className={`canvas-frame${baMode ? ' canvas-frame--ba' : ''}${isPanning ? ' canvas-frame--panning' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      style={{ overflow: 'hidden', cursor: isPanning ? 'grabbing' : baMode ? 'col-resize' : undefined }}
    >
      <div
        style={{
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
          transformOrigin: '50% 50%',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transition: isPanning ? 'none' : undefined,
        }}
      >
        <canvas
          ref={canvasCallbackRef}
          className="canvas-el"
          width={width}
          height={height}
        />
      </div>

      {isProcessing && (
        <div className="canvas-processing">
          <div className="canvas-processing-bar" />
        </div>
      )}

      {/* B/A handle overlay */}
      {baMode && (
        <div className="canvas-ba-handle" style={{ left: `${baSplit}%` }}>
          <div className="canvas-ba-label canvas-ba-label--l">AVANT</div>
          <div className="canvas-ba-knob">↔</div>
          <div className="canvas-ba-label canvas-ba-label--r">APRÈS</div>
        </div>
      )}

      {/* Bottom area: video player + info chips */}
      <div className="canvas-bottom">
        {appMode === 'video' && <VideoPanel />}
        {/* Info chips */}
        <div className="canvas-infobar">
        <span className="canvas-info-chip">{width} × {height}</span>
        {activeCount > 0 && (
          <span className="canvas-info-chip canvas-info-chip--accent">
            {activeCount} effet{activeCount > 1 ? 's' : ''}
          </span>
        )}
        {processingTime !== null && !isProcessing && (
          <span className="canvas-info-chip canvas-info-chip--dim">{processingTime} ms</span>
        )}
        {isProcessing && (
          <span className="canvas-info-chip canvas-info-chip--processing">traitement…</span>
        )}
        {zoom !== 1 && (
          <span
            className="canvas-info-chip canvas-info-chip--dim"
            style={{ cursor: 'pointer' }}
            onClick={handleDoubleClick}
            title="Double-clic pour réinitialiser le zoom"
          >
            {Math.round(zoom * 100)}%
          </span>
        )}
        <button
          className={`canvas-info-chip canvas-ba-toggle${baMode ? ' canvas-info-chip--accent' : ''}`}
          onClick={() => setBaMode(v => !v)}
          onPointerDown={e => e.stopPropagation()}
          title="Avant / Après"
        >
          B/A
        </button>
        </div>
      </div>
    </div>
  );
}

