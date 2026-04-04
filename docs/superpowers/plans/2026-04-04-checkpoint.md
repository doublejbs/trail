# 체크포인트 기능 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코스 경로 위에 체크포인트를 설정하고, 트래킹 중 사용자가 반경 안에서 마커를 탭하면 통과로 기록하는 기능 구현.

**Architecture:** Supabase에 `checkpoints` + `checkpoint_visits` 테이블 추가. 그룹 생성 시 종료 체크포인트 자동 생성, 관리자가 지도에서 추가 체크포인트 설정. 트래킹 중 반경 감지 → 마커 탭 → DB 기록 → 브로드캐스트로 리더보드 실시간 반영.

**Tech Stack:** React 19, TypeScript, MobX 6, Supabase, Naver Maps SDK, Tailwind CSS 4

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| **신규** `supabase/migrations/20260404100000_checkpoints.sql` | checkpoints, checkpoint_visits 테이블 + RLS |
| **신규** `src/types/checkpoint.ts` | Checkpoint, CheckpointVisit 인터페이스 |
| **신규** `src/utils/snapToRoute.ts` | 터치 좌표를 경로 위로 스냅 + 누적 거리 계산 |
| **수정** `src/stores/GroupCreateStore.ts` | 그룹 생성 시 종료 체크포인트 INSERT |
| **수정** `src/stores/GroupSettingsStore.ts` | 체크포인트 CRUD 메서드 추가 |
| **수정** `src/pages/GroupSettingsPage.tsx` | 체크포인트 관리 섹션 UI |
| **신규** `src/pages/CheckpointEditPage.tsx` | 전체 화면 지도 체크포인트 편집 |
| **수정** `src/App.tsx` | CheckpointEditPage 라우트 추가 |
| **수정** `src/stores/MapStore.ts` | 체크포인트 마커/원 렌더링 메서드 |
| **수정** `src/stores/TrackingStore.ts` | 반경 감지 + 통과 처리 + 세션 복원 |
| **수정** `src/pages/GroupMapPage.tsx` | 체크포인트 마커 표시 + 탭 연결 |
| **수정** `src/stores/LeaderboardStore.ts` | 체크포인트 진행 현황 조회/브로드캐스트 |

---

### Task 1: DB 마이그레이션 + 타입 정의

**Files:**
- Create: `supabase/migrations/20260404100000_checkpoints.sql`
- Create: `src/types/checkpoint.ts`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- supabase/migrations/20260404100000_checkpoints.sql

-- ============================================================
-- checkpoints 테이블
-- ============================================================
CREATE TABLE checkpoints (
  id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID              NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name        TEXT              NOT NULL,
  lat         DOUBLE PRECISION  NOT NULL,
  lng         DOUBLE PRECISION  NOT NULL,
  radius_m    INTEGER           NOT NULL DEFAULT 30,
  sort_order  DOUBLE PRECISION  NOT NULL,
  is_finish   BOOLEAN           NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX ON checkpoints (group_id, sort_order);

ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;

-- SELECT: 그룹 멤버
CREATE POLICY "group member can view checkpoints"
  ON checkpoints FOR SELECT
  USING (is_group_member(group_id));

-- INSERT: 그룹 생성자
CREATE POLICY "group owner can insert checkpoints"
  ON checkpoints FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_id AND groups.created_by = auth.uid()
    )
  );

-- UPDATE: 그룹 생성자
CREATE POLICY "group owner can update checkpoints"
  ON checkpoints FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_id AND groups.created_by = auth.uid()
    )
  );

-- DELETE: 그룹 생성자
CREATE POLICY "group owner can delete checkpoints"
  ON checkpoints FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_id AND groups.created_by = auth.uid()
    )
  );

-- ============================================================
-- checkpoint_visits 테이블
-- ============================================================
CREATE TABLE checkpoint_visits (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkpoint_id         UUID        NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  tracking_session_id   UUID        NOT NULL REFERENCES tracking_sessions(id) ON DELETE CASCADE,
  visited_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, checkpoint_id, tracking_session_id)
);

ALTER TABLE checkpoint_visits ENABLE ROW LEVEL SECURITY;

-- INSERT: 본인만
CREATE POLICY "user can insert own visits"
  ON checkpoint_visits FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- SELECT: 해당 체크포인트의 그룹 멤버
CREATE POLICY "group member can view visits"
  ON checkpoint_visits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM checkpoints c
      WHERE c.id = checkpoint_id AND is_group_member(c.group_id)
    )
  );
```

- [ ] **Step 2: TypeScript 타입 정의 작성**

```typescript
// src/types/checkpoint.ts
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

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공 (새 파일만 추가, 기존 코드 변경 없음)

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260404100000_checkpoints.sql src/types/checkpoint.ts
git commit -m "feat: add checkpoints and checkpoint_visits tables with types"
```

---

### Task 2: 경로 스냅 유틸 함수

**Files:**
- Create: `src/utils/snapToRoute.ts`

- [ ] **Step 1: snapToRoute 함수 작성**

이 함수는 터치 좌표를 가장 가까운 경로 세그먼트 위 점으로 투영하고, 시작점 기준 누적 거리를 반환한다. `routeProjection.ts`의 `maxRouteProgress` 내부 투영 로직과 동일한 parametric projection을 사용하되, 단일 포인트용으로 추출.

```typescript
// src/utils/snapToRoute.ts
import { haversineMeters } from './routeProjection';

interface SnapResult {
  lat: number;
  lng: number;
  /** 시작점 기준 누적 거리 (m) — sort_order 값으로 사용 */
  distanceFromStart: number;
}

/**
 * 주어진 좌표를 가장 가까운 경로 세그먼트 위 점으로 투영한다.
 * routePoints가 2개 미만이면 null 반환.
 */
