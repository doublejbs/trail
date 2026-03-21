# Elevation Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an elevation profile graph to CourseDetailPage showing distance (km) vs elevation (m) as a filled area chart with a drag cursor that displays exact values at the touched position.

**Architecture:** Add `buildElevationProfile()` to the existing `gpx.ts` utility file, create a new `ElevationChart` component using recharts `AreaChart`, and insert it between the stats block and like block in `CourseDetailPage`. The component receives the raw GPX text string already available in the page and derives all data itself.

**Tech Stack:** recharts (new dependency), existing gpx.ts utilities (`parseGpxCoords`, `haversineM`), React `useState` for cursor state, recharts `onMouseMove`/`onTouchMove`/`onMouseLeave`/`onTouchEnd` events.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/lib/gpx.ts` | Add `ElevationPoint` interface + `buildElevationProfile()` |
| Modify | `src/lib/gpx.test.ts` | Add unit tests for `buildElevationProfile` |
| Create | `src/components/ElevationChart.tsx` | New recharts-based component |
| Create | `src/components/ElevationChart.test.tsx` | Component smoke tests |
| Modify | `src/pages/CourseDetailPage.tsx` | Insert `<ElevationChart>` between stats and like blocks |

---

## Task 1: `buildElevationProfile` utility

**Files:**
- Modify: `src/lib/gpx.ts`
- Modify: `src/lib/gpx.test.ts`

### Context

`src/lib/gpx.ts` already exports `GpxCoord`, `parseGpxCoords`, `computeDistanceM`, `computeElevationGainM`, `normaliseCoordsToSvgPoints`. The internal `haversineM` function is NOT exported — call it internally from `buildElevationProfile`. The existing test file is at `src/lib/gpx.test.ts`.

Run tests with:
```bash
npx vitest run src/lib/gpx.test.ts
```

---

- [ ] **Step 1: Write failing tests**

Add to `src/lib/gpx.test.ts` (after the existing imports block — also add `buildElevationProfile` to the import list):

```typescript
import {
  parseGpxCoords,
  computeDistanceM,
  computeElevationGainM,
  normaliseCoordsToSvgPoints,
  buildElevationProfile,
} from './gpx';
```

Add this GPX fixture near the top with the other fixtures:

```typescript
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
```

Add a new `describe` block at the bottom of `src/lib/gpx.test.ts`:

```typescript
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
```

Also add `GpxCoord` to the import (needed for the inline coord test):

```typescript
import {
  parseGpxCoords,
  computeDistanceM,
  computeElevationGainM,
  normaliseCoordsToSvgPoints,
  buildElevationProfile,
  type GpxCoord,
} from './gpx';
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/gpx.test.ts
```

Expected: FAIL — `buildElevationProfile is not a function` (or similar import error)

- [ ] **Step 3: Implement `buildElevationProfile` in `src/lib/gpx.ts`**

Add after the existing exports (before the `normaliseCoordsToSvgPoints` function is fine, or at the end of file):

```typescript
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/gpx.test.ts
```

Expected: All tests PASS (including pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add src/lib/gpx.ts src/lib/gpx.test.ts
git commit -m "feat: add buildElevationProfile utility to gpx.ts"
```

---

## Task 2: `ElevationChart` component

**Files:**
- Create: `src/components/ElevationChart.tsx`
- Create: `src/components/ElevationChart.test.tsx`

### Context

Install recharts first (it ships its own TypeScript types — no `@types/recharts` needed):

```bash
npm install recharts
```

The component receives a `gpxText: string` prop. It calls `parseGpxCoords` then `buildElevationProfile`. If either returns null, it returns null (renders nothing). Otherwise it renders a recharts `AreaChart` (160px tall, full width).

recharts imports needed:
```typescript
import { AreaChart, Area, XAxis, ReferenceLine, ResponsiveContainer } from 'recharts';
```

The drag cursor state:
```typescript
const [activePoint, setActivePoint] = useState<{ distanceKm: number; elevationM: number } | null>(null);
```

recharts event type: `import type { CategoricalChartState } from 'recharts/types/chart/generateCategoricalChart';`

For tests, recharts renders SVG in jsdom. The test just needs to confirm an `<svg>` is present for valid data and nothing is rendered for invalid data.

Run tests with:
```bash
npx vitest run src/components/ElevationChart.test.tsx
```

---

- [ ] **Step 1: Write failing tests**

