import React from 'react';
import { useApp } from '../context';

/**
 * SVG grid overlay rendered over the canvas area.
 * Positioned absolute, pointer-events: none.
 */
export function GridOverlay() {
  const { params, effects, canvasSize } = useApp();
  const p = params.brutalist;

  const enabled = effects.find(e => e.type === 'brutalist')?.enabled && p.grid;
  if (!enabled || !canvasSize.width) return null;

  const { width, height } = canvasSize;
  const s = p.gridSpacing;

  const lines: React.ReactNode[] = [];

  for (let x = 0; x <= width; x += s) {
    lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} />);
  }
  for (let y = 0; y <= height; y += s) {
    lines.push(<line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} />);
  }

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <g stroke="white" strokeWidth={0.5} opacity={p.gridOpacity}>
        {lines}
      </g>
    </svg>
  );
}
