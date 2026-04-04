import { haversineMeters } from './routeProjection';

interface SnapResult {
  lat: number;
  lng: number;
  /** 시작점 기준 누적 거리 (m) — sort_order 값으로 사용 */
  distanceFromStart: number;
}

/**
 * 주어진 좌표를 가장 가까운 경로 세그먼트 위 점으로 투영한다.
 * routePoints가 2개 미만이면 null 반환.
 */
export function snapToRoute(
  lat: number,
  lng: number,
  routePoints: { lat: number; lng: number }[],
): SnapResult | null {
  if (routePoints.length < 2) return null;

  let bestDist = Infinity;
  let bestSegIdx = 0;
  let bestT = 0;

  for (let i = 0; i < routePoints.length - 1; i++) {
    const A = routePoints[i];
    const B = routePoints[i + 1];
    const apLat = lat - A.lat;
    const apLng = lng - A.lng;
    const abLat = B.lat - A.lat;
    const abLng = B.lng - A.lng;
    const ab2 = abLat * abLat + abLng * abLng;
    const t = ab2 > 0 ? Math.max(0, Math.min(1, (apLat * abLat + apLng * abLng) / ab2)) : 0;
    const qLat = A.lat + t * abLat;
    const qLng = A.lng + t * abLng;
    const dist = haversineMeters(lat, lng, qLat, qLng);

    if (dist < bestDist) {
      bestDist = dist;
      bestSegIdx = i;
      bestT = t;
    }
  }

  const A = routePoints[bestSegIdx];
  const B = routePoints[bestSegIdx + 1];
  const snappedLat = A.lat + bestT * (B.lat - A.lat);
  const snappedLng = A.lng + bestT * (B.lng - A.lng);

  // 시작점부터 투영점까지 누적 거리 계산
  let distanceFromStart = 0;
  for (let k = 0; k < bestSegIdx; k++) {
    distanceFromStart += haversineMeters(
      routePoints[k].lat, routePoints[k].lng,
      routePoints[k + 1].lat, routePoints[k + 1].lng,
    );
  }
  distanceFromStart += bestT * haversineMeters(A.lat, A.lng, B.lat, B.lng);

  return { lat: snappedLat, lng: snappedLng, distanceFromStart };
}
