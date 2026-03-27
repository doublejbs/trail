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
        <div className="absolute top-1 left-4 z-10 bg-black text-white rounded-lg px-2.5 py-1 text-[11px] font-semibold shadow-sm pointer-events-none">
          {activePoint.distanceKm.toFixed(1)} km · {Math.round(activePoint.elevationM)} m
        </div>
      )}
      <ResponsiveContainer width="100%" height={140}>
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
            tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.3)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip content={() => null} />
          <Area
            type="monotone"
            dataKey="elevationM"
            fill="black"
            fillOpacity={0.06}
            stroke="black"
            strokeOpacity={0.5}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          {activePoint && (
            <ReferenceLine
              x={activePoint.distanceKm}
              stroke="black"
              strokeWidth={1}
              strokeOpacity={0.4}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
