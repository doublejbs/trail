import { describe, it, expect } from 'vitest';
import { parseGpxPoints, maxRouteProgress } from './routeProjection';

const SIMPLE_GPX = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="37.5" lon="126.9"></trkpt>
    <trkpt lat="37.51" lon="126.9"></trkpt>
  </trkseg></trk>
</gpx>`;

describe('parseGpxPoints', () => {
  it('GPX 텍스트에서 위경도 배열 반환', () => {
    const result = parseGpxPoints(SIMPLE_GPX);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ lat: 37.5, lng: 126.9 });
    expect(result[1]).toEqual({ lat: 37.51, lng: 126.9 });
  });

  it('빈 문자열이면 빈 배열', () => {
    expect(parseGpxPoints('')).toEqual([]);
  });

  it('잘못된 XML이면 빈 배열', () => {
    expect(parseGpxPoints('not xml')).toEqual([]);
  });
});

describe('maxRouteProgress', () => {
  const routePoints = [
    { lat: 37.5, lng: 126.9 },
    { lat: 37.52, lng: 126.9 },
  ];

  it('trackingPoints 빈 배열이면 0 반환', () => {
    expect(maxRouteProgress([], routePoints)).toBe(0);
  });

  it('routePoints 1개 이하면 0 반환', () => {
    expect(maxRouteProgress([{ lat: 37.5, lng: 126.9 }], [])).toBe(0);
    expect(maxRouteProgress([{ lat: 37.5, lng: 126.9 }], [{ lat: 37.5, lng: 126.9 }])).toBe(0);
  });

  it('경로 중간 지점 — 진행도 > 0', () => {
    const track = [{ lat: 37.51, lng: 126.9 }]; // 경로 50% 지점
    const result = maxRouteProgress(track, routePoints);
    expect(result).toBeGreaterThan(0);
  });

  it('경로 끝 지점 — 최대 진행도', () => {
    const atEnd = [{ lat: 37.52, lng: 126.9 }];
    const atMid = [{ lat: 37.51, lng: 126.9 }];
    expect(maxRouteProgress(atEnd, routePoints)).toBeGreaterThan(
      maxRouteProgress(atMid, routePoints)
    );
  });

  it('여러 포인트 중 가장 앞선 진행도 반환', () => {
    const track = [
      { lat: 37.505, lng: 126.9 }, // ~25%
      { lat: 37.515, lng: 126.9 }, // ~75%
    ];
    const single = [{ lat: 37.505, lng: 126.9 }];
    expect(maxRouteProgress(track, routePoints)).toBeGreaterThan(
      maxRouteProgress(single, routePoints)
    );
  });

  it('경로에서 벗어난 포인트도 가장 가까운 세그먼트에 투영', () => {
    const offRoute = [{ lat: 37.51, lng: 127.0 }]; // lng가 크게 벗어남
    const result = maxRouteProgress(offRoute, routePoints);
    expect(result).toBeGreaterThan(0); // 여전히 진행도 반환
  });
});
