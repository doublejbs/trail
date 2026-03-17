# 그룹 생성 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 더미 그룹 데이터를 실제 Supabase 기반 그룹으로 교체하고, 그룹 생성(그룹명 + GPX 파일 업로드) 및 지도에 GPX 경로 표시 기능을 구현한다.

**Architecture:** `GroupStore`(목록 조회), `GroupCreateStore`(폼 + 업로드), `MapStore` GPX 추가 등 스토어 레이어를 먼저 TDD로 구현한 뒤 화면 레이어를 연결한다. `GroupMapPage`는 Supabase에서 그룹을 조회하고 Signed URL로 GPX를 가져와 `MapStore.drawGpxRoute()`로 경로를 그린다.

**Tech Stack:** React 18, TypeScript, MobX + mobx-react-lite, Supabase (auth/db/storage), Naver Maps JS SDK v3, React Router v6, Vitest + React Testing Library, sonner (toast)

---

## Chunk 1: 타입 + GroupStore + GroupCreateStore

### Task 1: Group 타입 파일 생성

**Files:**
- Create: `src/types/group.ts`

- [ ] **Step 1: 파일 생성**

```ts
export interface Group {
  id: string;
  name: string;
  created_by: string;
  gpx_path: string;
  created_at: string;
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/types/group.ts
git commit -m "feat: add Group type"
```

---

### Task 2: GroupStore 생성 (TDD)

**Files:**
- Create: `src/stores/GroupStore.ts`
- Create: `src/stores/GroupStore.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/stores/GroupStore.test.ts` 생성:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroupStore } from './GroupStore';

const { mockOrder } = vi.hoisted(() => ({
  mockOrder: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: (...args: unknown[]) => mockOrder(...args),
      }),
    }),
  },
}));

describe('GroupStore', () => {
  let store: GroupStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new GroupStore();
  });

  describe('초기 상태', () => {
    it('groups가 빈 배열', () => {
      expect(store.groups).toEqual([]);
    });

    it('loading이 true', () => {
      expect(store.loading).toBe(true);
    });

    it('error가 false', () => {
      expect(store.error).toBe(false);
    });
  });

  describe('load()', () => {
    it('성공 시 groups 설정 및 loading=false', async () => {
      const fakeGroups = [
        { id: 'g1', name: '한라산 팀', created_by: 'u1', gpx_path: 'u1/g1.gpx', created_at: '2026-01-01T00:00:00Z' },
      ];
      mockOrder.mockResolvedValue({ data: fakeGroups, error: null });

      await store.load();

      expect(store.groups).toEqual(fakeGroups);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(false);
    });

    it('실패 시 error=true 및 loading=false', async () => {
      mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });

      await store.load();

      expect(store.error).toBe(true);
      expect(store.loading).toBe(false);
      expect(store.groups).toEqual([]);
    });

    it('두 번째 load() 호출 시 loading=true로 리셋', async () => {
      // 첫 번째 load() 완료 → loading이 false가 됨을 확인
      mockOrder.mockResolvedValue({ data: [], error: null });
      await store.load();
      expect(store.loading).toBe(false);

      // 두 번째 load() 시작 시 loading이 true로 리셋되는지 확인
      let loadingDuringFetch: boolean | undefined;
      mockOrder.mockImplementation(() => {
        loadingDuringFetch = store.loading;
        return Promise.resolve({ data: [], error: null });
      });
      await store.load();
      expect(loadingDuringFetch).toBe(true);
    });

    it('created_at 내림차순 정렬로 조회', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null });
      await store.load();
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/stores/GroupStore.test.ts
```

Expected: 파일 없음 → 전체 실패

- [ ] **Step 3: GroupStore 구현**

`src/stores/GroupStore.ts` 생성:

```ts
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';

class GroupStore {
  public groups: Group[] = [];
  public loading: boolean = true;
  public error: boolean = false;

  public constructor() {
    makeAutoObservable(this);
  }

  public async load(): Promise<void> {
    this.loading = true;
    this.error = false;

    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false });

    runInAction(() => {
      if (error) {
        this.error = true;
      } else {
        this.groups = data ?? [];
      }
      this.loading = false;
    });
  }
}

