# 그룹 생성 설계

**날짜:** 2026-03-18

## 개요

더미 그룹 데이터를 실제 Supabase 기반 그룹으로 교체한다. 사용자는 그룹명과 GPX 파일로 그룹을 생성할 수 있다. 그룹 지도 뷰에서는 Storage에서 GPX를 가져와 `MapStore`를 통해 경로를 폴리라인으로 그린다.

## 범위

- Supabase `groups` 테이블 + `gpx-files` Storage 버킷
- `GroupPage`: 내 그룹 목록 표시, 생성/지도로 이동
- `GroupCreatePage` (`/group/new`): 그룹명 + GPX 업로드 폼
- `GroupMapPage`: Supabase에서 그룹 조회, `MapStore`로 GPX 폴리라인 표시
- `MapStore`: GPX 파싱 + 폴리라인 그리기 추가
- `src/data/groups.ts` 삭제

**범위 외 (추후 구현):** 그룹 초대, 멤버 관리, 공유 그룹.

## 데이터베이스 스키마

Supabase SQL 편집기에서 실행:

```sql
create table groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references auth.users(id),
  gpx_path   text not null,
  created_at timestamptz default now()
);

alter table groups enable row level security;

create policy "owner select"
  on groups for select
  using (auth.uid() = created_by);

create policy "owner insert"
  on groups for insert
  with check (auth.uid() = created_by);
```

delete 정책을 의도적으로 추가하지 않는다 — 그룹 삭제는 이번 기능 범위 외이다.

## Storage

- 버킷명: `gpx-files` (비공개, 공개 접근 없음)
- 객체 경로: `{user_id}/{group_id}.gpx`
- `storage.objects` RLS:

```sql
create policy "owner upload"
  on storage.objects for insert
  with check (bucket_id = 'gpx-files' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "owner read"
  on storage.objects for select
  using (bucket_id = 'gpx-files' and auth.uid()::text = (storage.foldername(name))[1]);
```

GPX 파일은 읽기 시점에 생성하는 Signed URL(60분 만료)로 접근한다.

## TypeScript 타입

`src/types/group.ts` 생성:

```ts
export interface Group {
  id: string;
  name: string;
  created_by: string;
  gpx_path: string;
  created_at: string;
}
```

## 스토어

### `GroupStore` (`src/stores/GroupStore.ts`)

역할: Supabase에서 현재 사용자의 그룹 목록을 가져온다.

```ts
class GroupStore {
  groups: Group[] = [];
  loading: boolean = true;
  error: boolean = false;

  async load(): Promise<void>  // created_by = auth.uid() 조건으로 그룹 조회
}
```

`load()`는 시작 시 `loading = true`로 설정하고 Supabase를 쿼리한다. 성공 시 `groups`를 설정하고 `loading = false`로 리셋; 실패 시 `error = true`로 설정하고 `loading = false`로 리셋한다. 두 경로 모두 반드시 `loading`을 `false`로 리셋한다. `loading: true` 초기값은 의도적이다 — 첫 `load()` 호출이 완료될 때까지 `GroupPage`를 스피너 상태로 유지한다.

`GroupPage`는 마운트될 때마다 `GroupStore.load()`를 호출한다. React Router v6는 하위 경로로 이동 시 `GroupPage`를 완전히 언마운트하고 돌아올 때 다시 마운트하므로, 별도의 캐시 무효화 없이 `GroupCreatePage`에서 돌아오면 새 그룹이 목록에 표시된다.

**에러 타입 비고:** `GroupStore.error`는 `boolean` (조회 성공/실패). `GroupCreateStore.error`는 `string | null` — 업로드/삽입 실패 메시지를 사용자에게 구체적으로 전달하기 위해 문자열을 사용한다.

### `GroupCreateStore` (`src/stores/GroupCreateStore.ts`)

역할: 폼 상태 관리, GPX 업로드 + DB 삽입 처리.

```ts
class GroupCreateStore {
  name: string = '';
  file: File | null = null;
  submitting: boolean = false;
  error: string | null = null;

  setName(v: string): void
  setFile(f: File | null): void
  get isValid(): boolean  // name.trim() !== '' && file !== null

  // 성공 시 새 그룹 id 반환, 실패 시 null 반환
  async submit(): Promise<string | null>
}
```

`submit()`은 인자를 받지 않는다 — 내부에서 `supabase.auth.getUser()`를 호출해 `userId`를 가져온다. 호출부에서 인증을 신경 쓰지 않아도 된다.

`submit` 단계:
1. `supabase.auth.getUser()`로 `userId` 획득. 실패 시 `error` 설정 후 `null` 반환.
2. 새 그룹 UUID 생성: `const groupId = crypto.randomUUID()`.
3. 미리 생성한 `groupId`를 사용해 `file`을 `gpx-files/{userId}/{groupId}.gpx`에 업로드.
4. `groups` 테이블에 `id: groupId`, `name`, `created_by: userId`, `gpx_path: '{userId}/{groupId}.gpx'` 행 삽입.
5. 성공 시 `groupId` 반환; 실패 시 `error` 설정 후 `null` 반환.

