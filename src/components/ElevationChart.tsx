import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { MouseHandlerDataParam } from 'recharts';
import { parseGpxCoords, buildElevationProfile } from '../lib/gpx';

interface Props {
  gpxText: string;
}

export function ElevationChart({ gpxText }: Props) {
  const [activePoint, setActivePoint] = useState<{
    distanceKm: number;
    elevationM: number;
  } | null>(null);

  const coords = parseGpxCoords(gpxText);
  const profile = coords ? buildElevationProfile(coords) : null;

  if (!profile) return null;

  const handleMove = (data: MouseHandlerDataParam) => {
    const idx = data?.activeTooltipIndex;
    if (idx != null && typeof idx === 'number' && profile[idx]) {
      setActivePoint({ distanceKm: profile[idx].distanceKm, elevationM: profile[idx].elevationM });
    }
  };

  const handleLeave = () => setActivePoint(null);

  return (
    <div className="px-4 pt-3 pb-2 relative">
      {activePoint && (
        <div className="absolute top-1 left-4 z-10 bg-white border border-neutral-200 rounded-full px-2 py-0.5 text-xs text-neutral-700 shadow-sm pointer-events-none">
          {activePoint.distanceKm.toFixed(1)} km · {Math.round(activePoint.elevationM)} m
        </div>
      )}
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart
          data={profile}
          margin={{ top: 16, right: 0, left: 0, bottom: 0 }}
          onMouseMove={handleMove}
          onTouchMove={handleMove}
          onMouseLeave={handleLeave}
          onTouchEnd={handleLeave}
        >
          <XAxis
            dataKey="distanceKm"
            tickFormatter={(v: number) => `${v}km`}
            tick={{ fontSize: 10, fill: '#a3a3a3' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip content={() => null} />
          <Area
            type="monotone"
            dataKey="elevationM"
            fill="#FF5722"
            fillOpacity={0.2}
            stroke="#FF5722"
            strokeOpacity={0.8}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          {activePoint && (
            <ReferenceLine
              x={activePoint.distanceKm}
              stroke="#FF5722"
              strokeWidth={1}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