export { GroupStore };
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/stores/GroupStore.test.ts
```

Expected: 7개 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/stores/GroupStore.ts src/stores/GroupStore.test.ts
git commit -m "feat: add GroupStore with Supabase group list fetch"
```

---

### Task 3: GroupCreateStore 생성 (TDD)

**Files:**
- Create: `src/stores/GroupCreateStore.ts`
- Create: `src/stores/GroupCreateStore.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/stores/GroupCreateStore.test.ts` 생성:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GroupCreateStore } from './GroupCreateStore';

const { mockGetUser, mockUpload, mockInsert } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpload: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mockUpload(...args),
      }),
    },
    from: () => ({
      insert: (...args: unknown[]) => mockInsert(...args),
    }),
  },
}));

const FAKE_USER_ID = 'user-abc-123';
const FAKE_GROUP_ID = 'group-uuid-456';

describe('GroupCreateStore', () => {
  let store: GroupCreateStore;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => FAKE_GROUP_ID });
    mockGetUser.mockResolvedValue({ data: { user: { id: FAKE_USER_ID } }, error: null });
    mockUpload.mockResolvedValue({ data: {}, error: null });
    mockInsert.mockResolvedValue({ data: {}, error: null });
    store = new GroupCreateStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('초기 상태', () => {
    it('name이 빈 문자열', () => expect(store.name).toBe(''));
    it('file이 null', () => expect(store.file).toBeNull());
    it('submitting이 false', () => expect(store.submitting).toBe(false));
    it('error가 null', () => expect(store.error).toBeNull());
  });

  describe('isValid', () => {
    it('name이 비어있으면 false', () => {
      store.setFile(new File([''], 'test.gpx'));
      expect(store.isValid).toBe(false);
    });

    it('file이 null이면 false', () => {
      store.setName('My Group');
      expect(store.isValid).toBe(false);
    });

    it('name과 file 모두 있으면 true', () => {
      store.setName('My Group');
      store.setFile(new File([''], 'test.gpx'));
      expect(store.isValid).toBe(true);
    });

    it('name이 공백만 있으면 false', () => {
      store.setName('   ');
      store.setFile(new File([''], 'test.gpx'));
      expect(store.isValid).toBe(false);
    });
  });

  describe('submit()', () => {
    beforeEach(() => {
      store.setName('테스트 그룹');
      store.setFile(new File(['gpx content'], 'route.gpx'));
    });

    it('성공 시 groupId 반환', async () => {
      const result = await store.submit();
      expect(result).toBe(FAKE_GROUP_ID);
    });

    it('올바른 경로로 파일 업로드', async () => {
      await store.submit();
      expect(mockUpload).toHaveBeenCalledWith(
        `${FAKE_USER_ID}/${FAKE_GROUP_ID}.gpx`,
        expect.any(File),
      );
    });

    it('올바른 값으로 groups 행 삽입', async () => {
      await store.submit();
      expect(mockInsert).toHaveBeenCalledWith({
        id: FAKE_GROUP_ID,
        name: '테스트 그룹',
        created_by: FAKE_USER_ID,
        gpx_path: `${FAKE_USER_ID}/${FAKE_GROUP_ID}.gpx`,
      });
    });

    it('성공 후 submitting=false', async () => {
      await store.submit();
      expect(store.submitting).toBe(false);
    });

    it('getUser 실패 시 null 반환 + error 설정 + submitting=false', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: '인증 오류' } });
      const result = await store.submit();
      expect(result).toBeNull();
      expect(store.error).toBeTruthy();
      expect(store.submitting).toBe(false);
    });

    it('업로드 실패 시 null 반환 + error 메시지 설정 + submitting=false', async () => {
      mockUpload.mockResolvedValue({ data: null, error: { message: '업로드 실패' } });
      const result = await store.submit();
      expect(result).toBeNull();
      expect(store.error).toBe('업로드 실패');
      expect(store.submitting).toBe(false);
    });

    it('DB 삽입 실패 시 null 반환 + error 메시지 설정 + submitting=false', async () => {
      mockInsert.mockResolvedValue({ data: null, error: { message: 'DB 오류' } });
      const result = await store.submit();
      expect(result).toBeNull();
      expect(store.error).toBe('DB 오류');
      expect(store.submitting).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/stores/GroupCreateStore.test.ts
```

Expected: 파일 없음 → 전체 실패

- [ ] **Step 3: GroupCreateStore 구현**

`src/stores/GroupCreateStore.ts` 생성:

```ts
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';

class GroupCreateStore {
  public name: string = '';
  public file: File | null = null;
  public submitting: boolean = false;
  public error: string | null = null;

  public constructor() {
    makeAutoObservable(this);
  }

  public setName(v: string): void {
    this.name = v;
  }

  public setFile(f: File | null): void {
    this.file = f;
  }

  public get isValid(): boolean {
    return this.name.trim() !== '' && this.file !== null;
  }

  public async submit(): Promise<string | null> {
    this.submitting = true;
    this.error = null;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      runInAction(() => {
        this.error = '인증 오류가 발생했습니다';
        this.submitting = false;
      });
      return null;
    }

    const userId = userData.user.id;
    const groupId = crypto.randomUUID();
    const path = `${userId}/${groupId}.gpx`;

    const { error: uploadError } = await supabase.storage
      .from('gpx-files')
      .upload(path, this.file!);

    if (uploadError) {
      runInAction(() => {
        this.error = uploadError.message;
        this.submitting = false;
      });
      return null;
    }

    const { error: insertError } = await supabase
      .from('groups')
      .insert({ id: groupId, name: this.name, created_by: userId, gpx_path: path });

    if (insertError) {
      runInAction(() => {
        this.error = insertError.message;
        this.submitting = false;
      });
      return null;
    }

    runInAction(() => {
      this.submitting = false;
    });
    return groupId;
  }
}

export { GroupCreateStore };
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/stores/GroupCreateStore.test.ts
```

Expected: 15개 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/stores/GroupCreateStore.ts src/stores/GroupCreateStore.test.ts
git commit -m "feat: add GroupCreateStore with GPX upload and group insert"
```

---

## Chunk 2: MapStore GPX 추가

### Task 4: MapStore에 gpxPolyline / drawGpxRoute / clearGpxRoute 추가 (TDD)

**Files:**
- Modify: `src/stores/MapStore.ts`
- Modify: `src/stores/MapStore.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`src/stores/MapStore.test.ts`의 기존 `mockNaverMaps` 선언을 아래로 교체하고, 파일 끝에 새 `describe` 블록을 추가한다.

기존 4번째 줄을 찾아:
```ts
const mockMap = { setCenter: vi.fn() };
const mockNaverMaps = {
  Map: vi.fn(function () { return mockMap; }),
  LatLng: vi.fn(function (lat: number, lng: number) { return { lat, lng }; }),
};
```

아래로 교체:
```ts
const mockPolyline = { setMap: vi.fn() };
const mockMap = { setCenter: vi.fn(), destroy: vi.fn() };
const mockNaverMaps = {
  Map: vi.fn(function () { return mockMap; }),
  LatLng: vi.fn(function (lat: number, lng: number) { return { lat, lng }; }),
  Polyline: vi.fn(function () { return mockPolyline; }),
};
```

파일의 **마지막 `});` 바로 앞** (즉, `describe('MapStore', () => { ... })` 블록 내부 끝)에 추가한다. `store` 변수는 이미 바깥 `describe('MapStore')` 블록에 선언되어 있으므로 그대로 참조할 수 있다. GPX 상수는 파일 맨 위(기존 `const mockPolyline` 선언 다음)에 추가한다.

파일 맨 위 mock 선언 블록 다음에 상수 추가:

```ts
const GPX_TWO_POINTS = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <trk><trkseg>
    <trkpt lat="37.5" lon="126.9"></trkpt>
    <trkpt lat="37.6" lon="127.0"></trkpt>
  </trkseg></trk>
