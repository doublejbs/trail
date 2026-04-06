import { useMemo, useCallback, useRef } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from 'recharts';
import type { MouseHandlerDataParam } from 'recharts';
import { parseGpxCoords, buildElevationProfile } from '../lib/gpx';

interface Props {
  gpxText: string;
  onActiveCoord?: (coord: { lat: number; lon: number } | null) => void;
  currentDistanceKm?: number;
}

export const ElevationChart = ({ gpxText, onActiveCoord, currentDistanceKm }: Props) => {
  // DOM refs — 드래그 중 React state 업데이트 없이 직접 조작
  const lineRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  const profile = useMemo(() => {
    const coords = parseGpxCoords(gpxText);
    return coords ? buildElevationProfile(coords) : null;
  }, [gpxText]);

  const currentPoint = useMemo(() =>
    currentDistanceKm != null && profile
      ? profile.reduce((prev, curr) =>
          Math.abs(curr.distanceKm - currentDistanceKm) < Math.abs(prev.distanceKm - currentDistanceKm) ? curr : prev
        )
      : null,
  [profile, currentDistanceKm]);

  const handleMove = useCallback((data: MouseHandlerDataParam) => {
    const raw = data as unknown as Record<string, unknown>;
    const coord = raw?.activeCoordinate as { x?: number } | undefined;
    const label = raw?.activeLabel;
    const distKm = Number(label);
    if (!profile || isNaN(distKm) || coord?.x == null) return;

    // binary search
    let lo = 0, hi = profile.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (profile[mid].distanceKm < distKm) lo = mid + 1;
      else hi = mid;
    }
    const pt = (lo > 0 && Math.abs(profile[lo - 1].distanceKm - distKm) < Math.abs(profile[lo].distanceKm - distKm))
      ? profile[lo - 1] : profile[lo];

    // DOM 직접 조작 — React 리렌더 없음
    if (lineRef.current) {
      lineRef.current.style.left = `${coord.x}px`;
      lineRef.current.style.display = 'block';
    }
    if (labelRef.current) {
      labelRef.current.textContent = `${pt.distanceKm.toFixed(1)} km · ${Math.round(pt.elevationM)} m`;
      labelRef.current.style.display = 'block';
    }

    if (pt.lat != null && pt.lon != null) {
      onActiveCoord?.({ lat: pt.lat, lon: pt.lon });
    }
  }, [profile, onActiveCoord]);

  const handleLeave = useCallback(() => {
    if (lineRef.current) lineRef.current.style.display = 'none';
    if (labelRef.current) labelRef.current.style.display = 'none';
    onActiveCoord?.(null);
  }, [onActiveCoord]);

  if (!profile) return null;

  return (
    <div className="px-4 pt-3 pb-2 relative">
      {/* 드래그 라벨 — DOM 직접 업데이트 */}
      <div
        ref={labelRef}
        style={{ display: 'none' }}
        className="absolute top-1 left-4 z-10 bg-black text-white rounded-lg px-2.5 py-1 text-[11px] font-semibold shadow-sm pointer-events-none"
      />
      {currentPoint && (
        <div className="absolute top-1 left-4 z-10 bg-red-500 text-white rounded-lg px-2.5 py-1 text-[11px] font-semibold shadow-sm pointer-events-none">
          내 위치 · {currentPoint.distanceKm.toFixed(1)} km · {Math.round(currentPoint.elevationM)} m
        </div>
      )}
      <div className="relative">
        {/* 드래그 세로선 — DOM 직접 업데이트 */}
        <div
          ref={lineRef}
          style={{ display: 'none', top: 16, bottom: 20 }}
          className="absolute w-px bg-black/40 pointer-events-none z-10"
        />
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
            {currentPoint && (
              <>
                <ReferenceLine
                  x={currentPoint.distanceKm}
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                />
                <ReferenceDot
                  x={currentPoint.distanceKm}
                  y={currentPoint.elevationM}
                  r={5}
                  fill="#ef4444"
                  stroke="white"
                  strokeWidth={2}
                />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
