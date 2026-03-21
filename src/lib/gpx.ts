// src/lib/gpx.ts

export interface GpxCoord {
  lat: number;
  lon: number;
  ele: number | null;
}

/** Parse GPX XML string into an array of track-point coords.
 *  Returns null if XML is invalid or contains no trkpt elements. */
export function parseGpxCoords(gpxText: string): GpxCoord[] | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gpxText, 'application/xml');

  if (doc.querySelector('parsererror')) return null;

  const pts = Array.from(doc.getElementsByTagName('trkpt'));
  if (pts.length === 0) return null;

  const coords: GpxCoord[] = [];
  for (const pt of pts) {
    const lat = parseFloat(pt.getAttribute('lat') ?? '');
    const lon = parseFloat(pt.getAttribute('lon') ?? '');
    if (isNaN(lat) || isNaN(lon)) continue;
    const eleText = pt.querySelector('ele')?.textContent ?? null;
    const ele = eleText !== null && eleText !== '' ? parseFloat(eleText) : null;
    coords.push({ lat, lon, ele: ele !== null && isNaN(ele) ? null : ele });
  }

  return coords.length > 0 ? coords : null;
}

/** Haversine distance sum over all consecutive coord pairs, in metres. */
export function computeDistanceM(coords: GpxCoord[]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineM(coords[i - 1], coords[i]);
  }
  return Math.round(total);
}

function haversineM(a: GpxCoord, b: GpxCoord): number {
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Sum of all uphill elevation changes in metres.
 *  Returns null if no coords have elevation data. */
export function computeElevationGainM(coords: GpxCoord[]): number | null {
  const hasEle = coords.some((c) => c.ele !== null);
  if (!hasEle) return null;
  if (coords.length < 2) return 0;

  let gain = 0;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1].ele;
    const curr = coords[i].ele;
    if (prev !== null && curr !== null && curr > prev) {
      gain += curr - prev;
    }
  }
  return Math.round(gain);
}

/** Normalise lat/lon coords to SVG polyline points string within w×h viewport.
 *  Returns null for empty input.
 *  Returns centre dot for a single point. */
export function normaliseCoordsToSvgPoints(
  coords: GpxCoord[],
  w: number,
  h: number,
): string | null {
  if (coords.length === 0) return null;
  if (coords.length === 1) return `${w / 2},${h / 2}`;

  const lons = coords.map((c) => c.lon);
  const lats = coords.map((c) => c.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const dLon = maxLon - minLon;
  const dLat = maxLat - minLat;

  // Zero bounding box (all same point) → centre dot
  if (dLon === 0 && dLat === 0) return `${w / 2},${h / 2}`;

  // Preserve aspect ratio with 4px padding
  const pad = 4;
  const scaleX = dLon > 0 ? (w - pad * 2) / dLon : 1;
  const scaleY = dLat > 0 ? (h - pad * 2) / dLat : 1;
  const scale = Math.min(scaleX, scaleY);

  return coords
    .map((c) => {
      const x = pad + (c.lon - minLon) * scale;
      // SVG y is flipped relative to lat
      const y = h - pad - (c.lat - minLat) * scale;
      return `${Math.round(x)},${Math.round(y)}`;
    })
    .join(' ');
}

export interface ElevationPoint {
  distanceKm: number;
  elevationM: number;
}

export function buildElevationProfile(coords: GpxCoord[]): ElevationPoint[] | null {
  if (coords.length < 2) return null;
  if (!coords.some((c) => c.ele !== null)) return null;

  // Forward-fill from the last known elevation
  const eles: (number | null)[] = new Array(coords.length).fill(null);
  let lastKnown: number | null = null;

  for (let i = 0; i < coords.length; i++) {
    if (coords[i].ele !== null) {
      lastKnown = coords[i].ele as number;
    }
    eles[i] = lastKnown;
  }

  // Back-fill the leading nulls from the first known elevation
  const firstKnownIdx = coords.findIndex((c) => c.ele !== null);
  const backFillValue = coords[firstKnownIdx].ele as number;
  for (let i = 0; i < firstKnownIdx; i++) {
    eles[i] = backFillValue;
  }

  const result: ElevationPoint[] = [];
  let cumDistM = 0;

  for (let i = 0; i < coords.length; i++) {
    if (i > 0) {
      cumDistM += haversineM(coords[i - 1], coords[i]);
    }
    const distanceKm = Math.round((cumDistM / 1000) * 100) / 100;
    result.push({ distanceKm, elevationM: eles[i] as number });
  }

  return result;
}