업로드 전에 `crypto.randomUUID()`로 UUID를 생성하므로 Storage 경로와 DB 행의 `id`가 동일한 UUID를 사용한다 — 추가 라운드트립 없이 일치가 보장된다.

### `MapStore` 추가 사항 (`src/stores/MapStore.ts`)

GPX 폴리라인 지원 추가:

```ts
// 새 observable
gpxPolyline: naver.maps.Polyline | null = null  // makeAutoObservable 옵션에 observable.ref로 선언, map과 동일

// 새 메서드
drawGpxRoute(gpxText: string): void
  // 1. DOMParser로 gpxText 파싱
  // 2. <trkpt lat lon> 요소 추출
  // 3. 포인트 없으면 error = true 설정 후 반환
  // 4. 추출한 LatLng 배열로 naver.maps.Polyline 생성, map을 this.map으로 설정
  // 5. 첫 번째 trackpoint로 지도 중심 이동 (줌 레벨 유지)
  // 6. gpxPolyline에 폴리라인 저장

clearGpxRoute(): void
  // 폴리라인을 지도에서 제거 (polyline.setMap(null)), gpxPolyline = null

// destroy()가 clearGpxRoute()도 호출하도록 업데이트
// 언마운트 정리 시 항상 destroy()를 사용할 것 — clearGpxRoute()를 직접 호출하지 않는다
```

GPX 파싱은 브라우저 기본 `DOMParser`를 사용한다 — 별도 npm 의존성 없음.

**카메라 동작:** `drawGpxRoute`는 `this.map.setCenter(firstLatLng)`으로 첫 번째 trackpoint로 패닝하지만 줌 레벨은 변경하지 않는다. 임의 GPX 파일에 적합한 줌을 추측하지 않고 예측 가능한 동작을 제공한다.

## 화면

### `GroupPage` (`/group`)

- 마운트 시: `GroupStore.load()` 호출
- 로딩 상태: 스피너
- 에러 상태: "그룹을 불러올 수 없습니다" 메시지
- 빈 상태: "아직 그룹이 없습니다" 메시지
- 목록: 각 행에 `group.name` 표시, 탭 시 `/group/{id}`로 이동
- FAB (`+`) 우측 하단 → `/group/new`로 이동

### `GroupCreatePage` (`/group/new`)

레이아웃: 뒤로가기 버튼이 있는 전체 화면 다크 페이지, 아래에 폼.

- 뒤로가기 버튼 (좌측 상단) → `/group`
- 그룹명: 텍스트 입력
- GPX 파일: `.gpx`만 허용하는 파일 입력, 선택된 파일명 또는 "파일 선택" 표시
- 제출 버튼: `!isValid || submitting`이면 비활성화, 제출 중 스피너 표시
- 성공 시: `/group`으로 이동
- 에러 시: `toast.error(store.error)`

### `GroupMapPage` (`/group/:id`)

현재 구현에서의 변경 사항:

1. **그룹 조회** — Supabase에서 id로 그룹 조회 (`created_by = auth.uid()` 조건). 없으면 → `<Navigate to="/group" replace />`
2. **Signed URL 생성** — `group.gpx_path`에 대한 Signed URL 생성
3. **GPX 텍스트 가져오기** — Signed URL에서 GPX 텍스트 fetch

**로딩 상태:** `GroupMapPage` 내부에 로컬 `useState<boolean>` (`gpxLoading`)을 사용한다. `gpxLoading`이 true인 동안 전체 화면 스피너 오버레이를 표시한다 (effect 시작부터 fetch 완료 또는 실패까지). 이는 지도 SDK 및 GPX 파싱 실패를 담당하는 `MapStore.error`와 별개이다.

**비동기 처리 및 의존성 배열:** Supabase fetch와 GPX 다운로드는 `store.initMap(el)`도 호출하는 단일 `useEffect`에서 처리된다. `initMap`은 동기적 — Naver SDK를 즉시 초기화한다. `initMap`이 반환되면 `store.map`이 설정되고 `drawGpxRoute`를 안전하게 호출할 수 있다. effect의 의존성 배열은 `[store]`; `useParams`의 `id`는 의도적으로 제외한다 (현재 `group` 제외와 동일한 이유 — `id` 변경 시 `initMap`/`destroy` 재실행은 Naver Maps SDK 라이프사이클을 깨뜨린다). React Router가 각 그룹 지도 뷰에서 새 `GroupMapPage` 인스턴스를 마운트하므로 stale `id`는 문제가 되지 않는다.

