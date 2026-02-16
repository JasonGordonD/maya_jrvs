
import React from 'react';

interface RadarChartProps {
  data: {
    caution: number;
    formality: number;
    trust: number;
    depth: number;
  };
  size?: number;
}

export const RadarChart: React.FC<RadarChartProps> = ({ data, size = 200 }) => {
  const center = size / 2;
  const radius = (size / 2) * 0.8;

  const getPoint = (val: number, angle: number) => {
    const r = (val / 100) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  const angles = {
    caution: -Math.PI / 2,
    formality: 0,
    trust: Math.PI / 2,
    depth: Math.PI,
  };

  const points = [
    getPoint(data.caution, angles.caution),
    getPoint(data.formality, angles.formality),
    getPoint(data.trust, angles.trust),
    getPoint(data.depth, angles.depth),
  ];

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <div className="flex items-center justify-center p-4 bg-[var(--bg-panel)] rounded-none border border-[var(--border-subtle)]">
      <svg width={size} height={size} className="overflow-visible">
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <path
            key={scale}
            d={`
              M ${center} ${center - radius * scale}
              L ${center + radius * scale} ${center}
              L ${center} ${center + radius * scale}
              L ${center - radius * scale} ${center}
              Z
            `}
            fill="none"
            stroke="rgba(200, 164, 110, 0.12)"
            strokeWidth="1"
          />
        ))}

        <line x1={center} y1={center - radius} x2={center} y2={center + radius} stroke="rgba(200, 164, 110, 0.12)" strokeWidth="1" />
        <line x1={center - radius} y1={center} x2={center + radius} y2={center} stroke="rgba(200, 164, 110, 0.12)" strokeWidth="1" />

        <path
          d={pathData}
          fill="rgba(200, 164, 110, 0.16)"
          stroke="var(--accent-warm)"
          strokeWidth="1.5"
          className="transition-all duration-300 ease-out"
        />

        <text x={center} y={center - radius - 10} textAnchor="middle" className="text-[8px] maya-mono uppercase tracking-widest font-bold" style={{ fill: 'var(--text-secondary)' }}>CAUTION</text>
        <text x={center + radius + 10} y={center + 3} textAnchor="start" className="text-[8px] maya-mono uppercase tracking-widest font-bold" style={{ fill: 'var(--text-secondary)' }}>FORMALITY</text>
        <text x={center} y={center + radius + 15} textAnchor="middle" className="text-[8px] maya-mono uppercase tracking-widest font-bold" style={{ fill: 'var(--text-secondary)' }}>TRUST</text>
        <text x={center - radius - 10} y={center + 3} textAnchor="end" className="text-[8px] maya-mono uppercase tracking-widest font-bold" style={{ fill: 'var(--text-secondary)' }}>DEPTH</text>

        {points.map((p, i) => (
          <rect key={i} x={p.x - 2} y={p.y - 2} width="4" height="4" fill="var(--accent-warm)" className="transition-all duration-300 ease-out" />
        ))}
      </svg>
    </div>
  );
};
