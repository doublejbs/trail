// src/lib/gpx.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseGpxCoords,
  computeDistanceM,
  computeElevationGainM,
  normaliseCoordsToSvgPoints,
  buildElevationProfile,
  type GpxCoord,
} from './gpx';

const ONE_POINT_GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="37.5" lon="127.0"><ele>10</ele></trkpt>
</trkseg></trk></gpx>`;

const TWO_POINT_GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="37.5" lon="127.0"><ele>10</ele></trkpt>
  <trkpt lat="37.501" lon="127.001"><ele>20</ele></trkpt>
</trkseg></trk></gpx>`;

const NO_ELE_GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="37.5" lon="127.0"></trkpt>
  <trkpt lat="37.501" lon="127.001"></trkpt>
</trkseg></trk></gpx>`;

const INVALID_GPX = `not xml at all`;

const THREE_POINT_GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="37.5" lon="127.0"><ele>120</ele></trkpt>
  <trkpt lat="37.501" lon="127.001"><ele>135</ele></trkpt>
  <trkpt lat="37.502" lon="127.002"><ele>148</ele></trkpt>
</trkseg></trk></gpx>`;

const MIXED_ELE_GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="37.5" lon="127.0"></trkpt>
  <trkpt lat="37.501" lon="127.001"><ele>50</ele></trkpt>
  <trkpt lat="37.502" lon="127.002"><ele>60</ele></trkpt>
</trkseg></trk></gpx>`;

describe('parseGpxCoords', () => {
  it('returns coords from valid GPX', () => {
    const coords = parseGpxCoords(TWO_POINT_GPX);
    expect(coords).toHaveLength(2);
    expect(coords[0]).toEqual({ lat: 37.5, lon: 127.0, ele: 10 });
    expect(coords[1]).toEqual({ lat: 37.501, lon: 127.001, ele: 20 });
  });

  it('returns null for invalid XML', () => {
    expect(parseGpxCoords(INVALID_GPX)).toBeNull();
  });

  it('returns null when no trkpt elements', () => {
    const empty = `<?xml version="1.0"?><gpx></gpx>`;
    expect(parseGpxCoords(empty)).toBeNull();
  });

  it('returns coords even when ele is missing (ele: null)', () => {
    const coords = parseGpxCoords(NO_ELE_GPX);
    expect(coords).not.toBeNull();
    expect(coords![0].ele).toBeNull();
  });
});

describe('computeDistanceM', () => {
  it('returns 0 for a single point', () => {
    const coords = parseGpxCoords(ONE_POINT_GPX)!;
    expect(computeDistanceM(coords)).toBe(0);
  });

  it('returns positive distance for two points', () => {
    const coords = parseGpxCoords(TWO_POINT_GPX)!;
    const dist = computeDistanceM(coords);
    expect(dist).toBeGreaterThan(0);
    // 37.5,127.0 → 37.501,127.001 is roughly 140 m
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(200);
  });
});

describe('computeElevationGainM', () => {
  it('returns null when no elevation data', () => {
    const coords = parseGpxCoords(NO_ELE_GPX)!;
    expect(computeElevationGainM(coords)).toBeNull();
  });

  it('returns 0 for single point', () => {
    const coords = parseGpxCoords(ONE_POINT_GPX)!;
    expect(computeElevationGainM(coords)).toBe(0);
  });

  it('counts only uphill segments', () => {
    const coords = [
      { lat: 0, lon: 0, ele: 10 },
      { lat: 0, lon: 0, ele: 20 }, // +10
      { lat: 0, lon: 0, ele: 15 }, // -5 (not counted)
      { lat: 0, lon: 0, ele: 25 }, // +10
    ];
    expect(computeElevationGainM(coords)).toBe(20);
  });
});

describe('normaliseCoordsToSvgPoints', () => {
  it('returns null for empty array', () => {
    expect(normaliseCoordsToSvgPoints([], 160, 100)).toBeNull();
  });

  it('returns a centre dot string for single point', () => {
    const result = normaliseCoordsToSvgPoints([{ lat: 37.5, lon: 127.0, ele: null }], 160, 100);
    expect(result).toBe('80,50');
  });

  it('normalises two extreme coords with padding applied', () => {
    // pad=4, dLon=1, dLat=1 → scale = min((160-8)/1, (100-8)/1) = min(152,92) = 92
    // coord(0,0): x=4, y=96  →  coord(1,1): x=96, y=4
    const coords = [
      { lat: 0, lon: 0, ele: null },
      { lat: 1, lon: 1, ele: null },
    ];
    const result = normaliseCoordsToSvgPoints(coords, 160, 100);
    expect(result).toBe('4,96 96,4');
  });
});

describe('buildElevationProfile', () => {
  it('returns null for 0 points', () => {
    expect(buildElevationProfile([])).toBeNull();
  });

  it('returns null for 1 point', () => {
    const coords = parseGpxCoords(ONE_POINT_GPX)!;
    expect(buildElevationProfile(coords)).toBeNull();
  });

  it('returns null when all ele values are null', () => {
    const coords = parseGpxCoords(NO_ELE_GPX)!;
    expect(buildElevationProfile(coords)).toBeNull();
  });

  it('returns array of ElevationPoints for normal 3-point GPX', () => {
    const coords = parseGpxCoords(THREE_POINT_GPX)!;
    const profile = buildElevationProfile(coords);
    expect(profile).not.toBeNull();
    expect(profile).toHaveLength(3);
    expect(profile![0].distanceKm).toBe(0);
    expect(profile![0].elevationM).toBe(120);
    expect(profile![1].distanceKm).toBeGreaterThan(0);
    expect(profile![2].distanceKm).toBeGreaterThan(profile![1].distanceKm);
    expect(profile![2].elevationM).toBe(148);
  });

  it('back-fills elevation when first point has ele=null', () => {
    const coords = parseGpxCoords(MIXED_ELE_GPX)!;
    const profile = buildElevationProfile(coords);
    expect(profile).not.toBeNull();
    // first point has no ele — back-filled from first non-null (50)
    expect(profile![0].elevationM).toBe(50);
    expect(profile![1].elevationM).toBe(50);
    expect(profile![2].elevationM).toBe(60);
  });

  it('forward-fills elevation when middle point has ele=null', () => {
    const coords: GpxCoord[] = [
      { lat: 37.5, lon: 127.0, ele: 100 },
      { lat: 37.501, lon: 127.001, ele: null },
      { lat: 37.502, lon: 127.002, ele: 200 },
    ];
    const profile = buildElevationProfile(coords);
    expect(profile).not.toBeNull();
    expect(profile![1].elevationM).toBe(100); // forward-filled
  });

  it('rounds distanceKm to 2 decimal places', () => {
    const coords = parseGpxCoords(THREE_POINT_GPX)!;
    const profile = buildElevationProfile(coords)!;
    for (const pt of profile) {
      const str = pt.distanceKm.toString();
      const decimals = str.includes('.') ? str.split('.')[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(2);
    }
  });
});