</gpx>`;

const GPX_NO_POINTS = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"></gpx>`;
```

그리고 `describe('MapStore', ...)` 블록의 마지막 `});` **바로 앞**에 추가:

```ts
  describe('GPX 기능', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNaverMaps.Map.mockImplementation(function () { return mockMap; });
    mockNaverMaps.Polyline.mockImplementation(function () { return mockPolyline; });
    vi.stubEnv('VITE_NAVER_MAP_CLIENT_ID', 'test-key');
    store = new MapStore();
    (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
    store.initMap(document.createElement('div'));
  });

  describe('drawGpxRoute()', () => {
    it('유효한 GPX로 gpxPolyline 설정', () => {
      store.drawGpxRoute(GPX_TWO_POINTS);
      expect(store.gpxPolyline).toBe(mockPolyline);
      expect(store.error).toBe(false);
    });

    it('trackpoint 없으면 error=true, gpxPolyline=null', () => {
      store.drawGpxRoute(GPX_NO_POINTS);
      expect(store.error).toBe(true);
      expect(store.gpxPolyline).toBeNull();
    });

    it('첫 번째 trackpoint로 지도 중심 이동', () => {
      store.drawGpxRoute(GPX_TWO_POINTS);
      expect(mockMap.setCenter).toHaveBeenCalledWith({ lat: 37.5, lng: 126.9 });
    });

    it('올바른 좌표 배열로 Polyline 생성', () => {
      store.drawGpxRoute(GPX_TWO_POINTS);
      expect(mockNaverMaps.Polyline).toHaveBeenCalledWith(
        expect.objectContaining({
          map: mockMap,
          path: [
            { lat: 37.5, lng: 126.9 },
            { lat: 37.6, lng: 127.0 },
          ],
        }),
      );
    });
  });

  describe('clearGpxRoute()', () => {
    it('polyline을 지도에서 제거하고 gpxPolyline=null', () => {
      store.drawGpxRoute(GPX_TWO_POINTS);
      store.clearGpxRoute();
      expect(mockPolyline.setMap).toHaveBeenCalledWith(null);
      expect(store.gpxPolyline).toBeNull();
    });

    it('gpxPolyline이 null일 때 오류 없이 실행', () => {
      expect(() => store.clearGpxRoute()).not.toThrow();
    });
  });

  describe('destroy() GPX 정리', () => {
    it('destroy() 호출 시 gpxPolyline 제거', () => {
      store.drawGpxRoute(GPX_TWO_POINTS);
      store.destroy();
      expect(mockPolyline.setMap).toHaveBeenCalledWith(null);
      expect(store.gpxPolyline).toBeNull();
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```

Expected: 기존 테스트는 PASS, 새 GPX 테스트는 FAIL (`gpxPolyline is not a function` 등)

- [ ] **Step 3: MapStore 업데이트**

`src/stores/MapStore.ts`를 아래 전체 내용으로 교체:

```ts
import { makeAutoObservable, observable, runInAction } from "mobx";

class MapStore {
  public map: naver.maps.Map | null = null;
  public error: boolean = false;
  public gpxPolyline: naver.maps.Polyline | null = null;

  public constructor() {
    makeAutoObservable(this, { map: observable.ref, gpxPolyline: observable.ref });
  }

  public initMap(el: HTMLDivElement): void {
    if (this.map) return;

    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
    if (!clientId) {
      console.warn("VITE_NAVER_MAP_CLIENT_ID is not set");
      this.error = true;
      return;
    }

    if (!window.naver?.maps?.Map) {
      console.error(
        "Naver Maps SDK not loaded — check script tag and API key authorization for this domain",
      );
      this.error = true;
      return;
    }

    (window as Window & { navermap_authFailure?: () => void }).navermap_authFailure = () => {
      console.error("Naver Maps auth failed — check API key and authorized domains in NCP console");
      runInAction(() => { this.error = true; });
    };

    try {
      const instance = new window.naver.maps.Map(el, {
        center: new window.naver.maps.LatLng(37.5665, 126.978),
        zoom: 14,
      });
      this.map = instance;
    } catch (e) {
      console.error("Naver Maps init failed:", e);
      this.error = true;
    }
  }

  public drawGpxRoute(gpxText: string): void {
    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxText, 'application/xml');
    const trkpts = Array.from(doc.getElementsByTagName('trkpt'));

    if (trkpts.length === 0) {
      this.error = true;
      return;
    }

    const path = trkpts.map((pt) =>
      new window.naver.maps.LatLng(
        parseFloat(pt.getAttribute('lat')!),
        parseFloat(pt.getAttribute('lon')!),
      ),
    );

    const polyline = new window.naver.maps.Polyline({
      map: this.map!,
      path,
      strokeColor: '#FF5722',
      strokeWeight: 4,
      strokeOpacity: 0.8,
    });

    this.map!.setCenter(path[0]);
    this.gpxPolyline = polyline;
  }

  public clearGpxRoute(): void {
    this.gpxPolyline?.setMap(null);
    this.gpxPolyline = null;
  }

  public destroy(): void {
    this.clearGpxRoute();
    this.map?.destroy();
    this.map = null;
  }

  public locate(): void {
    if (!this.map || !navigator.geolocation) {
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      this.map!.setCenter(new window.naver.maps.LatLng(latitude, longitude));
    });
  }
}

export { MapStore };
```

- [ ] **Step 4: 전체 MapStore 테스트 통과 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```

Expected: 전체 PASS (기존 + 새 GPX 테스트 포함)

- [ ] **Step 5: 커밋**

```bash
git add src/stores/MapStore.ts src/stores/MapStore.test.ts
git commit -m "feat: add drawGpxRoute, clearGpxRoute, gpxPolyline to MapStore"
```

---

## Chunk 3: 화면 + 라우팅

### Task 5: GroupPage 업데이트 — GroupStore 연동 + FAB

**Files:**
- Modify: `src/pages/GroupPage.tsx`

- [ ] **Step 1: GroupPage.tsx 전체 교체**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Plus } from 'lucide-react';
import { GroupStore } from '../stores/GroupStore';

export const GroupPage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new GroupStore());

  useEffect(() => {
    store.load();
  }, [store]);

  if (store.loading) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (store.error) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <p className="text-sm text-neutral-400">그룹을 불러올 수 없습니다</p>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-y-auto bg-black">
      {store.groups.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <p className="text-sm text-neutral-400">아직 그룹이 없습니다</p>
        </div>
      ) : (
        store.groups.map((group) => (
          <button
            key={group.id}
            onClick={() => navigate(`/group/${group.id}`)}
            className="w-full px-4 py-4 text-left text-white border-b border-neutral-800 active:bg-neutral-800"
          >
            {group.name}
          </button>
        ))
      )}
      <button
        onClick={() => navigate('/group/new')}
        aria-label="그룹 만들기"
        className="absolute right-4 bottom-4 w-12 h-12 bg-white text-black rounded-full flex items-center justify-center shadow-lg active:bg-neutral-100"
      >
        <Plus size={22} />
      </button>
    </div>
  );
});
```

- [ ] **Step 2: 커밋**

```bash
git add src/pages/GroupPage.tsx
git commit -m "feat: connect GroupPage to GroupStore, add FAB"
```

---

### Task 6: GroupCreatePage 생성

**Files:**
- Create: `src/pages/GroupCreatePage.tsx`

- [ ] **Step 1: GroupCreatePage.tsx 생성**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { toast } from 'sonner';
import { GroupCreateStore } from '../stores/GroupCreateStore';

export const GroupCreatePage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new GroupCreateStore());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const groupId = await store.submit();
    if (groupId) {
      navigate('/group');
    } else {
      toast.error(store.error ?? '오류가 발생했습니다');
    }
  };

  return (
    <div className="h-full bg-black text-white flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 py-4 border-b border-neutral-800">
        <button
          onClick={() => navigate('/group')}
          className="text-white text-sm"
        >
          ← 뒤로
        </button>
        <h1 className="ml-4 text-base font-semibold">그룹 만들기</h1>
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-neutral-400">그룹명</label>
          <input
            type="text"
            value={store.name}
            onChange={(e) => store.setName(e.target.value)}
            className="bg-neutral-900 text-white rounded-lg px-3 py-2 text-sm outline-none border border-neutral-700 focus:border-white"
            placeholder="그룹명을 입력하세요"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-neutral-400">GPX 파일</label>
          <label className="bg-neutral-900 rounded-lg px-3 py-2 text-sm border border-neutral-700 cursor-pointer flex items-center">
            <span className="text-neutral-400">
              {store.file ? store.file.name : '파일 선택'}
            </span>
            <input
              type="file"
              accept=".gpx"
              className="hidden"
              onChange={(e) => store.setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={!store.isValid || store.submitting}
          className="w-full py-2 rounded-lg bg-white text-black font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {store.submitting && (
            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          )}
          그룹 만들기
        </button>
      </form>
    </div>
  );
});
```

