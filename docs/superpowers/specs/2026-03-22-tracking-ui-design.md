# Tracking UI Design

**Date:** 2026-03-22
**Scope:** Sub-project 1 of 3 — Tracking UI only (no persistence)

## Overview

Add an explicit start/stop tracking button to the group map page. When tracking is active, display a stats panel showing elapsed time, distance, and speed. Tracking data is managed in a new `TrackingStore`, separate from `MapStore`.

## Architecture

### TrackingStore (new — `src/stores/TrackingStore.ts`)

Owns all tracking state and logic.

**State:**
- `isTracking: boolean`
- `elapsedSeconds: number` — incremented by a 1-second interval timer
- `distanceMeters: number` — accumulated from GPS point deltas
- `speedKmh: number` — calculated from the last two GPS points
- `points: { lat: number; lng: number; ts: number }[]` — recorded during tracking (for future save support)

**Methods:**
- `start()` — resets all state (elapsedSeconds = 0, distanceMeters = 0, speedKmh = 0, points = []), sets `isTracking = true`, starts 1-second interval timer
- `stop()` — sets `isTracking = false`, clears interval timer; does NOT reset state (preserved for Sub-project 2 save flow)
- `addPoint(lat, lng)` — ignored when `isTracking === false`; appends `{ lat, lng, ts: Date.now() }`, updates distance and speed; on first point speed = 0 and distance += 0
- `dispose()` — clears interval timer if running; called from a dedicated `useEffect` cleanup in GroupMapPage

**Computed:**
- `formattedTime` — `"HH:MM:SS"` string from `elapsedSeconds`
- `formattedDistance` — `"Xm"` (integer, `Math.round`) when `distanceMeters < 1000`; `"X.Xkm"` (one decimal) when ≥ 1000
- `formattedSpeed` — `"X.Xkm/h"` string (one decimal)

### MapStore changes

`startWatchingLocation()` gains an optional callback parameter:

```typescript
startWatchingLocation(onLocationUpdate?: (lat: number, lng: number) => void): void
```

Inside the `watchPosition` success callback, after the `runInAction()` block that updates the location marker, call `onLocationUpdate?.(latitude, longitude)`. The callback is invoked **outside** the `runInAction` block to avoid calling a MobX action from within another reactive context unnecessarily.

Existing call sites (`mapStore.startWatchingLocation()`) continue to work unchanged — the parameter is optional.

### GroupMapPage changes

- Instantiates `TrackingStore` via `useState(() => new TrackingStore())`
- Changes Effect 2: pass `(lat, lng) => trackingStore.addPoint(lat, lng)` to `mapStore.startWatchingLocation(...)`
- Adds a **separate `useEffect`** (dependency: `[trackingStore]`) whose sole purpose is cleanup: `return () => trackingStore.dispose()`. This is separate from Effect 2 (which owns `mapStore.destroy()`) so the two cleanup responsibilities remain independent.
- Renders tracking UI overlay (see UI Layout)

## UI Layout

**Condition:** `trackingStore.isTracking` drives all rendering branches. `stop()` sets it to `false` — stats panel disappears and start button reappears immediately.

### Before tracking (and after stopping)

```
┌─────────────────────────────────────┐
│ [← 그룹명]               [⚙ 설정]  │
│                                     │
│           (지도)                    │
│                                     │
│  [코스로 돌아가기]       [내위치]   │  ← bottom-20
│                                     │
│          [ ● 시작 ]                 │  ← bottom-6
└─────────────────────────────────────┘
```

- 시작 버튼: pill shape, `bottom-6`, `left-1/2 -translate-x-1/2`, `z-10`
- 코스로 돌아가기 / 내위치: `bottom-20` (unchanged)

### While tracking (`isTracking === true`)

```
┌─────────────────────────────────────┐
│ [← 그룹명]               [⚙ 설정]  │
│                                     │
│           (지도)                    │
│                                     │
│  [코스로 돌아가기]       [내위치]   │  ← bottom-36 (raised to avoid panel overlap)
│ ┌─────────────────────────────────┐ │
│ │  00:12:34   1.2km   4.3km/h    │ │
│ │           [ ■ 중지 ]            │ │  ← bottom-6, ~120px tall
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

- Stats panel: `bg-white/90 rounded-2xl shadow-lg px-4 py-3`, `absolute bottom-6 left-4 right-4`, `z-10`
- Stats row: three equal columns — 시간 / 거리 / 속도 — each with a small `text-xs text-neutral-500` label below the value
- 중지 button: `w-full mt-2` inside the panel
- 코스로 돌아가기 / 내위치: `bottom-36` when `isTracking === true`

## Components / Files

| File | Change |
|------|--------|
| `src/stores/TrackingStore.ts` | New file |
| `src/stores/TrackingStore.test.ts` | New file — tests: start() resets state, stop() preserves state, addPoint() ignored when not tracking, addPoint() first point speed=0, formattedDistance unit switching, formattedTime formatting, dispose() clears timer |
| `src/stores/MapStore.ts` | Add optional `onLocationUpdate` param to `startWatchingLocation()`; call it after `runInAction` block |
| `src/stores/MapStore.test.ts` | Add two tests: (1) `onLocationUpdate` is called with `(latitude, longitude)` when watchPosition fires; (2) omitting the callback leaves existing behavior unchanged |
| `src/pages/GroupMapPage.tsx` | Instantiate TrackingStore, update startWatchingLocation call, add separate dispose useEffect, add tracking UI |
| `src/pages/GroupMapPage.test.tsx` | No breaking changes (existing `toHaveBeenCalledOnce()` still passes); no new callback-argument test required |

## Error Handling

- If `navigator.geolocation` is unavailable, `TrackingStore.addPoint()` is simply never called; stats show 0 values
- Timer is always cleared in `stop()` and `dispose()` to prevent leaks
- `speedKmh` on first `addPoint` call = 0 (no previous point to diff against)

## Out of Scope

- Saving tracking records to Supabase (Sub-project 2)
- Group leaderboard / history page (Sub-project 3)
- Pause/resume tracking
- Altitude display
- GPS noise / speed spike filtering
- `setInterval` timer drift compensation (acceptable for this use case)
