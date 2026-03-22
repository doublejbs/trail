# Tracking Pause Design

**Date:** 2026-03-22
**Scope:** 트래킹 일시정지/재개 기능 — 중지 버튼을 일시정지로 교체

## Overview

현재 트래킹 중 "■ 중지" 버튼은 즉시 세션을 종료하고 저장한다. 이를 일시정지/재개 흐름으로 변경한다. 일시정지 중에는 타이머와 GPS 포인트 수집이 멈추며, 재개하면 이어서 계속된다. 완전히 종료하려면 일시정지 상태에서 "■ 종료" 버튼을 누른다.

## Architecture

### TrackingStore 변경

**새 필드:**
```typescript
public isPaused: boolean = false;
```

**새 메서드:**
- `pause()`: 타이머(`setInterval`) 정지, `isPaused = true`. `isTracking = true` 유지. broadcast는 계속 전송 (일시정지 중에도 순위에 표시됨).
- `resume()`: 타이머 재시작, `isPaused = false`.

**기존 메서드 변경:**
- `start()`: 기존 초기화 로직에 `isPaused = false` 추가.
- `stop()`: 변경 없음 — 타이머 정지, `isTracking = false`, 저장.
- `addPoint()`: `isPaused === true`이면 포인트 무시. 기존 `!this.isTracking` 체크와 함께 적용.

**상태 전이:**
```
idle → (start) → tracking → (pause) → paused → (resume) → tracking
                                               → (stop)  → saving → idle
```

### GroupMapPage UI 변경

트래킹 중 통계 패널 하단 버튼 영역을 상태에 따라 분기:

| TrackingStore 상태 | 버튼 |
|---|---|
| `isTracking && !isPaused` | `⏸ 일시정지` (회색 배경) |
| `isTracking && isPaused` | `▶ 재개` (검정) + `■ 종료` (빨강), 가로 배치 |
| `saving` | "저장 중..." 비활성 버튼 (기존) |

**bottomOffset 계산:** 기존과 동일 — `isTracking || saving`일 때 `bottom-36`.

## Files

- **Modify:** `src/stores/TrackingStore.ts` — `isPaused` 필드, `pause()`, `resume()`, `start()`, `addPoint()` 수정
- **Modify:** `src/stores/TrackingStore.test.ts` — pause/resume 테스트 추가
- **Modify:** `src/pages/GroupMapPage.tsx` — 버튼 영역 UI 분기
- **Modify:** `src/pages/GroupMapPage.test.tsx` — 일시정지/재개/종료 버튼 테스트 추가

## Testing

- `pause()` 호출 시 `isPaused = true`, 타이머 정지 (elapsed 증가 안 함)
- `resume()` 호출 시 `isPaused = false`, 타이머 재시작
- 일시정지 중 `addPoint()` 호출 시 포인트 무시
- 재개 후 `addPoint()` 정상 추가
- UI: 트래킹 중 "일시정지" 버튼 표시, 일시정지 중 "재개"+"종료" 버튼 표시