- [ ] **Step 2: 커밋**

```bash
git add src/pages/GroupCreatePage.tsx
git commit -m "feat: add GroupCreatePage with name input and GPX file upload"
```

---

### Task 7: App.tsx에 group/new 라우트 추가

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: App.tsx 전체 교체**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { MainLayout } from './pages/MainLayout';
import { GroupPage } from './pages/GroupPage';
import { GroupCreatePage } from './pages/GroupCreatePage';
import { GroupMapPage } from './pages/GroupMapPage';
import { HistoryPage } from './pages/HistoryPage';
import { ProfilePage } from './pages/ProfilePage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
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
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/App.tsx
git commit -m "feat: add group/new route to App.tsx"
```

---

## Chunk 4: GroupMapPage 재작성 + 정리

### Task 8: GroupMapPage 재작성 + 테스트 재작성

**Files:**
- Modify: `src/pages/GroupMapPage.tsx`
- Modify: `src/pages/GroupMapPage.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/pages/GroupMapPage.test.tsx` 전체 교체:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GroupMapPage } from './GroupMapPage';

const { mockStore, mockNavigate, mockFrom, mockCreateSignedUrl } = vi.hoisted(() => ({
  mockStore: {
    map: null as naver.maps.Map | null,
    error: false,
    gpxPolyline: null,
    initMap: vi.fn(),
    destroy: vi.fn(),
    locate: vi.fn(),
    drawGpxRoute: vi.fn(),
    clearGpxRoute: vi.fn(),
  },
  mockNavigate: vi.fn(),
  mockFrom: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
}));

vi.mock('../stores/MapStore', () => ({
  MapStore: vi.fn(function () { return mockStore; }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: {
      from: () => ({
        createSignedUrl: (...args: unknown[]) => mockCreateSignedUrl(...args),
      }),
    },
  },
}));

const FAKE_GROUP = {
  id: 'group-uuid-1',
  name: '한라산 팀',
  created_by: 'user-1',
  gpx_path: 'user-1/group-uuid-1.gpx',
  created_at: '2026-01-01T00:00:00Z',
};

const FAKE_GPX = `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="37.5" lon="126.9"></trkpt></trkseg></trk></gpx>`;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/group/:id" element={<GroupMapPage />} />
        <Route path="/group" element={<div>group list</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('GroupMapPage', () => {
  beforeEach(() => {
    mockStore.map = null;
    mockStore.error = false;
    vi.clearAllMocks();

    // 기본: 그룹 조회 성공
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: FAKE_GROUP, error: null }),
        }),
      }),
    });

    // 기본: Signed URL 생성 성공
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/signed' },
      error: null,
    });

    // 기본: GPX fetch 성공
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(FAKE_GPX),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('그룹을 찾지 못하면 /group으로 리다이렉트', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
        }),
      }),
    });

    renderAt('/group/nonexistent-id');

    await waitFor(() => {
      expect(screen.getByText('group list')).toBeInTheDocument();
    });
  });

  it('그룹 로딩 중 스피너 표시', () => {
    // fetch가 resolve되지 않도록 지연
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => new Promise(() => {}), // 영원히 pending
        }),
      }),
    });

    renderAt('/group/group-uuid-1');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('그룹 로드 후 map-container 렌더링', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
  });

  it('뒤로가기 버튼에 그룹명 표시', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /한라산 팀/ })).toBeInTheDocument();
    });
  });

  it('뒤로가기 버튼 클릭 시 navigate("/group") 호출', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => screen.getByRole('button', { name: /한라산 팀/ }));
    fireEvent.click(screen.getByRole('button', { name: /한라산 팀/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/group');
  });

  it('로드 성공 후 drawGpxRoute 호출', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(mockStore.drawGpxRoute).toHaveBeenCalledWith(FAKE_GPX);
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```

