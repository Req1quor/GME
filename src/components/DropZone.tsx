import { useCallback } from 'react';
import { useApp } from '../context';

export function DropZone() {
  const { setOriginalImage, processImage, setAppMode, setPendingVideoUrl, setPendingAudioFile } = useApp();

  const loadFile = useCallback((file: File) => {
    // Video or animated GIF → redirect to VideoPanel
    if (file.type.startsWith('video/') || file.type === 'image/gif') {
      const url = URL.createObjectURL(file);
      setAppMode('video');
      setPendingVideoUrl({ url, isGif: file.type === 'image/gif' });
      return;
    }

    // Audio → redirect to AudioVisualizer
    if (file.type.startsWith('audio/')) {
      setAppMode('audio');
      setPendingAudioFile(file);
      return;
    }

    // Static image
    const reader = new FileReader();
    reader.onload = e => {
      const url = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX = 2000;
        let w = img.width;
        let h = img.height;
        if (w > MAX || h > MAX) {
          const ratio = Math.min(MAX / w, MAX / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        setOriginalImage(data, w, h);
        processImage();
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  }, [setOriginalImage, processImage, setAppMode, setPendingVideoUrl, setPendingAudioFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }, [loadFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  return (
    <div
      className="drop-zone"
      onDrop={onDrop}
      onDragOver={e => e.preventDefault()}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        accept="image/*,video/*,audio/*"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />

      <div className="drop-zone-frame" />

      <svg className="drop-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>

      <div className="drop-zone-text">
        <span className="drop-zone-title">Drop a file</span>
        <span className="drop-zone-sub">image · vidéo · audio · GIF</span>
      </div>

      <div className="drop-zone-formats">
        {['PNG', 'JPG', 'GIF', 'MP4', 'WEBM', 'MP3', 'WAV'].map(f => (
          <span key={f} className="drop-zone-format">{f}</span>
        ))}
      </div>
    </div>
  );
}
