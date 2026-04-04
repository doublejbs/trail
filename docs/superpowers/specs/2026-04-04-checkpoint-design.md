# 체크포인트 기능 설계

## 개요

트래킹 중 코스 경로 위에 체크포인트를 설정하고, 사용자가 반경 안에 들어와 마커를 탭하면 통과로 처리하는 기능.

## 요구사항

- 코스 등록(그룹 생성) 시 종료 지점이 자동으로 종료 체크포인트가 됨
- 그룹 관리자는 지도에서 터치하여 체크포인트를 여러 개 설정 가능
- 통과 판정: 반경 안에 들어온 상태에서 사용자가 마커를 탭해야 통과
- 반경은 체크포인트별로 관리자가 설정 가능 (기본 30m)
- 체크포인트 설정은 활동 기간(period) 시작 전에만 가능
- 리더보드에 체크포인트 진행 현황 실시간 표시

---

## 1. 데이터베이스

### `checkpoints` 테이블

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID PK (gen_random_uuid()) | |
| group_id | UUID FK → groups.id ON DELETE CASCADE | |
| name | TEXT NOT NULL | 체크포인트 이름 (예: "첫 번째 쉼터") |
| lat | DOUBLE PRECISION NOT NULL | 위도 |
| lng | DOUBLE PRECISION NOT NULL | 경도 |
| radius_m | INTEGER NOT NULL DEFAULT 30 | 통과 판정 반경 (미터) |
| sort_order | DOUBLE PRECISION NOT NULL | 경로상 순서 — 시작점 기준 누적 거리(m). 소수점 필요 |
| is_finish | BOOLEAN NOT NULL DEFAULT false | 종료 체크포인트 여부 |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**RLS 정책:**
- SELECT: 그룹 멤버 (group_members에 user_id 존재)
- INSERT/UPDATE/DELETE: 그룹 생성자 (groups.created_by = auth.uid())

**인덱스:**
- `(group_id, sort_order)` — 그룹별 순서 조회

### `checkpoint_visits` 테이블

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID PK (gen_random_uuid()) | |
| user_id | UUID FK → auth.users.id | |
| checkpoint_id | UUID FK → checkpoints.id ON DELETE CASCADE | |
| tracking_session_id | UUID FK → tracking_sessions.id ON DELETE CASCADE | |
| visited_at | TIMESTAMPTZ DEFAULT now() | 통과 시각 |

**제약 조건:**
- UNIQUE(user_id, checkpoint_id, tracking_session_id) — 세션당 체크포인트 1회 통과

**RLS 정책:**
- INSERT: 본인만 (auth.uid() = user_id)
- SELECT: 해당 체크포인트의 그룹 멤버

### 타입 정의 (`src/types/checkpoint.ts`)

```typescript
export interface Checkpoint {
  id: string;
  group_id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  sort_order: number;
  is_finish: boolean;
  created_at: string;
}

export interface CheckpointVisit {
  id: string;
  user_id: string;
  checkpoint_id: string;
  tracking_session_id: string;
  visited_at: string;
}
```

---

## 2. 그룹 생성 시 종료 체크포인트 자동 생성

### 위치: `GroupCreateStore.submit()`

그룹 INSERT 성공 후, GPX 파일의 마지막 좌표를 종료 체크포인트로 자동 INSERT:

```typescript
// 그룹 생성 직후
const lastCoord = coords[coords.length - 1];
await supabase.from('checkpoints').insert({
  group_id: newGroupId,
  name: '종료',
  lat: lastCoord.lat,
  lng: lastCoord.lon,
  radius_m: 30,
  sort_order: totalDistance, // 전체 경로 거리
  is_finish: true,
});
```

---

## 3. 체크포인트 관리 (관리자 — GroupSettingsPage)

### UI 흐름

1. 그룹 설정 페이지에 **"체크포인트 관리"** 섹션 추가
2. 활동 기간 시작 전에만 편집 가능 — 시작 후에는 읽기 전용 목록
3. "체크포인트 편집" 버튼 → 전체 화면 지도로 전환
   - 코스 경로가 그려진 상태
   - 기존 체크포인트 마커 표시
   - 지도 터치 → 가장 가까운 경로 포인트로 스냅 → 바텀시트로 이름/반경 입력
4. 체크포인트 마커 탭 → 수정/삭제 바텀시트
5. 종료 체크포인트(is_finish)는 삭제 불가, 이름/반경/위치 수정 가능

### 경로 스냅 로직

터치 좌표를 가장 가까운 경로 세그먼트 위 점으로 투영:
- `routeProjection.ts`의 기존 로직 활용 (세그먼트별 parametric projection)
- 투영 후 시작점으로부터의 누적 거리를 `sort_order`로 사용

### 스토어: `GroupSettingsStore` 확장

```typescript
// 추가 상태
checkpoints: Checkpoint[] = [];

// 추가 메서드
async loadCheckpoints(groupId: string): Promise<void>
async addCheckpoint(groupId: string, lat: number, lng: number, name: string, radiusM: number): Promise<void>
async updateCheckpoint(id: string, updates: { name?: string; radius_m?: number; lat?: number; lng?: number }): Promise<void>
async removeCheckpoint(id: string): Promise<void>  // is_finish인 경우 거부
```