Expected: 실패 (GroupMapPage가 아직 DUMMY_GROUPS를 사용하므로)

- [ ] **Step 3: GroupMapPage 전체 교체**

```tsx
import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Crosshair } from 'lucide-react';
import { MapStore } from '../stores/MapStore';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';

export const GroupMapPage = observer(() => {
  const { id } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const [store] = useState(() => new MapStore());
  const [gpxLoading, setGpxLoading] = useState(true);
  const [group, setGroup] = useState<Group | null | undefined>(undefined);

  useEffect(() => {
    if (!mapRef.current) return;

    store.initMap(mapRef.current);
    if (store.error) {
      setGpxLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      // 1. Supabase에서 그룹 조회
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', id)
        .single();

      if (cancelled) return;

      if (error || !data) {
        setGroup(null);
        setGpxLoading(false);
        return;
      }

      setGroup(data as Group);

      // 2. Signed URL 생성
      const { data: urlData, error: urlError } = await supabase.storage
        .from('gpx-files')
        .createSignedUrl((data as Group).gpx_path, 3600);

      if (cancelled) return;

      if (urlError || !urlData?.signedUrl) {
        store.error = true;
        setGpxLoading(false);
        return;
      }

      // 3. GPX 텍스트 fetch
      try {
        const response = await fetch(urlData.signedUrl);
        if (!response.ok) throw new Error('GPX fetch failed');
        const gpxText = await response.text();
        if (!cancelled) {
          store.drawGpxRoute(gpxText);
        }
      } catch {
        if (!cancelled) {
          store.error = true;
        }
      }

      if (!cancelled) setGpxLoading(false);
    })();

    return () => {
      cancelled = true;
      store.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // 로딩 중 (그룹 조회 전)
  if (group === undefined || gpxLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div
          role="status"
          className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"
        />
      </div>
    );
  }

  // 그룹 없음 → 리다이렉트
  if (group === null) return <Navigate to="/group" replace />;

  return (
    <div className="absolute inset-0">
      {/* 네이버 지도 컨테이너 */}
      <div
        ref={mapRef}
        data-testid="map-container"
        className="absolute inset-0 w-full h-full"
      />

      {/* 에러 오버레이 */}
      {store.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
          <p className="text-sm text-neutral-500">지도를 불러올 수 없습니다</p>
        </div>
      )}

      {/* 내 위치 버튼 */}
      {store.map && (
        <div className="absolute right-3 bottom-3">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => store.locate()}
            aria-label="내 위치"
            className="bg-white hover:bg-neutral-50 shadow-md"
          >
            <Crosshair size={18} className="text-neutral-700" />
          </Button>
        </div>
      )}

      {/* 뒤로가기 버튼 */}
      <div className="absolute top-4 left-4">
        <button
          onClick={() => navigate('/group')}
          className="bg-white/90 text-black px-3 py-1 rounded-full text-sm font-medium shadow"
        >
          ← {group.name}
        </button>
      </div>
    </div>
  );
});
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```

Expected: 6개 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/pages/GroupMapPage.tsx src/pages/GroupMapPage.test.tsx
git commit -m "feat: rewrite GroupMapPage to fetch from Supabase and draw GPX route"
```

---

### Task 9: src/data/groups.ts 삭제 + 전체 테스트 실행

**Files:**
- Delete: `src/data/groups.ts`

- [ ] **Step 1: 파일 삭제**

```bash
git rm src/data/groups.ts
```

- [ ] **Step 2: 전체 테스트 실행**

```bash
npx vitest run
```

Expected: 전체 PASS — `src/data/groups.ts`에 대한 참조가 없어야 함

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

Expected: TypeScript 에러 없이 빌드 성공

- [ ] **Step 4: 커밋**

```bash
git commit -m "feat: remove dummy group data — groups now backed by Supabase"
```