Create `src/components/ElevationChart.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ElevationChart } from './ElevationChart';

// recharts uses ResizeObserver — stub it for jsdom
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

const GPX_WITH_ELEVATION = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="37.5" lon="127.0"><ele>120</ele></trkpt>
  <trkpt lat="37.501" lon="127.001"><ele>135</ele></trkpt>
  <trkpt lat="37.502" lon="127.002"><ele>148</ele></trkpt>
</trkseg></trk></gpx>`;

const GPX_NO_ELEVATION = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="37.5" lon="127.0"></trkpt>
  <trkpt lat="37.501" lon="127.001"></trkpt>
</trkseg></trk></gpx>`;

describe('ElevationChart', () => {
  it('renders svg when GPX has valid elevation data', () => {
    const { container } = render(<ElevationChart gpxText={GPX_WITH_ELEVATION} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders nothing when GPX has no elevation data', () => {
    const { container } = render(<ElevationChart gpxText={GPX_NO_ELEVATION} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for invalid GPX', () => {
    const { container } = render(<ElevationChart gpxText="not xml" />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Install recharts**

```bash
npm install recharts
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx vitest run src/components/ElevationChart.test.tsx
```

Expected: FAIL — `ElevationChart` module does not exist yet

- [ ] **Step 4: Implement `ElevationChart` component**

Create `src/components/ElevationChart.tsx`:

```typescript
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
import type { CategoricalChartState } from 'recharts/types/chart/generateCategoricalChart';
import { parseGpxCoords, buildElevationProfile } from '../lib/gpx';

interface Props {
  gpxText: string;
}

export function ElevationChart({ gpxText }: Props): JSX.Element | null {
  const [activePoint, setActivePoint] = useState<{
    distanceKm: number;
    elevationM: number;
  } | null>(null);

  const coords = parseGpxCoords(gpxText);
  const profile = coords ? buildElevationProfile(coords) : null;

  if (!profile) return null;

  const handleMove = (data: CategoricalChartState) => {
    const payload = data?.activePayload?.[0]?.payload;
    if (payload) {
      setActivePoint({ distanceKm: payload.distanceKm, elevationM: payload.elevationM });
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
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run src/components/ElevationChart.test.tsx
```

Expected: All 3 tests PASS

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
npm run test:run
```

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/components/ElevationChart.tsx src/components/ElevationChart.test.tsx package.json package-lock.json
git commit -m "feat: add ElevationChart component using recharts"
```

---

## Task 3: Wire `ElevationChart` into `CourseDetailPage`

**Files:**
- Modify: `src/pages/CourseDetailPage.tsx`

### Context

`CourseDetailPage` is at `src/pages/CourseDetailPage.tsx`. It already fetches `gpxText` (type `string | null | undefined`) via a `useEffect`. The stats block ends at line 136 and the like block starts at line 139. The spec says to insert `ElevationChart` between these two blocks, wrapped in a `border-b border-neutral-100` div, only when `typeof gpxText === 'string'`.

Current structure in the scrollable section:

```tsx
{/* Title + stats */}
<div className="px-4 pt-4 pb-3 border-b border-neutral-100">
  ...
</div>

{/* Like */}
<div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100">
  ...
</div>
```

After the change it should be:

```tsx
{/* Title + stats */}
<div className="px-4 pt-4 pb-3 border-b border-neutral-100">
  ...
</div>

{/* Elevation chart */}
{typeof gpxText === 'string' && (
  <div className="border-b border-neutral-100">
    <ElevationChart gpxText={gpxText} />
  </div>
)}

{/* Like */}
<div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100">
  ...
</div>
```

There are no existing tests for `CourseDetailPage` that will be broken by this change (the page test file, if any, mocks supabase). The component itself is already tested.

---

- [ ] **Step 1: Add the import**

In `src/pages/CourseDetailPage.tsx`, add `ElevationChart` to the imports:

```typescript
import { ElevationChart } from '../components/ElevationChart';
```

- [ ] **Step 2: Insert the elevation chart block**

In `src/pages/CourseDetailPage.tsx`, find the comment `{/* Like */}` and insert the chart block immediately before it. The exact string to find and replace:

Find:
```tsx
        {/* Like */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100">
```

Replace with:
```tsx
        {typeof gpxText === 'string' && (
          <div className="border-b border-neutral-100">
            <ElevationChart gpxText={gpxText} />
          </div>
        )}

        {/* Like */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100">
```

- [ ] **Step 3: Run full test suite**

```bash
npm run test:run
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/pages/CourseDetailPage.tsx
git commit -m "feat: integrate ElevationChart into CourseDetailPage"
```
