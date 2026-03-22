# Tracking Pause Design

**Date:** 2026-03-22
**Scope:** 트래킹 일시정지/재개 기능 — 중지 버튼을 일시정지로 교체

## Overview

현재 트래킹 중 "■ 중지" 버튼은 즉시 세션을 종료하고 저장한다. 이를 일시정지/재개 흐름으로 변경한다. 일시정지 중에는 타이머와 GPS 포인트 수집이 멈추며, 재개하면 이어서 계속된다. 완전히 종료하려면 일시정지 상태에서 "■ 종료" 버튼을 누른다. "■ 종료"는 일시정지 전까지 누적된 모든 데이터(elapsedSeconds, distanceMeters, points)를 저장한다.

## Architecture

### 상태 전이

```
idle
  → start()  → tracking
                → pause()  → paused
                              → resume() → tracking
                              → stop()   → saving → idle
```

`isTracking === true` 상태에서 `start()` 재호출은 무시 (일시정지 중 포함).

### TrackingStore 변경

**새 필드:**
```typescript
public isPaused: boolean = false;
```

**내부 헬퍼 메서드 추출:**

`start()`와 `resume()`에서 공유하는 타이머 시작 로직을 `_startTimer()` private 메서드로 추출:
```typescript
private _startTimer(): void {
  this._clearTimer();
  this.timerId = setInterval(() => {
    runInAction(() => { this.elapsedSeconds += 1; });
    if (this._channel && this._userId) {
      void this._channel.send({ type: 'broadcast', event: 'progress', payload: { ... } });
    }
  }, 1000);
}
```

**기존 메서드 변경:**

- `start()`:
  - `if (this.isTracking) return;` early return 추가 (isPaused 포함 모든 tracking 상태 무시).
  - 초기화 로직에 `this.isPaused = false;` 추가.
  - 기존 `setInterval` 인라인 코드 → `this._startTimer()` 호출로 교체.

- `stop()`: 변경 없음 — 타이머 정지, `isTracking = false`, `isPaused = false`(초기화), 저장.
  - 단, `runInAction` 블록에 `this.isPaused = false` 추가.

- `addPoint()`: 기존 `if (!this.isTracking) return;` 뒤에 `if (this.isPaused) return;` 추가.

- `dispose()`: 변경 없음 — 기존 그대로.

**새 메서드:**

- `pause()`:
  ```
  if (!this.isTracking || this.isPaused) return;
  this._clearTimer();
  runInAction(() => { this.isPaused = true; });
  // 채널은 유지 (재개 시 재사용), setInterval 정지로 broadcast 자동 중단
  ```

- `resume()`:
  ```
  if (!this.isTracking || !this.isPaused) return;
  runInAction(() => { this.isPaused = false; });
  this._startTimer();
  ```

### GroupMapPage UI 변경

트래킹 중 통계 패널 하단 버튼 영역을 상태에 따라 분기:

| TrackingStore 상태 | 버튼 | 스타일 |
|---|---|---|
| `isTracking && !isPaused && !saving` | `⏸ 일시정지` | `w-full py-2 rounded-xl text-sm font-semibold bg-neutral-400 text-white` |
| `isTracking && isPaused` | `▶ 재개` + `■ 종료` (flex row, gap-2, 각 flex-1) | 재개: `bg-black text-white`, 종료: `bg-red-500 text-white` |
| `saving` | "저장 중..." 비활성 버튼 (기존) | 변경 없음 |

`mockTrackingStore`에 `isPaused: false`, `pause: vi.fn()`, `resume: vi.fn()` 추가 필요.

**bottomOffset:** 기존과 동일 — `isTracking || saving`일 때 `bottom-36`.

## Files

- **Modify:** `src/stores/TrackingStore.ts`
  - `isPaused: boolean = false` 필드 추가
  - `_startTimer()` private 헬퍼 추출
  - `start()`: early return + `_startTimer()` 사용
  - `stop()`: `isPaused = false` 초기화 추가
  - `pause()`, `resume()` 메서드 추가
  - `addPoint()`: `isPaused` 체크 추가

- **Modify:** `src/stores/TrackingStore.test.ts`
  - `pause()` / `resume()` 테스트 추가

- **Modify:** `src/pages/GroupMapPage.tsx`
  - 버튼 영역 UI 분기

- **Modify:** `src/pages/GroupMapPage.test.tsx`
  - `mockTrackingStore`에 `isPaused`, `pause`, `resume` 추가
  - 일시정지/재개/종료 버튼 렌더링 및 클릭 테스트 추가

## Testing

**TrackingStore:**
- `pause()` 호출 시 `isPaused = true`, 타이머 정지 (이후 elapsed 증가 안 함)
- `pause()` 중복 호출 시 무시 (early return)
- `resume()` 호출 시 `isPaused = false`, 타이머 재시작 (elapsed 다시 증가)
- `resume()` 중복 호출 시 무시 (early return)
- 일시정지 중 `addPoint()` 호출 시 포인트 무시 (points 배열 길이 불변)
- 재개 후 `addPoint()` 정상 추가
- `start()` — `isTracking === true` 상태(일시정지 포함)에서 재호출 시 무시
- 일시정지 중 `stop()` 호출 시 정상 저장 (누적 elapsed > 0이면 insert 호출)

**GroupMapPage:**
- 트래킹 중(`isTracking=true, isPaused=false`): "⏸ 일시정지" 버튼 표시
- 일시정지 중(`isTracking=true, isPaused=true`): "▶ 재개" + "■ 종료" 버튼 표시
- "⏸ 일시정지" 클릭 → `trackingStore.pause()` 호출
- "▶ 재개" 클릭 → `trackingStore.resume()` 호출
- "■ 종료" 클릭 → `trackingStore.stop()` 호출