```ts
const [gpxLoading, setGpxLoading] = useState(true);

useEffect(() => {
  if (!mapRef.current) return;
  store.initMap(mapRef.current);
  if (store.error) { setGpxLoading(false); return; }

  let cancelled = false;
  (async () => {
    // 1. Supabase에서 id로 그룹 조회
    // 2. 없으면 /group으로 navigate 후 return
    // 3. group.gpx_path에 대한 signed URL 생성
    // 4. signed URL에서 GPX 텍스트 fetch
    // 5. if (!cancelled) store.drawGpxRoute(gpxText)
    if (!cancelled) setGpxLoading(false);
  })();

  return () => {
    cancelled = true;
    store.destroy();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [store]);
```

`cancelled` 플래그는 이미 언마운트된 컴포넌트에서 상태 업데이트를 방지한다.

4. `store.initMap(el)` 성공 후 (`store.map` 설정됨), `store.drawGpxRoute(gpxText)` 호출
5. 정리: `store.clearGpxRoute()`는 `store.destroy()` 내부에서 호출됨

뒤로가기 버튼은 네비게이션 히스토리 깊이와 무관하게 예측 가능한 동작을 위해 `navigate(-1)` 대신 `/group`으로 이동한다.

## 라우팅

`App.tsx` 전체 라우트 트리 (`ProtectedRoute`/`MainLayout` 부모 아래에 모든 그룹 라우트가 중첩됨):

```tsx
<Route
  path="/"
  element={
    <ProtectedRoute>
      <MainLayout />
    </ProtectedRoute>
  }
>
  <Route index element={<Navigate to="/group" replace />} />
  <Route path="group" element={<GroupPage />} />
  <Route path="group/new" element={<GroupCreatePage />} />
  <Route path="group/:id" element={<GroupMapPage />} />
  <Route path="history" element={<HistoryPage />} />
  <Route path="profile" element={<ProfilePage />} />
</Route>
```

React Router v6는 동적 세그먼트보다 정적 세그먼트를 높게 점수 매기므로 순서와 무관하게 `group/new`가 `group/:id`보다 우선한다. 명확성을 위해 정적 라우트를 먼저 나열한다.

## 테스트 노트

- `GroupMapPage.test.tsx`는 현재 `DUMMY_GROUPS` 기반으로 테스트하며 Supabase 관련 mock이 없다. 이 기능 구현 후 `GroupMapPage`는 Supabase에서 데이터를 조회하므로 테스트 파일을 Supabase 호출을 mock하도록 전면 재작성해야 한다. 구현 계획에 반영할 것.
- `GroupStore`, `GroupCreateStore`는 `supabase` 클라이언트를 mock해서 테스트할 수 있다.
- `MapStore.drawGpxRoute` / `clearGpxRoute`는 GPX XML 문자열을 직접 전달해 테스트할 수 있다 (네트워크 불필요).

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/types/group.ts` | 신규 — `Group` 인터페이스 |
| `src/stores/GroupStore.ts` | 신규 — 목록 조회 |
| `src/stores/GroupCreateStore.ts` | 신규 — 생성 폼 + 업로드 |
| `src/stores/MapStore.ts` | `gpxPolyline`, `drawGpxRoute`, `clearGpxRoute` 추가; `destroy` 업데이트 |
| `src/pages/GroupPage.tsx` | 더미 데이터를 GroupStore로 교체, FAB 추가 |
| `src/pages/GroupCreatePage.tsx` | 신규 — 생성 폼 UI |
| `src/pages/GroupMapPage.tsx` | 더미 조회를 Supabase fetch + drawGpxRoute로 교체; 테스트 재작성 |
| `src/App.tsx` | `group/new` 라우트 추가 |
| `src/data/groups.ts` | 삭제 |

## 에러 처리

| 시나리오 | 동작 |
|---|---|
| 그룹 목록 조회 실패 | `error = true`, GroupPage에 에러 메시지 표시 |
| GPX 업로드 실패 | `GroupCreateStore.error` 설정, toast 표시 |
| 업로드 후 DB 삽입 실패 | toast 에러 표시; GPX 파일은 Storage에 남음 (현재는 허용) |
| 지도 뷰에서 그룹 없음 | `<Navigate to="/group" replace />` |
| 지도 뷰에서 GPX fetch 실패 | `MapStore.error = true`, 기존 에러 오버레이 표시 |
| GPX에 trackpoint 없음 | `MapStore.error = true`, 기존 에러 오버레이 표시 |
| Signed URL 만료 (60분) | `MapStore.error = true`, 동일한 에러 오버레이 표시; 사용자가 페이지를 새로고침해야 함 |

## 알려진 한계

- 업로드 후 DB 삽입 실패 시 GPX 파일이 Storage에 남음 (추후 정리)
- Signed URL은 60분 후 만료; 만료 시 기존 지도 에러 오버레이가 표시됨 — 사용자가 페이지를 새로고침해야 함 (현재는 허용)
