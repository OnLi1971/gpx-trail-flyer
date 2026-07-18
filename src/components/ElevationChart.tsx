import React, { useMemo, useRef, useState, useEffect } from 'react';

interface ChartDataPoint {
  distance: number;
  elevation: number;
  originalElevation: number;
  originalIndex: number;
}

interface ElevationChartProps {
  chartData: ChartDataPoint[];
  currentChartPoint: ChartDataPoint | null;
  variant?: 'overlay' | 'panel';
  trailColor?: string;
  trailStyle?: 'solid' | 'dashed' | 'dotted';
  trailWidth?: number;
}

const VIEW_W = 1000;
const VIEW_H = 200;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 24;

export const ElevationChart = React.memo<ElevationChartProps>(({
  chartData,
  currentChartPoint,
  variant = 'overlay',
  trailStyle = 'solid',
  trailWidth = 3,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; pt: ChartDataPoint; slope: number } | null>(null);
  const [pathLen, setPathLen] = useState(0);

  const {
    minKm, maxKm, minEle, maxEle,
    linePath, fillPath, points, peakPoint, saddlePoints, slopeBands,
  } = useMemo(() => {
    if (chartData.length === 0) {
      return {
        minKm: 0, maxKm: 0, minEle: 0, maxEle: 0,
        linePath: '', fillPath: '', points: [] as { x: number; y: number; d: ChartDataPoint }[],
        peakPoint: null as { x: number; y: number; d: ChartDataPoint } | null,
        saddlePoints: [] as { x: number; y: number; d: ChartDataPoint }[],
        slopeBands: [] as { x1: number; x2: number; color: string }[],
      };
    }
    const minKm = chartData[0].distance;
    const maxKm = chartData[chartData.length - 1].distance;
    const eles = chartData.map(d => d.originalElevation);
    let minE = Math.min(...eles);
    let maxE = Math.max(...eles);
    const pad = Math.max(10, (maxE - minE) * 0.1);
    minE -= pad; maxE += pad;

    const chartW = VIEW_W - PAD_L - PAD_R;
    const chartH = VIEW_H - PAD_T - PAD_B;
    const xOf = (km: number) => PAD_L + ((km - minKm) / Math.max(0.0001, maxKm - minKm)) * chartW;
    const yOf = (e: number) => PAD_T + (1 - (e - minE) / Math.max(0.0001, maxE - minE)) * chartH;

    const pts = chartData.map(d => ({ x: xOf(d.distance), y: yOf(d.originalElevation), d }));

    // smooth path with cubic beziers
    const linePath = pts.reduce((acc, p, i) => {
      if (i === 0) return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
      const prev = pts[i - 1];
      const cx = (prev.x + p.x) / 2;
      return `${acc} Q ${prev.x.toFixed(2)} ${prev.y.toFixed(2)} ${cx.toFixed(2)} ${((prev.y + p.y) / 2).toFixed(2)} T ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    }, '');
    const baseY = PAD_T + chartH;
    const fillPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(2)} ${baseY} L ${pts[0].x.toFixed(2)} ${baseY} Z`;

    // Peak
    let peakIdx = 0;
    chartData.forEach((d, i) => { if (d.originalElevation > chartData[peakIdx].originalElevation) peakIdx = i; });
    const peakPoint = { x: pts[peakIdx].x, y: pts[peakIdx].y, d: chartData[peakIdx] };

    // Simple saddle detection: local minima at least 200m below neighbors within window
    const saddles: { x: number; y: number; d: ChartDataPoint }[] = [];
    const win = Math.max(5, Math.floor(chartData.length / 30));
    for (let i = win; i < chartData.length - win; i++) {
      const e = chartData[i].originalElevation;
      let leftMax = -Infinity, rightMax = -Infinity;
      for (let j = i - win; j < i; j++) leftMax = Math.max(leftMax, chartData[j].originalElevation);
      for (let j = i + 1; j <= i + win; j++) rightMax = Math.max(rightMax, chartData[j].originalElevation);
      if (leftMax - e > 40 && rightMax - e > 40) {
        if (!saddles.length || (chartData[i].distance - saddles[saddles.length - 1].d.distance) > (maxKm - minKm) / 10) {
          saddles.push({ x: pts[i].x, y: pts[i].y, d: chartData[i] });
        }
      }
    }

    // Slope bands - segment by slope %
    const bands: { x1: number; x2: number; color: string }[] = [];
    const colorFor = (slope: number) => {
      const s = Math.abs(slope);
      if (s < 5) return 'rgba(16,185,129,0.10)';
      if (s < 15) return 'rgba(245,158,11,0.10)';
      return 'rgba(239,68,68,0.12)';
    };
    let segStart = 0;
    let segColor = '';
    for (let i = 1; i < chartData.length; i++) {
      const dx = (chartData[i].distance - chartData[i - 1].distance) * 1000;
      const dy = chartData[i].originalElevation - chartData[i - 1].originalElevation;
      const slope = dx > 0 ? (dy / dx) * 100 : 0;
      const c = colorFor(slope);
      if (i === 1) { segColor = c; segStart = 0; continue; }
      if (c !== segColor) {
        bands.push({ x1: pts[segStart].x, x2: pts[i].x, color: segColor });
        segStart = i; segColor = c;
      }
    }
    bands.push({ x1: pts[segStart].x, x2: pts[pts.length - 1].x, color: segColor });

    return { minKm, maxKm, minEle: minE, maxEle: maxE, linePath, fillPath, points: pts, peakPoint, saddlePoints: saddles, slopeBands: bands };
  }, [chartData]);

  useEffect(() => {
    if (pathRef.current) {
      const len = pathRef.current.getTotalLength();
      setPathLen(len);
    }
  }, [linePath]);

  const currentXY = useMemo(() => {
    if (!currentChartPoint || points.length === 0) return null;
    const p = points.find(pt => pt.d.originalIndex === currentChartPoint.originalIndex);
    return p ?? null;
  }, [currentChartPoint, points]);

  const handleMove = (evt: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xNorm = (evt.clientX - rect.left) / rect.width;
    const svgX = xNorm * VIEW_W;
    // nearest point
    let best = points[0], bd = Infinity;
    for (const p of points) {
      const d = Math.abs(p.x - svgX);
      if (d < bd) { bd = d; best = p; }
    }
    const idx = points.indexOf(best);
    const prev = points[Math.max(0, idx - 1)];
    const next = points[Math.min(points.length - 1, idx + 1)];
    const dx = (next.d.distance - prev.d.distance) * 1000;
    const dy = next.d.originalElevation - prev.d.originalElevation;
    const slope = dx > 0 ? (dy / dx) * 100 : 0;
    setHover({ x: best.x, y: best.y, pt: best.d, slope });
  };

  if (chartData.length === 0) return null;

  const wrapperClass =
    variant === 'overlay'
      ? 'w-full h-32 rounded-xl shadow-lg overflow-hidden border border-emerald-500/20'
      : 'w-full h-32 overflow-hidden border-t border-emerald-500/20';

  const dash =
    trailStyle === 'dashed' ? '10 8' :
    trailStyle === 'dotted' ? '2 6' : undefined;

  return (
    <div
      className={wrapperClass}
      style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="w-full h-full block"
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="ele-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#059669" stopOpacity="0" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="ele-main" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
          <pattern id="topo" x="0" y="0" width="24" height="14" patternUnits="userSpaceOnUse">
            <path d="M0 10 Q 6 6 12 10 T 24 10" fill="none" stroke="#34d399" strokeOpacity="0.15" strokeWidth="0.6" />
            <path d="M0 4 Q 6 1 12 4 T 24 4" fill="none" stroke="#34d399" strokeOpacity="0.08" strokeWidth="0.6" />
          </pattern>
          <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="shadow-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>

        {/* Slope zone background bands */}
        {slopeBands.map((b, i) => (
          <rect key={i} x={b.x1} y={PAD_T} width={b.x2 - b.x1} height={VIEW_H - PAD_T - PAD_B} fill={b.color} />
        ))}

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((f, i) => (
          <line
            key={i}
            x1={PAD_L}
            x2={VIEW_W - PAD_R}
            y1={PAD_T + f * (VIEW_H - PAD_T - PAD_B)}
            y2={PAD_T + f * (VIEW_H - PAD_T - PAD_B)}
            stroke="#334155"
            strokeOpacity="0.4"
            strokeDasharray="2 4"
            strokeWidth="0.5"
          />
        ))}

        {/* Base emerald fill */}
        <path d={fillPath} fill="url(#ele-base)" />
        {/* Topographic texture */}
        <path d={fillPath} fill="url(#topo)" />
        {/* Main mint gradient fill */}
        <path d={fillPath} fill="url(#ele-main)" />

        {/* Shadow layer (offset duplicate) */}
        <path
          d={linePath}
          fill="none"
          stroke="#000"
          strokeOpacity="0.35"
          strokeWidth={trailWidth + 1}
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(0,6)"
          filter="url(#shadow-blur)"
        />

        {/* Neon edge with glow — animated draw */}
        <path
          ref={pathRef}
          d={linePath}
          fill="none"
          stroke="#34d399"
          strokeWidth={trailWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dash ?? (pathLen ? `${pathLen}` : undefined)}
          strokeDashoffset={dash ? 0 : pathLen}
          filter="url(#neon-glow)"
          style={{
            transition: dash ? undefined : 'stroke-dashoffset 1.5s ease-out',
          }}
        />
        {/* Crisp inner highlight */}
        <path
          d={linePath}
          fill="none"
          stroke="#6ee7b7"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dash}
          opacity="0.9"
        />

        {/* Saddle markers */}
        {saddlePoints.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={4} fill="#fbbf24" stroke="#1e293b" strokeWidth="1.5" />
        ))}

        {/* Peak marker */}
        {peakPoint && (
          <g>
            <circle cx={peakPoint.x} cy={peakPoint.y} r={5} fill="#ef4444" stroke="#1e293b" strokeWidth="1.5" />
            <text x={peakPoint.x} y={peakPoint.y - 9} textAnchor="middle" fontSize="10" fill="#fca5a5" fontWeight="700">
              ▲ {Math.round(peakPoint.d.originalElevation)}m
            </text>
          </g>
        )}

        {/* Y axis labels: start and peak */}
        <text x={PAD_L - 4} y={points[0].y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
          {Math.round(points[0].d.originalElevation)}m
        </text>
        <text x={PAD_L - 4} y={points[points.length - 1].y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
          {Math.round(points[points.length - 1].d.originalElevation)}m
        </text>

        {/* X axis - km ticks */}
        {(() => {
          const range = maxKm - minKm;
          const step = range > 80 ? 20 : range > 40 ? 10 : range > 15 ? 5 : range > 5 ? 2 : 1;
          const ticks: number[] = [];
          for (let k = Math.ceil(minKm / step) * step; k <= maxKm; k += step) ticks.push(k);
          return ticks.map((k, i) => {
            const x = PAD_L + ((k - minKm) / Math.max(0.0001, maxKm - minKm)) * (VIEW_W - PAD_L - PAD_R);
            return (
              <text key={i} x={x} y={VIEW_H - PAD_B + 12} textAnchor="middle" fontSize="9" fill="#64748b">
                {k}km
              </text>
            );
          });
        })()}

        {/* Current position pulsing dot */}
        {currentXY && (
          <g>
            <circle cx={currentXY.x} cy={currentXY.y} r={8} fill="#f87171" opacity="0.3">
              <animate attributeName="r" values="6;10;6" dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0.1;0.5" dur="1.4s" repeatCount="indefinite" />
            </circle>
            <circle cx={currentXY.x} cy={currentXY.y} r={4} fill="#ef4444" stroke="#fff" strokeWidth="1.5">
              <animateTransform attributeName="transform" type="scale" values="1;1.3;1" dur="1.4s" repeatCount="indefinite" additive="sum" />
            </circle>
          </g>
        )}

        {/* Hover tooltip */}
        {hover && (
          <g pointerEvents="none">
            <line x1={hover.x} x2={hover.x} y1={PAD_T} y2={VIEW_H - PAD_B} stroke="#94a3b8" strokeOpacity="0.4" strokeDasharray="2 3" />
            <circle cx={hover.x} cy={hover.y} r={3.5} fill="#fff" stroke="#34d399" strokeWidth="1.5" />
            {(() => {
              const tw = 92, th = 32;
              const tx = Math.min(VIEW_W - PAD_R - tw, Math.max(PAD_L, hover.x - tw / 2));
              const ty = Math.max(PAD_T, hover.y - th - 8);
              return (
                <g transform={`translate(${tx},${ty})`}>
                  <rect width={tw} height={th} rx={4} fill="#0f172a" stroke="#34d399" strokeOpacity="0.6" />
                  <text x={6} y={13} fontSize="10" fill="#e2e8f0" fontWeight="600">
                    {Math.round(hover.pt.originalElevation)} m · {hover.pt.distance.toFixed(1)} km
                  </text>
                  <text x={6} y={25} fontSize="9" fill={Math.abs(hover.slope) >= 15 ? '#f87171' : Math.abs(hover.slope) >= 5 ? '#fbbf24' : '#6ee7b7'}>
                    Sklon: {hover.slope.toFixed(1)}%
                  </text>
                </g>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
});

ElevationChart.displayName = 'ElevationChart';