export function snapToRoute(
  lat: number,
  lng: number,
  routePoints: { lat: number; lng: number }[],
): SnapResult | null {
  if (routePoints.length < 2) return null;

  let bestDist = Infinity;
  let bestSegIdx = 0;
  let bestT = 0;

  for (let i = 0; i < routePoints.length - 1; i++) {
    const A = routePoints[i];
    const B = routePoints[i + 1];
    const apLat = lat - A.lat;
    const apLng = lng - A.lng;
    const abLat = B.lat - A.lat;
    const abLng = B.lng - A.lng;
    const ab2 = abLat * abLat + abLng * abLng;
    const t = ab2 > 0 ? Math.max(0, Math.min(1, (apLat * abLat + apLng * abLng) / ab2)) : 0;
    const qLat = A.lat + t * abLat;
    const qLng = A.lng + t * abLng;
    const dist = haversineMeters(lat, lng, qLat, qLng);

    if (dist < bestDist) {
      bestDist = dist;
      bestSegIdx = i;
      bestT = t;
    }
  }

  const A = routePoints[bestSegIdx];
  const B = routePoints[bestSegIdx + 1];
  const snappedLat = A.lat + bestT * (B.lat - A.lat);
  const snappedLng = A.lng + bestT * (B.lng - A.lng);

  // 시작점부터 투영점까지 누적 거리 계산
  let distanceFromStart = 0;
  for (let k = 0; k < bestSegIdx; k++) {
    distanceFromStart += haversineMeters(
      routePoints[k].lat, routePoints[k].lng,
      routePoints[k + 1].lat, routePoints[k + 1].lng,
    );
  }
  distanceFromStart += bestT * haversineMeters(A.lat, A.lng, B.lat, B.lng);

  return { lat: snappedLat, lng: snappedLng, distanceFromStart };
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/utils/snapToRoute.ts
git commit -m "feat: add snapToRoute utility for checkpoint placement"
```

---

### Task 3: 그룹 생성 시 종료 체크포인트 자동 생성

**Files:**
- Modify: `src/stores/GroupCreateStore.ts`

- [ ] **Step 1: GroupCreateStore에 import 추가 및 submit 수정**

`src/stores/GroupCreateStore.ts`의 import 섹션에 추가:

```typescript
import { computeDistanceM } from '../lib/gpx';
```

`submit()` 메서드에서 그룹 INSERT 성공 후, `this.navigate('/group');` 직전에 종료 체크포인트를 생성하는 코드를 추가한다.

`src/stores/GroupCreateStore.ts`의 기존 코드:

```typescript
    if (insertError) {
      runInAction(() => {
        this.error = insertError.message;
        this.submitting = false;
      });
      toast.error(this.error!);
      return;
    }


    runInAction(() => { this.submitting = false; });
    this.navigate('/group');
```

이것을 다음으로 교체:

```typescript
    if (insertError) {
      runInAction(() => {
        this.error = insertError.message;
        this.submitting = false;
      });
      toast.error(this.error!);
      return;
    }

    // 종료 체크포인트 자동 생성
    try {
      let gpxText: string | null = null;
      if (this.sourceMode === 'file' && this.file) {
        gpxText = await this.file.text();
      } else if (this.sourceMode === 'course') {
        const course = this.courses.find((c) => c.id === this.selectedCourseId);
        if (course) {
          const { data: urlData } = await supabase.storage
            .from('course-gpx')
            .createSignedUrl(course.gpx_path, 60);
          if (urlData?.signedUrl) {
            const resp = await fetch(urlData.signedUrl);
            if (resp.ok) gpxText = await resp.text();
          }
        }
      }
      if (gpxText) {
        const coords = parseGpxCoords(gpxText);
        if (coords && coords.length >= 2) {
          const lastCoord = coords[coords.length - 1];
          const totalDist = computeDistanceM(coords);
          await supabase.from('checkpoints').insert({
            group_id: groupId,
            name: '종료',
            lat: lastCoord.lat,
            lng: lastCoord.lon,
            radius_m: 30,
            sort_order: totalDist,
            is_finish: true,
          });
        }
      }
    } catch {
      // 체크포인트 생성 실패해도 그룹 생성은 성공으로 처리
    }

    runInAction(() => { this.submitting = false; });
    this.navigate('/group');
```

또한 기존 import에 `computeDistanceM`을 추가한다:

```typescript
import { parseGpxCoords, computeDistanceM } from '../lib/gpx';
```

기존 `import { parseGpxCoords } from '../lib/gpx';`를 위의 줄로 교체한다.

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/stores/GroupCreateStore.ts
git commit -m "feat: auto-create finish checkpoint on group creation"
```

---

### Task 4: GroupSettingsStore 체크포인트 CRUD

**Files:**
- Modify: `src/stores/GroupSettingsStore.ts`

- [ ] **Step 1: import 및 상태 추가**

`src/stores/GroupSettingsStore.ts`의 import 섹션에 추가:

```typescript
import type { Checkpoint } from '../types/checkpoint';
```

클래스 선언 내부, `public error: string | null = null;` 줄 아래에 추가:

```typescript
  public checkpoints: Checkpoint[] = [];
```

- [ ] **Step 2: load 메서드에 체크포인트 로드 추가**

`load()` 메서드의 `await Promise.all([ this.fetchInvites(groupId), this.fetchMembers(groupId), ]);` 부분을 다음으로 교체:

```typescript
    await Promise.all([
      this.fetchInvites(groupId),
      this.fetchMembers(groupId),
      this.loadCheckpoints(groupId),
    ]);
```

- [ ] **Step 3: CRUD 메서드 추가**

클래스 끝(닫는 `}` 앞)에 다음 메서드들을 추가:

```typescript
  public async loadCheckpoints(groupId: string): Promise<void> {
    const { data, error } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('group_id', groupId)
      .order('sort_order', { ascending: true });

    runInAction(() => {
      if (error) {
        this.error = error.message;
      } else {
        this.checkpoints = (data ?? []) as Checkpoint[];
      }
    });
  }

  public async addCheckpoint(
    groupId: string,
    lat: number,
    lng: number,
    name: string,
    radiusM: number,
    sortOrder: number,
  ): Promise<void> {
    const { data, error } = await supabase
      .from('checkpoints')
      .insert({
        group_id: groupId,
        name,
        lat,
        lng,
        radius_m: radiusM,
        sort_order: sortOrder,
        is_finish: false,
      })
      .select()
      .single();

    if (error) {
      toast.error(`체크포인트 추가 실패: ${error.message}`);
      return;
    }

    runInAction(() => {
      this.checkpoints = [...this.checkpoints, data as Checkpoint]
        .sort((a, b) => a.sort_order - b.sort_order);
    });
  }

  public async updateCheckpoint(
    id: string,
    updates: { name?: string; radius_m?: number; lat?: number; lng?: number; sort_order?: number },
  ): Promise<void> {
    const { error } = await supabase
      .from('checkpoints')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast.error(`체크포인트 수정 실패: ${error.message}`);
      return;
    }

    runInAction(() => {
      this.checkpoints = this.checkpoints
        .map((cp) => (cp.id === id ? { ...cp, ...updates } : cp))
        .sort((a, b) => a.sort_order - b.sort_order);
    });
  }

  public async removeCheckpoint(id: string): Promise<void> {
    const target = this.checkpoints.find((cp) => cp.id === id);
    if (target?.is_finish) {
      toast.error('종료 체크포인트는 삭제할 수 없습니다');
      return;
    }

    const { error } = await supabase
      .from('checkpoints')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error(`체크포인트 삭제 실패: ${error.message}`);
      return;
    }

    runInAction(() => {
      this.checkpoints = this.checkpoints.filter((cp) => cp.id !== id);
    });
  }
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 5: 커밋**

```bash
git add src/stores/GroupSettingsStore.ts
git commit -m "feat: add checkpoint CRUD methods to GroupSettingsStore"
```

---

### Task 5: GroupSettingsPage 체크포인트 관리 섹션

**Files:**
- Modify: `src/pages/GroupSettingsPage.tsx`

- [ ] **Step 1: import 추가**

`src/pages/GroupSettingsPage.tsx`의 import 섹션에 추가:

```typescript
import { MapPin } from 'lucide-react';
```

기존 lucide import 줄 `import { Copy, Link, UserMinus, Play, Square } from 'lucide-react';`를 다음으로 교체:

```typescript
import { Copy, Link, UserMinus, Play, Square, MapPin } from 'lucide-react';
```

- [ ] **Step 2: 체크포인트 관리 섹션 추가**

`{/* Activity Period Section */}` 의 `</section>` 닫힌 직후, `{/* Invite Link Section */}` 앞에 체크포인트 섹션을 추가:

```tsx
        {/* Checkpoint Section */}
        <section className="bg-black/[0.02] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-black/40" />
            <h2 className="text-[13px] font-bold text-black/60 uppercase tracking-wide">체크포인트</h2>
          </div>
          {store.checkpoints.length === 0 ? (
            <p className="text-[13px] text-black/30 mb-3">아직 체크포인트가 없습니다</p>
          ) : (
            <div className="bg-white rounded-xl border border-black/[0.06] overflow-hidden mb-3">
              {store.checkpoints.map((cp, i) => (
                <div
                  key={cp.id}
                  className={`flex items-center gap-3 px-3 py-2.5 ${
                    i < store.checkpoints.length - 1 ? 'border-b border-black/[0.04]' : ''
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    cp.is_finish
                      ? 'bg-red-500 text-white'
                      : 'bg-black/[0.06] text-black/50'
                  }`}>
                    {cp.is_finish ? 'F' : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-black/70 truncate">{cp.name}</p>
                    <p className="text-[11px] text-black/30">반경 {cp.radius_m}m</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!store.isPeriodActive ? (
            <button
              onClick={() => navigate(`/group/${id}/checkpoints`)}
              className="w-full py-2.5 rounded-xl bg-black text-white text-[13px] font-semibold active:bg-black/80 transition-colors"
            >
              체크포인트 편집
            </button>
          ) : (
            <p className="text-[11px] text-black/30">활동 중에는 체크포인트를 수정할 수 없습니다</p>
          )}
        </section>
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 4: 커밋**

```bash
git add src/pages/GroupSettingsPage.tsx
git commit -m "feat: add checkpoint management section to GroupSettingsPage"
```

---

### Task 6: CheckpointEditPage + 라우트

**Files:**
- Create: `src/pages/CheckpointEditPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: CheckpointEditPage 작성**

```tsx
// src/pages/CheckpointEditPage.tsx
import { useRef, useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import { NavigationBar } from '../components/NavigationBar';
import { MapStore } from '../stores/MapStore';
import { GroupSettingsStore } from '../stores/GroupSettingsStore';
import { parseGpxPoints } from '../utils/routeProjection';
import { snapToRoute } from '../utils/snapToRoute';
import { supabase } from '../lib/supabase';
import type { Checkpoint } from '../types/checkpoint';
import type { Group } from '../types/group';

export const CheckpointEditPage = observer(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapStore] = useState(() => new MapStore());
  const [store] = useState(() => new GroupSettingsStore(navigate));
  const [gpxText, setGpxText] = useState<string | null>(null);
  const [editingCp, setEditingCp] = useState<Checkpoint | null>(null);
  const [cpName, setCpName] = useState('');
  const [cpRadius, setCpRadius] = useState('30');
  const [showSheet, setShowSheet] = useState(false);
  const [pendingSnap, setPendingSnap] = useState<{ lat: number; lng: number; distanceFromStart: number } | null>(null);

  const routePoints = useMemo(
    () => (gpxText ? parseGpxPoints(gpxText) : []),
    [gpxText],
  );

  // 그룹 데이터 + 체크포인트 로드
  useEffect(() => {
    if (id) store.load(id);
  }, [id, store]);

  // GPX 로드
  useEffect(() => {
    if (!store.group) return;
    const group = store.group as Group;
    (async () => {
      const { data: urlData } = await supabase.storage
        .from(group.gpx_bucket ?? 'gpx-files')
        .createSignedUrl(group.gpx_path, 3600);
      if (!urlData?.signedUrl) return;
      const resp = await fetch(urlData.signedUrl);
      if (resp.ok) {
        const text = await resp.text();
        setGpxText(text);
      }
    })();
  }, [store.group]);

  // 지도 초기화 + 경로 그리기
  useEffect(() => {
    if (!mapRef.current || !gpxText) return;
    mapStore.initMap(mapRef.current);
    mapStore.drawGpxRoute(gpxText);
    return () => { mapStore.destroy(); };
  }, [mapStore, gpxText]);

  // 체크포인트 마커 그리기
  useEffect(() => {
    if (!mapStore.map || store.checkpoints.length === 0) return;

    // 기존 마커 정리
    clearCheckpointMarkers();

    store.checkpoints.forEach((cp, i) => {
      const marker = new window.naver.maps.Marker({
        map: mapStore.map!,
        position: new window.naver.maps.LatLng(cp.lat, cp.lng),
        icon: {
          content: createCheckpointMarkerHtml(cp, i),
          anchor: new window.naver.maps.Point(16, 16),
        },
      });

      const circle = new window.naver.maps.Circle({
        map: mapStore.map!,
        center: new window.naver.maps.LatLng(cp.lat, cp.lng),
        radius: cp.radius_m,
        strokeColor: cp.is_finish ? '#F44336' : '#000000',
        strokeOpacity: 0.3,
        strokeWeight: 1,
        fillColor: cp.is_finish ? '#F44336' : '#000000',
        fillOpacity: 0.06,
      });

      window.naver.maps.Event.addListener(marker, 'click', () => {
        setEditingCp(cp);
        setCpName(cp.name);
        setCpRadius(String(cp.radius_m));
        setPendingSnap(null);
        setShowSheet(true);
      });

      markersRef.current.push(marker);
      circlesRef.current.push(circle);
    });
  }, [mapStore.map, store.checkpoints]);

  // 지도 클릭 → 새 체크포인트 스냅
  useEffect(() => {
    if (!mapStore.map) return;
    const listener = window.naver.maps.Event.addListener(mapStore.map, 'click', (e: naver.maps.PointerEvent) => {
      if (routePoints.length < 2) return;
      const snap = snapToRoute(e.coord.lat(), e.coord.lng(), routePoints);
      if (!snap) return;
      setPendingSnap(snap);
      setEditingCp(null);
      setCpName('');
      setCpRadius('30');
      setShowSheet(true);
    });
    return () => { window.naver.maps.Event.removeListener(listener); };
  }, [mapStore.map, routePoints]);

  const markersRef = useRef<naver.maps.Marker[]>([]);
  const circlesRef = useRef<naver.maps.Circle[]>([]);

  function clearCheckpointMarkers() {
    markersRef.current.forEach((m) => m.setMap(null));
    circlesRef.current.forEach((c) => c.setMap(null));
    markersRef.current = [];
    circlesRef.current = [];
  }

  function createCheckpointMarkerHtml(cp: Checkpoint, index: number): string {
    if (cp.is_finish) {
      return `<div style="width:32px;height:32px;border-radius:50%;background:#F44336;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);">F</div>`;
    }
    return `<div style="width:32px;height:32px;border-radius:50%;background:white;display:flex;align-items:center;justify-content:center;color:black;font-size:12px;font-weight:bold;border:2px solid black;box-shadow:0 2px 6px rgba(0,0,0,0.15);">${index + 1}</div>`;
  }

  const handleSave = async () => {
    if (!id) return;
    const radius = parseInt(cpRadius, 10);
    if (isNaN(radius) || radius < 1) return;
    const name = cpName.trim() || `체크포인트`;

    if (editingCp) {
      // 수정
      const updates: Record<string, unknown> = { name, radius_m: radius };
      if (pendingSnap) {
        updates.lat = pendingSnap.lat;
        updates.lng = pendingSnap.lng;
        updates.sort_order = pendingSnap.distanceFromStart;
      }
      await store.updateCheckpoint(editingCp.id, updates as { name?: string; radius_m?: number; lat?: number; lng?: number; sort_order?: number });
    } else if (pendingSnap) {
      // 신규
      await store.addCheckpoint(id, pendingSnap.lat, pendingSnap.lng, name, radius, pendingSnap.distanceFromStart);
    }

    setShowSheet(false);
    setEditingCp(null);
    setPendingSnap(null);
  };

  const handleDelete = async () => {
    if (!editingCp) return;
    await store.removeCheckpoint(editingCp.id);
    setShowSheet(false);
    setEditingCp(null);
  };

  if (store.group === undefined) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <div className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (store.group === null || !id) {
    return <Navigate to="/group" replace />;
  }

  // 활동 중이면 편집 불가 → 설정 페이지로 이동
  if (store.isPeriodActive) {
    return <Navigate to={`/group/${id}/settings`} replace />;
  }

  return (
    <div className="absolute inset-0 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <NavigationBar
        title="체크포인트 편집"
        onBack={() => navigate(`/group/${id}/settings`)}
      />
      <div className="flex-1 relative overflow-hidden">
        <div ref={mapRef} className="absolute inset-0 w-full h-full" />

        {/* 안내 오버레이 */}
        {!showSheet && (
          <div className="absolute top-4 left-4 right-4 z-10">
            <div className="bg-white/90 backdrop-blur rounded-xl px-4 py-2.5 shadow-lg shadow-black/5 border border-black/[0.06]">
              <p className="text-[12px] text-black/50 font-medium text-center">
                지도를 터치하여 체크포인트를 추가하세요
              </p>
            </div>
          </div>
        )}

        {/* 바텀시트 — 체크포인트 추가/수정 */}
        {showSheet && (
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-white rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.10)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="w-9 h-1 bg-black/10 rounded-full" />
            </div>
            <div className="px-5 pb-5 flex flex-col gap-3">
              <h3 className="text-[15px] font-bold text-black">
                {editingCp ? '체크포인트 수정' : '새 체크포인트'}
              </h3>
              <div>
                <label className="text-[11px] text-black/40 font-medium mb-1 block">이름</label>
                <input
                  type="text"
                  value={cpName}
                  onChange={(e) => setCpName(e.target.value)}
                  placeholder="체크포인트 이름"
                  className="w-full bg-black/[0.03] border border-black/[0.06] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-black/20"
                />
              </div>
              <div>
                <label className="text-[11px] text-black/40 font-medium mb-1 block">반경 (m)</label>
                <input
                  type="number"
                  min={1}
                  value={cpRadius}
                  onChange={(e) => setCpRadius(e.target.value)}
                  className="w-full bg-black/[0.03] border border-black/[0.06] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-black/20"
                />
              </div>
              <div className="flex gap-2 pt-1">
                {editingCp && !editingCp.is_finish && (
                  <button
                    onClick={handleDelete}
                    className="px-5 py-2.5 rounded-xl border border-red-200 text-red-500 text-[13px] font-semibold active:bg-red-50 transition-colors"
                  >
                    삭제
                  </button>
                )}
                <button
                  onClick={() => { setShowSheet(false); setEditingCp(null); setPendingSnap(null); }}
                  className="flex-1 py-2.5 rounded-xl border border-black/10 text-[13px] font-semibold text-black/50 active:bg-black/[0.03] transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-2.5 rounded-xl bg-black text-white text-[13px] font-semibold active:bg-black/80 transition-colors"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
```

- [ ] **Step 2: App.tsx에 라우트 추가**

`src/App.tsx`의 import 섹션에 추가:

```typescript
import { CheckpointEditPage } from './pages/CheckpointEditPage';
```

라우트에서 `<Route path="group/:id/settings" element={<GroupSettingsPage />} />` 바로 아래에 추가:

```tsx
          <Route path="group/:id/checkpoints" element={<CheckpointEditPage />} />
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 4: 커밋**

```bash
git add src/pages/CheckpointEditPage.tsx src/App.tsx
git commit -m "feat: add CheckpointEditPage with map-based checkpoint management"
```

---

### Task 7: MapStore 체크포인트 마커 렌더링

**Files:**
- Modify: `src/stores/MapStore.ts`

- [ ] **Step 1: import 추가**

`src/stores/MapStore.ts`의 import 섹션에 추가:

```typescript
import type { Checkpoint } from '../types/checkpoint';
```

- [ ] **Step 2: 상태 필드 추가**

`private _memberMarkers: Map<string, naver.maps.Marker> = new Map();` 바로 아래에 추가:

```typescript
  private _checkpointMarkers: Map<string, naver.maps.Marker> = new Map();
  private _checkpointCircles: Map<string, naver.maps.Circle> = new Map();
  private _onCheckpointTap: ((checkpointId: string) => void) | null = null;
```

- [ ] **Step 3: drawCheckpoints 메서드 추가**

`clearMemberMarkers()` 메서드 바로 아래에 다음 메서드들을 추가:

```typescript
  public setOnCheckpointTap(cb: ((checkpointId: string) => void) | null): void {
    this._onCheckpointTap = cb;
  }

  public drawCheckpoints(
    checkpoints: Checkpoint[],
    visitedIds: Set<string>,
    nearId: string | null,
  ): void {
    if (!this.map) return;

    // 기존 endMarker 숨기기 (종료 체크포인트가 대체)
    if (checkpoints.some((cp) => cp.is_finish)) {
      this.endMarker?.setMap(null);
    }

    // 체크포인트별 순서 번호 (is_finish 제외)
    let order = 0;
    for (const cp of checkpoints) {
      const isVisited = visitedIds.has(cp.id);
      const isNear = nearId === cp.id;
      if (!cp.is_finish) order++;
      const displayOrder = cp.is_finish ? -1 : order;

      const existing = this._checkpointMarkers.get(cp.id);
      const position = new window.naver.maps.LatLng(cp.lat, cp.lng);

      if (existing) {
        existing.setPosition(position);
        existing.setIcon({
          content: this._buildCheckpointHtml(cp, displayOrder, isVisited, isNear),
          anchor: new window.naver.maps.Point(16, 16),
        });
      } else {
        const marker = new window.naver.maps.Marker({
          map: this.map,
          position,
          icon: {
            content: this._buildCheckpointHtml(cp, displayOrder, isVisited, isNear),
            anchor: new window.naver.maps.Point(16, 16),
          },
          zIndex: 100,
        });
        window.naver.maps.Event.addListener(marker, 'click', () => {
          this._onCheckpointTap?.(cp.id);
        });
        this._checkpointMarkers.set(cp.id, marker);
      }

      // 반경 원
      const existingCircle = this._checkpointCircles.get(cp.id);
      const circleColor = cp.is_finish ? '#F44336' : isNear ? '#000000' : '#000000';
      const circleOpacity = isNear ? 0.12 : 0.05;
      if (existingCircle) {
        existingCircle.setCenter(position);
        existingCircle.setRadius(cp.radius_m);
        existingCircle.setOptions({
          fillColor: circleColor,
          fillOpacity: circleOpacity,
          strokeColor: circleColor,
          strokeOpacity: isNear ? 0.4 : 0.2,
        });
      } else {
        const circle = new window.naver.maps.Circle({
          map: this.map,
          center: position,
          radius: cp.radius_m,
          strokeColor: circleColor,
          strokeOpacity: 0.2,
          strokeWeight: 1,
          fillColor: circleColor,
          fillOpacity: circleOpacity,
        });
        this._checkpointCircles.set(cp.id, circle);
      }
    }

    // 삭제된 체크포인트 정리
    const currentIds = new Set(checkpoints.map((cp) => cp.id));
    for (const [cpId, marker] of this._checkpointMarkers) {
      if (!currentIds.has(cpId)) {
        marker.setMap(null);
        this._checkpointMarkers.delete(cpId);
      }
    }
    for (const [cpId, circle] of this._checkpointCircles) {
      if (!currentIds.has(cpId)) {
        circle.setMap(null);
        this._checkpointCircles.delete(cpId);
      }
    }
  }

  private _buildCheckpointHtml(
    cp: Checkpoint,
    displayOrder: number,
    isVisited: boolean,
    isNear: boolean,
  ): string {
    if (isVisited) {
      return `<div style="width:32px;height:32px;border-radius:50%;background:#22C55E;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>`;
    }
    if (cp.is_finish) {
      return `<div style="width:32px;height:32px;border-radius:50%;background:#F44336;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);">F</div>`;
    }
    if (isNear) {
      return `<div style="width:32px;height:32px;border-radius:50%;background:#000;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);animation:cp-pulse 1.5s ease-in-out infinite;">
        <style>@keyframes cp-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}</style>
        ${displayOrder}
      </div>`;
    }
    return `<div style="width:32px;height:32px;border-radius:50%;background:white;display:flex;align-items:center;justify-content:center;color:black;font-size:12px;font-weight:bold;border:2px solid black;box-shadow:0 2px 6px rgba(0,0,0,0.15);">${displayOrder}</div>`;
  }

  public clearCheckpoints(): void {
    this._checkpointMarkers.forEach((m) => m.setMap(null));
    this._checkpointMarkers.clear();
    this._checkpointCircles.forEach((c) => c.setMap(null));
    this._checkpointCircles.clear();
  }
```

- [ ] **Step 4: destroy() 메서드에 cleanup 추가**

`destroy()` 메서드 내부의 `this.clearMemberMarkers();` 바로 아래에 추가:

```typescript
    this.clearCheckpoints();
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 6: 커밋**

```bash
git add src/stores/MapStore.ts
git commit -m "feat: add checkpoint markers and radius circles to MapStore"
```

---

### Task 8: TrackingStore 반경 감지 + 통과 처리

**Files:**
- Modify: `src/stores/TrackingStore.ts`

- [ ] **Step 1: import 및 상태 추가**

`src/stores/TrackingStore.ts`의 import 섹션에 추가:

```typescript
import type { Checkpoint } from '../types/checkpoint';
```

클래스 내부, `public displayName: string | null = null;` 바로 아래에 추가:

```typescript
  public checkpoints: Checkpoint[] = [];
  public visitedCheckpointIds: Set<string> = new Set();
  public nearCheckpointId: string | null = null;
```

- [ ] **Step 2: setCheckpoints 메서드 추가**

`setRoutePoints()` 메서드 바로 아래에 추가:

```typescript
  public setCheckpoints(checkpoints: Checkpoint[]): void {
    this.checkpoints = checkpoints;
  }
```

- [ ] **Step 3: 반경 감지 private 메서드 추가**

`_clearTimer()` 메서드 바로 아래에 추가:

```typescript
  private _updateNearCheckpoint(lat: number, lng: number): void {
    let nearest: { id: string; dist: number } | null = null;
    for (const cp of this.checkpoints) {
      if (this.visitedCheckpointIds.has(cp.id)) continue;
      const dist = haversineMeters(lat, lng, cp.lat, cp.lng);
      if (dist <= cp.radius_m && (!nearest || dist < nearest.dist)) {
        nearest = { id: cp.id, dist };
      }
    }
    this.nearCheckpointId = nearest?.id ?? null;
  }
```

- [ ] **Step 4: addPoint에 반경 감지 호출 추가**

`addPoint()` 메서드의 마지막 줄 `this.maxRouteMeters = maxRouteProgress(this.points, this.routePoints);` 바로 아래에 추가:

```typescript
    this._updateNearCheckpoint(lat, lng);
```

- [ ] **Step 5: setLatestPosition에도 반경 감지 호출 추가**

`setLatestPosition()` 메서드의 기존 코드:

```typescript
  public setLatestPosition(lat: number, lng: number): void {
    this.latestLat = lat;
    this.latestLng = lng;
    this._maybeBroadcast(lat, lng);
  }
```

다음으로 교체:

```typescript
  public setLatestPosition(lat: number, lng: number): void {
    this.latestLat = lat;
    this.latestLng = lng;
    this._updateNearCheckpoint(lat, lng);
    this._maybeBroadcast(lat, lng);
  }
```

- [ ] **Step 6: visitCheckpoint 메서드 추가**

`_updateNearCheckpoint()` 메서드 바로 아래에 추가:

```typescript
  public async visitCheckpoint(checkpointId: string): Promise<void> {
    if (this.nearCheckpointId !== checkpointId) return;
    if (!this._sessionId || !this._userId) return;
    if (this.visitedCheckpointIds.has(checkpointId)) return;

    const { error } = await supabase.from('checkpoint_visits').insert({
      user_id: this._userId,
      checkpoint_id: checkpointId,
      tracking_session_id: this._sessionId,
    });

    if (error) return;

    runInAction(() => {
      this.visitedCheckpointIds = new Set([...this.visitedCheckpointIds, checkpointId]);
      this.nearCheckpointId = null;
    });

    // 브로드캐스트에 체크포인트 수 포함하여 즉시 전송
    if (this._channel && this._userId && this.latestLat !== null && this.latestLng !== null) {
      void this._channel.send({
        type: 'broadcast',
        event: 'progress',
        payload: {
          userId: this._userId,
          displayName: this.displayName,
          maxRouteMeters: this.maxRouteMeters,
          lat: this.latestLat,
          lng: this.latestLng,
          checkpointsVisited: this.visitedCheckpointIds.size,
        },
      });
    }
  }
```

- [ ] **Step 7: _maybeBroadcast에 checkpointsVisited 추가**

`_maybeBroadcast()` 메서드의 `void this._channel.send(...)` 부분의 payload 객체:

```typescript
      payload: {
        userId: this._userId,
        displayName: this.displayName,
        maxRouteMeters: this.maxRouteMeters,
        lat,
        lng,
      },
```

다음으로 교체:

```typescript
      payload: {
        userId: this._userId,
        displayName: this.displayName,
        maxRouteMeters: this.maxRouteMeters,
        lat,
        lng,
        checkpointsVisited: this.visitedCheckpointIds.size,
      },
```

- [ ] **Step 8: restore에 체크포인트 복원 추가**

`restore()` 메서드에서 `this._startTimer();` 바로 아래에 추가:

```typescript
      // 체크포인트 통과 상태 복원
      const { data: visits } = await supabase
        .from('checkpoint_visits')
        .select('checkpoint_id')
        .eq('tracking_session_id', data.id);

      if (visits && visits.length > 0) {
        runInAction(() => {
          this.visitedCheckpointIds = new Set(visits.map((v) => v.checkpoint_id));
        });
      }
```

- [ ] **Step 9: restart에 체크포인트 상태 초기화 추가**

`restart()` 메서드의 `runInAction(() => {` 블록 내부, `this.saveError = null;` 바로 아래에 추가:

```typescript
      this.visitedCheckpointIds = new Set();
      this.nearCheckpointId = null;
```

- [ ] **Step 10: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 11: 커밋**

```bash
git add src/stores/TrackingStore.ts
git commit -m "feat: add checkpoint proximity detection and visit tracking"
```

---

### Task 9: GroupMapPage 체크포인트 연결

**Files:**
- Modify: `src/pages/GroupMapPage.tsx`

- [ ] **Step 1: import 추가**

`src/pages/GroupMapPage.tsx`의 import 섹션에 추가:

```typescript
import { supabase as supabaseClient } from '../lib/supabase';
```

이미 `supabase`가 import되어 있으므로 이 단계는 생략. 대신 체크포인트 데이터 로드를 위해 아래 코드를 추가한다.

- [ ] **Step 2: 체크포인트 상태 추가**

`const [resetting, setResetting] = useState(false);` 바로 아래에 추가:

```typescript
  const [checkpoints, setCheckpoints] = useState<import('../types/checkpoint').Checkpoint[]>([]);
  const [totalCheckpoints, setTotalCheckpoints] = useState(0);
```

- [ ] **Step 3: 체크포인트 로드 effect 추가**

`initialized` ref 사용하는 useEffect 내부, `void trackingStore.restore();` 바로 아래에 추가:

```typescript
    // 체크포인트 로드
    supabase
      .from('checkpoints')
      .select('*')
      .eq('group_id', id)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        const cps = (data ?? []) as import('../types/checkpoint').Checkpoint[];
        setCheckpoints(cps);
        setTotalCheckpoints(cps.length);
        trackingStore.setCheckpoints(cps);
      });
```

- [ ] **Step 4: 체크포인트 마커 탭 콜백 등록**

`// 지도 초기화 — 그룹 데이터 로드 즉시` 주석이 있는 useEffect 내부, `void trackingStore.startLocationBroadcast();` 바로 아래에 추가:

```typescript
    mapStore.setOnCheckpointTap((cpId) => {
      void trackingStore.visitCheckpoint(cpId);
    });
```

- [ ] **Step 5: 체크포인트 마커 렌더링 effect 추가**

`leaderboardStore.rankings.forEach(...)` 하는 autorun useEffect 바로 아래에 새 useEffect 추가:

```typescript
  // 체크포인트 마커 렌더링
  useEffect(() => {
    if (checkpoints.length === 0 || !mapStore.map) return;
    const disposer = autorun(() => {
      mapStore.drawCheckpoints(
        checkpoints,
        trackingStore.visitedCheckpointIds,
        trackingStore.nearCheckpointId,
      );
    });
    return disposer;
  }, [checkpoints, mapStore, trackingStore]);
```

- [ ] **Step 6: 리더보드 항목에 체크포인트 진행 현황 표시**

리더보드 패널 내부, 각 랭킹 항목의 progress 표시 부분:

```tsx
                <span className="text-[13px] text-black/40 tabular-nums font-semibold">
                  {formatProgress(r.maxRouteMeters)}
                </span>
```

다음으로 교체:

```tsx
                <span className="text-[13px] text-black/40 tabular-nums font-semibold flex items-center gap-1.5">
                  {totalCheckpoints > 0 && (
                    <span className="text-[11px] text-black/25">{r.checkpointsVisited ?? 0}/{totalCheckpoints}</span>
                  )}
                  {formatProgress(r.maxRouteMeters)}
                </span>
```

- [ ] **Step 7: displayRankings에 checkpointsVisited 필드 추가**

`displayRankings` 계산에서 `myEntry` 생성 부분:

```typescript
    const myEntry: Ranking = {
      userId: store.currentUserId,
      displayName: trackingStore.displayName ?? '나',
      maxRouteMeters: trackingStore.maxRouteMeters,
      isLive: true,
      lat: trackingStore.latestLat,
      lng: trackingStore.latestLng,
      avatarUrl: null,
    };
```

다음으로 교체:

```typescript
    const myEntry: Ranking = {
      userId: store.currentUserId,
      displayName: trackingStore.displayName ?? '나',
      maxRouteMeters: trackingStore.maxRouteMeters,
      isLive: true,
      lat: trackingStore.latestLat,
      lng: trackingStore.latestLng,
      avatarUrl: null,
      checkpointsVisited: trackingStore.visitedCheckpointIds.size,
    };
```

- [ ] **Step 8: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 9: 커밋**

```bash
git add src/pages/GroupMapPage.tsx
git commit -m "feat: integrate checkpoint markers and visit tracking in GroupMapPage"
```

---

### Task 10: LeaderboardStore 체크포인트 진행 현황

**Files:**
- Modify: `src/stores/LeaderboardStore.ts`

- [ ] **Step 1: Ranking 인터페이스에 checkpointsVisited 추가**

`src/stores/LeaderboardStore.ts`의 `Ranking` 인터페이스:

```typescript
interface Ranking {
  userId: string;
  displayName: string;
  maxRouteMeters: number;
  isLive: boolean;
  lat: number | null;
  lng: number | null;
  avatarUrl: string | null;
}
```

다음으로 교체:

```typescript
interface Ranking {
  userId: string;
  displayName: string;
  maxRouteMeters: number;
  isLive: boolean;
  lat: number | null;
  lng: number | null;
  avatarUrl: string | null;
  checkpointsVisited: number;
}
```

- [ ] **Step 2: load() 메서드에 체크포인트 통과 수 집계 추가**

`load()` 메서드 내부, `const positionMap = new Map<...>()` 선언 바로 위에 추가:

```typescript
      // 체크포인트 통과 수 집계: 유저별 최대 세션의 통과 수
      const checkpointCountMap = new Map<string, number>();
      if (userIds.length > 0) {
        const { data: visits } = await supabase
          .from('checkpoint_visits')
          .select('user_id, checkpoint_id')
          .in('user_id', userIds);
        if (visits) {
          const byUser = new Map<string, Set<string>>();
          for (const v of visits) {
            if (!byUser.has(v.user_id)) byUser.set(v.user_id, new Set());
            byUser.get(v.user_id)!.add(v.checkpoint_id);
          }
          for (const [uid, cpIds] of byUser) {
            checkpointCountMap.set(uid, cpIds.size);
          }
        }
      }
```

- [ ] **Step 3: rankings 생성에 checkpointsVisited 포함**

`this.rankings = [...allUserIds]` 매핑에서 각 항목에 `checkpointsVisited` 추가. 기존:

```typescript
            avatarUrl: avatarUrlMap.get(userId) ?? null,
          }))
```

다음으로 교체:

```typescript
            avatarUrl: avatarUrlMap.get(userId) ?? null,
            checkpointsVisited: checkpointCountMap.get(userId) ?? 0,
          }))
```

- [ ] **Step 4: 브로드캐스트 수신에 checkpointsVisited 추가**

브로드캐스트 콜백 내부, payload 타입:

```typescript
      const { userId, displayName, maxRouteMeters, lat, lng } = msg.payload as {
        userId: string;
        displayName: string;
        maxRouteMeters: number;
        lat: number | null;
        lng: number | null;
      };
```

다음으로 교체:

```typescript
      const { userId, displayName, maxRouteMeters, lat, lng, checkpointsVisited } = msg.payload as {
        userId: string;
        displayName: string;
        maxRouteMeters: number;
        lat: number | null;
        lng: number | null;
        checkpointsVisited?: number;
      };
```

기존 업데이트 로직에서 `existing.isLive = true;` 바로 아래에 추가:

```typescript
          if (checkpointsVisited != null) existing.checkpointsVisited = checkpointsVisited;
```

새 랭킹 push 부분:

```typescript
          this.rankings.push({ userId, displayName, maxRouteMeters, isLive: true, lat, lng, avatarUrl: null });
```

다음으로 교체:

```typescript
          this.rankings.push({ userId, displayName, maxRouteMeters, isLive: true, lat, lng, avatarUrl: null, checkpointsVisited: checkpointsVisited ?? 0 });
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 6: 커밋**

```bash
git add src/stores/LeaderboardStore.ts
git commit -m "feat: add checkpoint visit counts to leaderboard rankings"
```

---

### Task 11: 최종 빌드 및 통합 확인

**Files:** (전체)

- [ ] **Step 1: 전체 빌드**

Run: `npm run build`
Expected: 성공 — 타입 에러 없음

- [ ] **Step 2: 린트**

Run: `npm run lint`
Expected: 새로 추가한 파일에 에러 없음

- [ ] **Step 3: 수정 사항이 있으면 수정 후 커밋**

필요한 수정을 적용한 후:

```bash
git add -A
git commit -m "fix: resolve lint and type errors for checkpoint feature"
```

- [ ] **Step 4: Supabase 마이그레이션 적용 안내**

마이그레이션을 적용해야 DB에 테이블이 생성됩니다:

```bash
npx supabase db push
```

또는 Supabase 대시보드 SQL 에디터에서 `supabase/migrations/20260404100000_checkpoints.sql` 내용을 직접 실행.
