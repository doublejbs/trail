export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function parseGpxPoints(gpxText: string): { lat: number; lng: number }[] {
  if (!gpxText) return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxText, 'application/xml');
    if (doc.querySelector('parsererror')) return [];
    const trkpts = doc.querySelectorAll('trkpt');
    return Array.from(trkpts)
      .map((pt) => ({
        lat: parseFloat(pt.getAttribute('lat') ?? ''),
        lng: parseFloat(pt.getAttribute('lon') ?? ''),
      }))
      .filter((p) => !isNaN(p.lat) && !isNaN(p.lng));
  } catch {
    return [];
  }
}

export function totalRouteDistance(
  routePoints: { lat: number; lng: number }[]
): number {
  if (routePoints.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < routePoints.length - 1; i++) {
    total += haversineMeters(
      routePoints[i].lat, routePoints[i].lng,
      routePoints[i + 1].lat, routePoints[i + 1].lng,
    );
  }
  return total;
}

export function maxRouteProgress(
  trackingPoints: { lat: number; lng: number }[],
  routePoints: { lat: number; lng: number }[]
): number {
  if (trackingPoints.length === 0 || routePoints.length < 2) return 0;

  let maxProgress = 0;

  for (const P of trackingPoints) {
    let bestDist = Infinity;
    let bestSegIdx = 0;
    let bestT = 0;

    for (let i = 0; i < routePoints.length - 1; i++) {
      const A = routePoints[i];
      const B = routePoints[i + 1];
      const apLat = P.lat - A.lat;
      const apLng = P.lng - A.lng;
      const abLat = B.lat - A.lat;
      const abLng = B.lng - A.lng;
      const ab2 = abLat * abLat + abLng * abLng;
      const t = ab2 > 0 ? clamp((apLat * abLat + apLng * abLng) / ab2, 0, 1) : 0;
      const qLat = A.lat + t * abLat;
      const qLng = A.lng + t * abLng;
      const dist = haversineMeters(P.lat, P.lng, qLat, qLng);

      if (dist < bestDist) {
        bestDist = dist;
        bestSegIdx = i;
        bestT = t;
      }
    }

    let progress = 0;
    for (let k = 0; k < bestSegIdx; k++) {
      progress += haversineMeters(
        routePoints[k].lat, routePoints[k].lng,
        routePoints[k + 1].lat, routePoints[k + 1].lng
      );
    }
    const A = routePoints[bestSegIdx];
    const B = routePoints[bestSegIdx + 1];
    progress += bestT * haversineMeters(A.lat, A.lng, B.lat, B.lng);

    if (progress > maxProgress) maxProgress = progress;
  }

  return maxProgress;
}
