# Tracking UI Design

**Date:** 2026-03-22
**Scope:** Sub-project 1 of 3 — Tracking UI only (no persistence)

## Overview

Add an explicit start/stop tracking button to the group map page. When tracking is active, display a stats panel showing elapsed time, distance, and speed. Tracking data is managed in a new `TrackingStore`, separate from `MapStore`.

## Architecture

### TrackingStore (new)

Owns all tracking state and logic.

**State:**
- `isTracking: boolean`
- `elapsedSeconds: number` — incremented by a 1-second interval timer
- `distanceMeters: number` — accumulated from GPS point deltas
- `speedKmh: number` — calculated from the last two GPS points
- `points: { lat: number; lng: number; ts: number }[]` — recorded during tracking (for future save support)

**Methods:**
- `start()` — sets `isTracking = true`, starts timer
- `stop()` — sets `isTracking = false`, clears timer
- `addPoint(lat, lng)` — called by MapStore's watchPosition callback; ignored when not tracking; appends point, updates distance and speed

**Computed:**
- `formattedTime` — `HH:MM:SS` string from `elapsedSeconds`
- `formattedDistance` — `0.0km` string
- `formattedSpeed` — `0.0km/h` string

### MapStore changes

- `startWatchingLocation()` still called automatically on map init (for location marker display)
- watchPosition callback calls `trackingStore.addPoint(lat, lng)` if `trackingStore` is injected
- `MapStore` accepts an optional `onLocationUpdate?: (lat: number, lng: number) => void` callback to avoid a hard dependency on `TrackingStore`

### GroupMapPage changes

- Instantiates `TrackingStore` alongside `MapStore`
- Passes `trackingStore.addPoint` as the `onLocationUpdate` callback to `MapStore`
- Renders tracking UI overlay

## UI Layout

### Before tracking starts

```
┌─────────────────────────────────────┐
│ [← 그룹명]               [⚙ 설정]  │
│                                     │
│           (지도)                    │
│                                     │
│  [코스로 돌아가기]       [내위치]   │
│                                     │
│          [ ● 시작 ]                 │
└─────────────────────────────────────┘
```

- 시작 버튼: pill shape, bottom center, `bottom-6`

### While tracking

```
┌─────────────────────────────────────┐
│ [← 그룹명]               [⚙ 설정]  │
│                                     │
│           (지도)                    │
│                                     │
│  [코스로 돌아가기]       [내위치]   │
│ ┌─────────────────────────────────┐ │
│ │  00:12:34   1.2km   4.3km/h    │ │
│ │           [ ■ 중지 ]            │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

- Stats panel: white/90 rounded-2xl card, `bottom-6` center, `z-10`
- Stats row: three equally-spaced values with small labels below each
- 중지 button: inside the panel, below the stats row

## Components / Files

| File | Change |
|------|--------|
| `src/stores/TrackingStore.ts` | New file |
| `src/stores/MapStore.ts` | Add `onLocationUpdate` callback parameter to `startWatchingLocation()` |
| `src/pages/GroupMapPage.tsx` | Instantiate `TrackingStore`, wire callback, add tracking UI |

## Error Handling

- If `navigator.geolocation` is unavailable, `TrackingStore` still works (distance stays 0, speed stays 0)
- Timer is cleared in `stop()` and also on store disposal to prevent leaks

## Out of Scope

- Saving tracking records to Supabase (Sub-project 2)
- Group leaderboard / history page (Sub-project 3)
- Pause/resume tracking
- Altitude display
