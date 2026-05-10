import { useState, useRef } from 'react';
import { useApp } from '../context';
import { ExportModal } from './ExportModal';

export function ExportBar() {
  const { resultImage, originalImage, canvasSize, setOriginalImage, processImage, appMode } = useApp();
  const [showModal, setShowModal] = useState(false);
  const noopRef = useRef((img: ImageData) => img);

  const reset = () => {
    if (!originalImage) return;
    setOriginalImage(originalImage, canvasSize.width, canvasSize.height);
    processImage();
  };

  if (!resultImage) return null;

  return (
    <div className="export-bar-wrap">
      <button className="export-main-btn" onClick={() => setShowModal(true)}>
        {'\u2193'} Exporter
      </button>
      {appMode === 'image' && (
        <button className="btn danger export-reset-btn" onClick={reset} title="R\u00e9initialiser">{'\u21ba'}</button>
      )}

      {showModal && (
        <ExportModal
          videoRef={{ current: null }}
          isPlaying={false}
          isGif={false}
          processRef={noopRef}
          onClose={() => setShowModal(false)}
          onPause={() => {}}
          onPlay={() => {}}
        />
      )}
    </div>
  );
}