- `addCheckpoint` 시 `sort_order`는 경로상 투영 거리로 자동 계산
- 추가/수정/삭제 후 `checkpoints` 배열을 `sort_order` 기준으로 재정렬

---

## 4. 트래킹 중 체크포인트 표시 및 통과

### 지도 마커 상태 (MapStore)

| 상태 | 시각적 표현 |
|---|---|
| 미통과 | 흰 배경 + 검정 테두리 + 순서 번호 |
| 반경 진입 (활성화) | 검정 배경 + 흰 번호 + 펄스 애니메이션 |
| 통과 완료 | 초록 배경 + 체크 아이콘 |
| 종료 (미통과) | 빨간 마커 (기존 endMarker 대체) |
| 종료 (통과 완료) | 초록 배경 + 체크 아이콘 |

반경은 반투명 원으로 표시 (활성화 시 더 진하게).

### MapStore 확장

```typescript
// 추가 상태
_checkpointMarkers: Map<string, naver.maps.Marker> = new Map();
_checkpointCircles: Map<string, naver.maps.Circle> = new Map();

// 추가 메서드
drawCheckpoints(checkpoints: Checkpoint[], visitedIds: Set<string>, nearId: string | null): void
updateCheckpointState(id: string, state: 'default' | 'near' | 'visited'): void
clearCheckpoints(): void
```

- 체크포인트 마커에 클릭 이벤트 리스너 등록
- 클릭 시 콜백으로 `onCheckpointTap(checkpointId)` 호출

### 통과 판정 플로우 (TrackingStore)

```typescript
// 추가 상태
checkpoints: Checkpoint[] = [];
visitedCheckpointIds: Set<string> = new Set();
nearCheckpointId: string | null = null;

// 위치 업데이트마다 (addPoint 또는 setLatestPosition에서):
// 반경 안에 있는 미통과 체크포인트 중 가장 가까운 것을 선택
let nearest: { id: string; dist: number } | null = null;
for (const cp of this.checkpoints) {
  if (this.visitedCheckpointIds.has(cp.id)) continue;
  const dist = haversineMeters(lat, lng, cp.lat, cp.lng);
  if (dist <= cp.radius_m && (!nearest || dist < nearest.dist)) {
    nearest = { id: cp.id, dist };
  }
}
this.nearCheckpointId = nearest?.id ?? null;

// 마커 탭 시:
async visitCheckpoint(checkpointId: string): Promise<void> {
  if (this.nearCheckpointId !== checkpointId) return; // 반경 밖이면 무시
  // checkpoint_visits에 INSERT
  // visitedCheckpointIds에 추가
  // 브로드캐스트에 checkpointsVisited 수 포함
}
```

### 세션 복원 시 체크포인트 복원

`TrackingStore.restore()` 호출 시 해당 세션의 `checkpoint_visits`를 조회하여 `visitedCheckpointIds`를 복원한다. 새로고침 후에도 통과 상태가 유지됨.

### 브로드캐스트 확장

기존 `group-progress` 채널 payload에 `checkpointsVisited: number` 필드 추가:

```typescript
// 기존
{ userId, displayName, maxRouteMeters, lat, lng }
// 확장
{ userId, displayName, maxRouteMeters, lat, lng, checkpointsVisited }
```

---

## 5. 리더보드 연동

### LeaderboardStore 확장

```typescript
// Ranking 인터페이스 확장
interface Ranking {
  // ... 기존 필드
  checkpointsVisited: number; // 추가
}
```

- `load()` 시 `checkpoint_visits` 테이블에서 사용자별 통과 수 집계
- 브로드캐스트 수신 시 `checkpointsVisited` 실시간 업데이트

### 리더보드 UI

- 기존 진행 거리 옆에 체크포인트 진행 현황 표시: `3/5` 형태
- 전체 체크포인트 수는 `checkpoints` 테이블에서 group_id로 COUNT

---

## 6. 수정 파일 목록

| 파일 | 변경 내용 |
|---|---|
| **신규** `src/types/checkpoint.ts` | Checkpoint, CheckpointVisit 타입 |
| **신규** Supabase migration | checkpoints, checkpoint_visits 테이블 |
| `src/stores/GroupCreateStore.ts` | 그룹 생성 시 종료 체크포인트 자동 생성 |
| `src/stores/GroupSettingsStore.ts` | 체크포인트 CRUD 메서드 추가 |
| `src/pages/GroupSettingsPage.tsx` | 체크포인트 관리 UI 섹션 추가 |
| **신규** `src/pages/CheckpointEditPage.tsx` | 전체 화면 지도 체크포인트 편집 |
| `src/stores/MapStore.ts` | 체크포인트 마커/원 렌더링 메서드 추가 |
| `src/stores/TrackingStore.ts` | 반경 감지 + 통과 처리 로직 추가 |
| `src/pages/GroupMapPage.tsx` | 체크포인트 마커 표시 + 탭 이벤트 연결 |
| `src/stores/LeaderboardStore.ts` | 체크포인트 진행 현황 조회/브로드캐스트 |
| `src/utils/routeProjection.ts` | 경로 스냅 유틸 함수 추가 (snapToRoute) |
| `src/App.tsx` | CheckpointEditPage 라우트 추가 (`/group/:id/checkpoints`) |
