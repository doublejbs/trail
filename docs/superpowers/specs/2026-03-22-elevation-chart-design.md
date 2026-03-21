# Elevation Chart Design Spec
**Date:** 2026-03-22
**Status:** Draft

## Overview

Add an elevation profile graph to the CourseDetailPage. The graph shows distance (x-axis, km) vs elevation (y-axis, m) as a filled area chart with a drag cursor that displays exact values at the touched position.

---

## Data Model

No new database columns. Elevation data is already stored in the GPX file and partially summarised in `courses.elevation_gain_m`. The chart derives its data entirely from the GPX text already fetched by `CourseDetailPage`.

---

## New Utility: `buildElevationProfile`

**File:** `src/lib/gpx.ts` (add to existing file)

```typescript
export interface ElevationPoint {
  distanceKm: number;   // cumulative distance from start, rounded to 2 decimal places
  elevationM: number;   // elevation in metres
}

export function buildElevationProfile(coords: GpxCoord[]): ElevationPoint[] | null
```

### Behaviour

- Returns `null` if `coords` has fewer than 2 points.
- Returns `null` if no coord has a non-null `ele` value.
- For coords that have `ele === null`, forward-fills from the last known elevation. If the first coord has no elevation, back-fills from the first coord that does.
- Cumulative distance is computed using the existing `haversineM` helper (not re-exported — called internally).
- Distance values are rounded to 2 decimal places (`Math.round(d * 100) / 100`).

### Example output

```typescript
[
  { distanceKm: 0,    elevationM: 120 },
  { distanceKm: 0.15, elevationM: 135 },
  { distanceKm: 0.31, elevationM: 148 },
  ...
]
```

---

## New Component: `ElevationChart`

**File:** `src/components/ElevationChart.tsx`

```typescript
interface Props {
  gpxText: string;
}

export function ElevationChart({ gpxText }: Props): JSX.Element | null
```

### Behaviour

1. Calls `parseGpxCoords(gpxText)` then `buildElevationProfile(coords)`.
2. If result is `null` (no elevation data, parse error, or < 2 points): returns `null` — component renders nothing.
3. Otherwise renders a recharts `AreaChart` (160px tall, full width) with:
   - **Area**: `fill="#FF5722"` at 20% opacity, `stroke="#FF5722"` at 80% opacity, `strokeWidth={1.5}`
   - **XAxis**: distance in km, tick format `Xkm`, minimal ticks (recharts auto)
   - **YAxis**: hidden (values shown in cursor tooltip only)
   - **Tooltip**: hidden (replaced by custom cursor display)
   - **ReferenceLine** (vertical): shown at the active drag position
   - **Active cursor**: on `onMouseMove` / `onTouchMove`, display a floating label above the graph showing `X.X km · XXX m`; clear on `onMouseLeave` / `onTouchEnd`

### Cursor label

```
┌─────────────────┐
│ 2.3 km · 312 m  │   ← small pill above the graph, left-aligned to cursor x
└─────────────────┘
```

Implemented with a `useState` holding `{ distanceKm: number; elevationM: number } | null`. Updated by recharts `onMouseMove(data)` where `data.activePayload?.[0]?.payload` gives the `ElevationPoint`. Cleared on `onMouseLeave`.

For touch: use `onTouchMove` directly on `AreaChart` (recharts supports it as a prop alongside `onMouseMove`). Both callbacks receive the same `CategoricalChartState` object and provide `data.activePayload?.[0]?.payload`. Clear on `onMouseLeave` and `onTouchEnd`.

### No-data state

Component returns `null` — the caller (`CourseDetailPage`) simply omits the section. No placeholder or loading state needed.

---

## CourseDetailPage Integration

**File:** `src/pages/CourseDetailPage.tsx`

`ElevationChart` is inserted as a new `<div>` block immediately after the stats `<div>` block (which has `border-b border-neutral-100`) and before the like `<div>` block. It gets its own `border-b border-neutral-100` separator:

```
<div className="px-4 pt-4 pb-3 border-b border-neutral-100">  {/* stats */}
  ...
</div>

{typeof gpxText === 'string' && (
  <div className="border-b border-neutral-100">
    <ElevationChart gpxText={gpxText} />
  </div>
)}

<div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100">  {/* like */}
  ...
</div>
```

The `XAxis` uses `dataKey="distanceKm"` and `ReferenceLine` uses `<ReferenceLine x={activePoint.distanceKm} stroke="#FF5722" />` to correctly align the cursor with the distance axis.

No changes to `CourseDetailStore`.

---

## Dependencies

Add `recharts` to `package.json`:

```bash
npm install recharts
```

recharts ships its own TypeScript types.

---

## Files Changed

- `src/lib/gpx.ts` — add `ElevationPoint` interface + `buildElevationProfile()`
- `src/lib/gpx.test.ts` — add unit tests for `buildElevationProfile`
- `src/components/ElevationChart.tsx` — new component
- `src/components/ElevationChart.test.tsx` — new component tests
- `src/pages/CourseDetailPage.tsx` — insert `<ElevationChart>`

---

## Testing

### Unit: `buildElevationProfile` (in `gpx.test.ts`)

| Case | Expected |
|---|---|
| Normal: 3 points with ele data | Array of 3 ElevationPoints, distanceKm[0] = 0 |
| All ele null | `null` |
| 1 point | `null` |
| 0 points | `null` |
| Mixed: first point has ele=null | Back-filled from first non-null ele |
| Mixed: middle point has ele=null | Forward-filled from previous |

### Component: `ElevationChart` (in `ElevationChart.test.tsx`)

| Case | Expected |
|---|---|
| GPX with no elevation data | renders nothing (null) |
| GPX with valid elevation data | renders `<svg>` element (recharts output) |

---

## Error Handling

| Scenario | Handling |
|---|---|
| GPX parse fails | `parseGpxCoords` returns `null` → `buildElevationProfile` receives null → component renders null |
| No elevation in GPX | `buildElevationProfile` returns `null` → component renders null |
| `gpxText` is null (fetch failed) | Condition `typeof gpxText === 'string'` is false → `ElevationChart` not rendered |
| recharts render error | React error boundary (not added in v1) — natural failure |
