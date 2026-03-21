# Course Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 기록 tab with a 코스 tab where users can upload GPX routes, browse public courses, and interact via likes and comments.

**Architecture:** MobX stores own all async state and business logic; pages are thin observers that render store state. GPX is parsed with native `DOMParser` (same approach as existing `MapStore`) — the spec mentioned `@tmcw/togeojson` but native parsing is consistent with the existing codebase and avoids a new dependency. Course cards render lazy SVG thumbnails via Intersection Observer.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, MobX, Supabase (Postgres + Storage), Naver Maps SDK, Vitest, React Testing Library

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260321000000_courses.sql` | Create | Tables, RLS, storage policies, index |
| `src/types/course.ts` | Create | `Course`, `CourseLike`, `CourseComment` TS types |
| `src/lib/gpx.ts` | Create | Parse GPX coords, compute distance/elevation, normalise to SVG points |
| `src/lib/gpx.test.ts` | Create | Unit tests for gpx.ts |
| `src/stores/CourseUploadStore.ts` | Create | Upload form state + submit (Storage + DB) |
| `src/stores/CourseUploadStore.test.ts` | Create | Store unit tests |
| `src/stores/CourseStore.ts` | Create | Feed list state, filter, pagination |
| `src/stores/CourseStore.test.ts` | Create | Store unit tests |
| `src/stores/CourseDetailStore.ts` | Create | Course detail, like toggle, comments |
| `src/stores/CourseDetailStore.test.ts` | Create | Store unit tests |
| `src/components/CourseCard.tsx` | Create | Lazy SVG thumbnail + name/distance/likes |
| `src/components/CourseCard.test.tsx` | Create | Component tests |
| `src/pages/CoursePage.tsx` | Create | Feed page |
| `src/pages/CourseUploadPage.tsx` | Create | Upload form page |
| `src/pages/CourseDetailPage.tsx` | Create | Detail page (map + stats + likes + comments) |
| `src/components/BottomTabBar.tsx` | Modify | Replace 기록 tab with 코스 |
| `src/pages/MainLayout.tsx` | Modify | Add `/course/new` to `HIDE_TAB_BAR_PATHS` |
| `src/App.tsx` | Modify | Replace history route with course routes |
| `src/pages/HistoryPage.tsx` | Delete | No longer needed |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260321000000_courses.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- 1. courses table
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  tags             TEXT[],
  gpx_path         TEXT NOT NULL,
  distance_m       INT,
  elevation_gain_m INT,
  is_public        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON courses (is_public, created_at DESC);

-- ============================================================
-- 2. course_likes table
-- ============================================================
CREATE TABLE IF NOT EXISTS course_likes (
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, user_id)
);

-- ============================================================
-- 3. course_comments table
-- ============================================================
CREATE TABLE IF NOT EXISTS course_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. RLS: courses
-- ============================================================
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public courses are readable"
  ON courses FOR SELECT
  USING (is_public = true OR created_by = auth.uid());

CREATE POLICY "owner can insert courses"
  ON courses FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "owner can update courses"
  ON courses FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "owner can delete courses"
  ON courses FOR DELETE
  USING (created_by = auth.uid());

-- ============================================================
-- 5. RLS: course_likes
-- ============================================================
ALTER TABLE course_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "likes readable for accessible courses"
  ON course_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_id
        AND (courses.is_public = true OR courses.created_by = auth.uid())
    )
  );

CREATE POLICY "user can insert own like"
  ON course_likes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user can delete own like"
  ON course_likes FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- 6. RLS: course_comments
-- ============================================================
ALTER TABLE course_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments readable for accessible courses"
  ON course_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_id
        AND (courses.is_public = true OR courses.created_by = auth.uid())
    )
  );

CREATE POLICY "user can insert own comment"
  ON course_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user can delete own comment"
  ON course_comments FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- 7. Storage: course-gpx bucket policies
-- Note: create bucket "course-gpx" with public=false in Supabase dashboard first.
-- Then apply these storage policies via Supabase dashboard or SQL editor:
-- ============================================================
-- SELECT: authenticated users can read any object
CREATE POLICY "authenticated users can read course gpx"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'course-gpx'
    AND auth.role() = 'authenticated'
  );

-- INSERT: user can only insert to their own path prefix
CREATE POLICY "user can upload own course gpx"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'course-gpx'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- DELETE: user can only delete their own objects
CREATE POLICY "user can delete own course gpx"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'course-gpx'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

- [ ] **Step 2: Create the `course-gpx` bucket in the Supabase dashboard**

Go to Storage → New Bucket → name: `course-gpx`, public: off. This must be done before applying the migration, since the storage policies reference this bucket.

**Note:** Storage policy names must be unique across all policies on `storage.objects` (not just per-bucket). Use the names shown above (`"authenticated users can read course gpx"`, etc.) and verify there are no conflicts with existing policies in the project.

- [ ] **Step 3: Apply migration to Supabase**

```bash
# Option A — Supabase CLI (if linked)
supabase db push

# Option B — paste into Supabase SQL Editor and run
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260321000000_courses.sql
git commit -m "feat: add courses, course_likes, course_comments tables + RLS + storage policies"
```

---

## Task 2: Types

**Files:**
- Create: `src/types/course.ts`

- [ ] **Step 1: Write types**

```typescript
export interface Course {
  id: string;
  created_by: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  gpx_path: string;
  distance_m: number | null;
  elevation_gain_m: number | null;
  is_public: boolean;
  created_at: string;
}

export interface CourseLike {
  course_id: string;
  user_id: string;
}

export interface CourseComment {
  id: string;
  course_id: string;
  user_id: string;
  body: string;
  created_at: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/course.ts
git commit -m "feat: add Course, CourseLike, CourseComment types"
```

---

## Task 3: GPX Utilities

**Files:**
- Create: `src/lib/gpx.ts`
- Create: `src/lib/gpx.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/gpx.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseGpxCoords,
  computeDistanceM,
  computeElevationGainM,
  normaliseCoordsToSvgPoints,
} from './gpx';

const ONE_POINT_GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="37.5" lon="127.0"><ele>10</ele></trkpt>
</trkseg></trk></gpx>`;

const TWO_POINT_GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="37.5" lon="127.0"><ele>10</ele></trkpt>
  <trkpt lat="37.501" lon="127.001"><ele>20</ele></trkpt>
</trkseg></trk></gpx>`;

const NO_ELE_GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="37.5" lon="127.0"></trkpt>
  <trkpt lat="37.501" lon="127.001"></trkpt>
</trkseg></trk></gpx>`;

const INVALID_GPX = `not xml at all`;

describe('parseGpxCoords', () => {
  it('returns coords from valid GPX', () => {
    const coords = parseGpxCoords(TWO_POINT_GPX);
    expect(coords).toHaveLength(2);
    expect(coords[0]).toEqual({ lat: 37.5, lon: 127.0, ele: 10 });
    expect(coords[1]).toEqual({ lat: 37.501, lon: 127.001, ele: 20 });
  });

  it('returns null for invalid XML', () => {
    expect(parseGpxCoords(INVALID_GPX)).toBeNull();
  });

  it('returns null when no trkpt elements', () => {
    const empty = `<?xml version="1.0"?><gpx></gpx>`;
    expect(parseGpxCoords(empty)).toBeNull();
  });

  it('returns coords even when ele is missing (ele: null)', () => {
    const coords = parseGpxCoords(NO_ELE_GPX);
    expect(coords).not.toBeNull();
    expect(coords![0].ele).toBeNull();
  });
});

describe('computeDistanceM', () => {
  it('returns 0 for a single point', () => {
    const coords = parseGpxCoords(ONE_POINT_GPX)!;
    expect(computeDistanceM(coords)).toBe(0);
  });

  it('returns positive distance for two points', () => {
    const coords = parseGpxCoords(TWO_POINT_GPX)!;
    const dist = computeDistanceM(coords);
    expect(dist).toBeGreaterThan(0);
    // 37.5,127.0 → 37.501,127.001 is roughly 140 m
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(200);
  });
});

describe('computeElevationGainM', () => {
  it('returns null when no elevation data', () => {
    const coords = parseGpxCoords(NO_ELE_GPX)!;
    expect(computeElevationGainM(coords)).toBeNull();
  });

  it('returns 0 for single point', () => {
    const coords = parseGpxCoords(ONE_POINT_GPX)!;
    expect(computeElevationGainM(coords)).toBe(0);
  });

  it('counts only uphill segments', () => {
    const coords = [
      { lat: 0, lon: 0, ele: 10 },
      { lat: 0, lon: 0, ele: 20 }, // +10
      { lat: 0, lon: 0, ele: 15 }, // -5 (not counted)
      { lat: 0, lon: 0, ele: 25 }, // +10
    ];
    expect(computeElevationGainM(coords)).toBe(20);
  });
});

describe('normaliseCoordsToSvgPoints', () => {
  it('returns null for empty array', () => {
    expect(normaliseCoordsToSvgPoints([], 160, 100)).toBeNull();
  });

  it('returns a centre dot string for single point', () => {
    const result = normaliseCoordsToSvgPoints([{ lat: 37.5, lon: 127.0, ele: null }], 160, 100);
    expect(result).toBe('80,50');
  });

  it('normalises two extreme coords with padding applied', () => {
    // pad=4, dLon=1, dLat=1 → scale = min((160-8)/1, (100-8)/1) = min(152,92) = 92
    // coord(0,0): x=4, y=96  →  coord(1,1): x=96, y=4
    const coords = [
      { lat: 0, lon: 0, ele: null },
      { lat: 1, lon: 1, ele: null },
    ];
    const result = normaliseCoordsToSvgPoints(coords, 160, 100);
    expect(result).toBe('4,96 96,4');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/gpx.test.ts
```

Expected: multiple FAIL — `gpx.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/gpx.ts

export interface GpxCoord {
  lat: number;
  lon: number;
  ele: number | null;
}

/** Parse GPX XML string into an array of track-point coords.
 *  Returns null if XML is invalid or contains no trkpt elements. */
export function parseGpxCoords(gpxText: string): GpxCoord[] | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gpxText, 'application/xml');

  if (doc.querySelector('parsererror')) return null;

  const pts = Array.from(doc.getElementsByTagName('trkpt'));
  if (pts.length === 0) return null;

  const coords: GpxCoord[] = [];
  for (const pt of pts) {
    const lat = parseFloat(pt.getAttribute('lat') ?? '');
    const lon = parseFloat(pt.getAttribute('lon') ?? '');
    if (isNaN(lat) || isNaN(lon)) continue;
    const eleText = pt.querySelector('ele')?.textContent ?? null;
    const ele = eleText !== null && eleText !== '' ? parseFloat(eleText) : null;
    coords.push({ lat, lon, ele: ele !== null && isNaN(ele) ? null : ele });
  }

  return coords.length > 0 ? coords : null;
}

/** Haversine distance sum over all consecutive coord pairs, in metres. */
export function computeDistanceM(coords: GpxCoord[]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineM(coords[i - 1], coords[i]);
  }
  return Math.round(total);
}

function haversineM(a: GpxCoord, b: GpxCoord): number {
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Sum of all uphill elevation changes in metres.
 *  Returns null if no coords have elevation data. */
export function computeElevationGainM(coords: GpxCoord[]): number | null {
  const hasEle = coords.some((c) => c.ele !== null);
  if (!hasEle) return null;
  if (coords.length < 2) return 0;

  let gain = 0;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1].ele;
    const curr = coords[i].ele;
    if (prev !== null && curr !== null && curr > prev) {
      gain += curr - prev;
    }
  }
  return Math.round(gain);
}

/** Normalise lat/lon coords to SVG polyline points string within w×h viewport.
 *  Returns null for empty input.
 *  Returns centre dot for a single point. */
export function normaliseCoordsToSvgPoints(
  coords: GpxCoord[],
  w: number,
  h: number,
): string | null {
  if (coords.length === 0) return null;
  if (coords.length === 1) return `${w / 2},${h / 2}`;

  const lons = coords.map((c) => c.lon);
  const lats = coords.map((c) => c.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const dLon = maxLon - minLon;
  const dLat = maxLat - minLat;

  // Zero bounding box (all same point) → centre dot
  if (dLon === 0 && dLat === 0) return `${w / 2},${h / 2}`;

  // Preserve aspect ratio with 4px padding
  const pad = 4;
  const scaleX = dLon > 0 ? (w - pad * 2) / dLon : 1;
  const scaleY = dLat > 0 ? (h - pad * 2) / dLat : 1;
  const scale = Math.min(scaleX, scaleY);

  return coords
    .map((c) => {
      const x = pad + (c.lon - minLon) * scale;
      // SVG y is flipped relative to lat
      const y = h - pad - (c.lat - minLat) * scale;
      return `${Math.round(x)},${Math.round(y)}`;
    })
    .join(' ');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/gpx.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gpx.ts src/lib/gpx.test.ts
git commit -m "feat: GPX parsing and SVG normalisation utilities"
```

---

## Task 4: CourseUploadStore

**Files:**
- Create: `src/stores/CourseUploadStore.ts`
- Create: `src/stores/CourseUploadStore.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/stores/CourseUploadStore.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CourseUploadStore } from './CourseUploadStore';

const FAKE_UID = 'user-111';
const FAKE_COURSE_ID = 'course-uuid-222';

const { mockGetUser, mockUpload, mockInsert } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpload: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    storage: { from: () => ({ upload: (...a: unknown[]) => mockUpload(...a) }) },
    from: () => ({ insert: (...a: unknown[]) => mockInsert(...a) }),
  },
}));

// parseGpxCoords returns valid coords for any input in these tests
vi.mock('../lib/gpx', () => ({
  parseGpxCoords: vi.fn().mockReturnValue([
    { lat: 37.5, lon: 127.0, ele: 10 },
    { lat: 37.501, lon: 127.001, ele: 20 },
  ]),
  computeDistanceM: vi.fn().mockReturnValue(150),
  computeElevationGainM: vi.fn().mockReturnValue(10),
}));

describe('CourseUploadStore', () => {
  let store: CourseUploadStore;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => FAKE_COURSE_ID });
    mockGetUser.mockResolvedValue({ data: { user: { id: FAKE_UID } }, error: null });
    mockUpload.mockResolvedValue({ data: {}, error: null });
    mockInsert.mockResolvedValue({ data: {}, error: null });
    store = new CourseUploadStore();
  });

  afterEach(() => vi.unstubAllGlobals());

  describe('초기 상태', () => {
    it('name 빈 문자열', () => expect(store.name).toBe(''));
    it('file null', () => expect(store.file).toBeNull());
    it('gpxError null', () => expect(store.gpxError).toBeNull());
    it('submitting false', () => expect(store.submitting).toBe(false));
  });

  describe('isValid', () => {
    it('name과 file 모두 없으면 false', () => expect(store.isValid).toBe(false));

    it('name 없으면 false', async () => {
      await store.setFile(new File(['gpx'], 'r.gpx'));
      expect(store.isValid).toBe(false);
    });

    it('file 없으면 false', () => {
      store.setName('Route');
      expect(store.isValid).toBe(false);
    });

    it('gpxError 있으면 false', async () => {
      store.setName('Route');
      await store.setFile(new File(['bad'], 'r.gpx'));
      // @ts-expect-error — set error directly for test
      store.gpxError = 'invalid GPX';
      expect(store.isValid).toBe(false);
    });

    it('name + valid file = true', async () => {
      store.setName('Route');
      await store.setFile(new File(['gpx'], 'r.gpx'));
      expect(store.isValid).toBe(true);
    });
  });

  describe('submit()', () => {
    beforeEach(async () => {
      store.setName('My Route');
      await store.setFile(new File(['gpx content'], 'route.gpx'));
    });

    it('성공 시 courseId 반환', async () => {
      const result = await store.submit();
      expect(result).toBe(FAKE_COURSE_ID);
    });

    it('올바른 path로 Storage 업로드', async () => {
      await store.submit();
      expect(mockUpload).toHaveBeenCalledWith(
        `${FAKE_UID}/${FAKE_COURSE_ID}.gpx`,
        expect.any(File),
      );
    });

    it('올바른 값으로 courses 행 삽입', async () => {
      store.setDescription('Nice route');
      store.addTag('쉬움');
      await store.submit();
      expect(mockInsert).toHaveBeenCalledWith({
        id: FAKE_COURSE_ID,
        created_by: FAKE_UID,
        name: 'My Route',
        description: 'Nice route',
        tags: ['쉬움'],
        gpx_path: `${FAKE_UID}/${FAKE_COURSE_ID}.gpx`,
        distance_m: 150,
        elevation_gain_m: 10,
        is_public: true,
      });
    });

    it('업로드 실패 시 null 반환', async () => {
      mockUpload.mockResolvedValue({ error: { message: '업로드 실패' } });
      expect(await store.submit()).toBeNull();
      expect(store.error).toBe('업로드 실패');
    });

    it('성공 후 submitting=false', async () => {
      await store.submit();
      expect(store.submitting).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/stores/CourseUploadStore.test.ts
```

Expected: FAIL — store does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// src/stores/CourseUploadStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { parseGpxCoords, computeDistanceM, computeElevationGainM } from '../lib/gpx';
import type { GpxCoord } from '../lib/gpx';

class CourseUploadStore {
  public name: string = '';
  public description: string = '';
  public tags: string[] = [];
  public file: File | null = null;
  public gpxError: string | null = null;
  public submitting: boolean = false;
  public error: string | null = null;

  private coords: GpxCoord[] | null = null;

  public constructor() {
    makeAutoObservable(this);
  }

  public setName(v: string): void { this.name = v; }
  public setDescription(v: string): void { this.description = v; }

  public addTag(tag: string): void {
    if (!this.tags.includes(tag)) this.tags.push(tag);
  }

  public removeTag(tag: string): void {
    this.tags = this.tags.filter((t) => t !== tag);
  }

  public async setFile(f: File | null): Promise<void> {
    this.file = f;
    this.gpxError = null;
    this.coords = null;
    if (!f) return;

    const text = await f.text();
    const parsed = parseGpxCoords(text);
    runInAction(() => {
      if (!parsed) {
        this.gpxError = '유효하지 않은 GPX 파일입니다';
      } else {
        this.coords = parsed;
      }
    });
  }

  public get isValid(): boolean {
    return this.name.trim() !== '' && this.file !== null && this.gpxError === null;
  }

  public getCoords(): GpxCoord[] | null {
    return this.coords;
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
    const courseId = crypto.randomUUID();
    const path = `${userId}/${courseId}.gpx`;

    // Parse stats from file
    let distanceM: number | null = null;
    let elevationGainM: number | null = null;
    if (this.coords) {
      distanceM = computeDistanceM(this.coords);
      elevationGainM = computeElevationGainM(this.coords);
    }

    const { error: uploadError } = await supabase.storage
      .from('course-gpx')
      .upload(path, this.file!);

    if (uploadError) {
      runInAction(() => {
        this.error = uploadError.message;
        this.submitting = false;
      });
      return null;
    }

    const { error: insertError } = await supabase
      .from('courses')
      .insert({
        id: courseId,
        created_by: userId,
        name: this.name.trim(),
        description: this.description.trim() || null,
        tags: this.tags.length > 0 ? this.tags : null,
        gpx_path: path,
        distance_m: distanceM,
        elevation_gain_m: elevationGainM,
        is_public: true,
      });

    if (insertError) {
      runInAction(() => {
        this.error = insertError.message;
        this.submitting = false;
      });
      return null;
    }

    runInAction(() => { this.submitting = false; });
    return courseId;
  }
}

export { CourseUploadStore };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/stores/CourseUploadStore.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/CourseUploadStore.ts src/stores/CourseUploadStore.test.ts
git commit -m "feat: CourseUploadStore — GPX upload and course insert"
```

---

## Task 5: CourseStore (Feed)

**Files:**
- Create: `src/stores/CourseStore.ts`
- Create: `src/stores/CourseStore.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/stores/CourseStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CourseStore } from './CourseStore';

const FAKE_COURSES = [
  { id: 'c1', name: 'Route A', created_by: 'u1', distance_m: 5000, is_public: true, created_at: '2026-01-01' },
  { id: 'c2', name: 'Route B', created_by: 'u2', distance_m: null, is_public: true, created_at: '2026-01-02' },
];

const { mockGetUser, mockSelect } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: () => ({
      select: () => ({
        // both 'all' (eq is_public) and 'mine' (eq created_by) share this chain
        eq: () => ({
          order: () => ({
            range: (...a: unknown[]) => mockSelect(...a),
          }),
        }),
      }),
    }),
  },
}));

describe('CourseStore', () => {
  let store: CourseStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockSelect.mockResolvedValue({ data: FAKE_COURSES, error: null });
    store = new CourseStore();
  });

  it('초기 상태: courses 빈 배열, loading false', () => {
    expect(store.courses).toHaveLength(0);
    expect(store.loading).toBe(false);
  });

  it('fetchPage() 후 courses 채워짐', async () => {
    await store.fetchPage();
    expect(store.courses).toHaveLength(2);
    expect(store.loading).toBe(false);
  });

  it('fetchPage() 실패 시 error 설정', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'DB 오류' } });
    await store.fetchPage();
    expect(store.error).toBe('DB 오류');
  });

  it('setFilter("mine") 후 fetchPage 호출 시 내 코스만 조회', async () => {
    store.setFilter('mine');
    await store.fetchPage();
    expect(mockSelect).toHaveBeenCalled();
  });

  it('setFilter("all") → filter is "all"', () => {
    store.setFilter('all');
    expect(store.filter).toBe('all');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/stores/CourseStore.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```typescript
// src/stores/CourseStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import type { Course } from '../types/course';

type Filter = 'all' | 'mine';

const PAGE_SIZE = 20;

class CourseStore {
  public courses: Course[] = [];
  public filter: Filter = 'all';
  public loading: boolean = false;
  public error: string | null = null;
  public page: number = 0;

  public constructor() {
    makeAutoObservable(this);
  }

  public setFilter(f: Filter): void {
    this.filter = f;
    this.courses = [];
    this.page = 0;
  }

  public async fetchPage(): Promise<void> {
    this.loading = true;
    this.error = null;

    const from = this.page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let result: { data: Course[] | null; error: { message: string } | null };

    if (this.filter === 'mine') {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? '';
      result = await supabase
        .from('courses')
        .select('*')
        .eq('created_by', uid)
        .order('created_at', { ascending: false })
        .range(from, to);
    } else {
      result = await supabase
        .from('courses')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .range(from, to);
    }

    runInAction(() => {
      if (result.error) {
        this.error = result.error.message;
      } else if (result.data) {
        this.courses = [...this.courses, ...result.data];
        this.page += 1;
      }
      this.loading = false;
    });
  }
}

export { CourseStore };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/stores/CourseStore.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/CourseStore.ts src/stores/CourseStore.test.ts
git commit -m "feat: CourseStore — feed list with filter and pagination"
```

---

## Task 6: CourseDetailStore

**Files:**
- Create: `src/stores/CourseDetailStore.ts`
- Create: `src/stores/CourseDetailStore.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/stores/CourseDetailStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CourseDetailStore } from './CourseDetailStore';

const FAKE_COURSE = {
  id: 'c1', name: 'Route', created_by: 'u1',
  distance_m: 5000, elevation_gain_m: 100, is_public: true, created_at: '2026-01-01',
  description: null, tags: null, gpx_path: 'u1/c1.gpx',
};

const {
  mockGetUser,
  mockCourseSingle,
  mockLikeCount,
  mockMyLikeSingle,
  mockComments,
  mockInsert,
  mockDelete,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockCourseSingle: vi.fn(),
  mockLikeCount: vi.fn(),
  mockMyLikeSingle: vi.fn(),
  mockComments: vi.fn(),
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => {
      if (table === 'courses') {
        return {
          select: () => ({ eq: () => ({ single: () => mockCourseSingle() }) }),
        };
      }
      if (table === 'course_likes') {
        return {
          // count query: select('*', { count: 'exact', head: true }).eq(...)
          select: (_col: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.count === 'exact') {
              return { eq: () => mockLikeCount() };
            }
            // userHasLiked query: select('user_id').eq().eq().single()
            return { eq: () => ({ eq: () => ({ single: () => mockMyLikeSingle() }) }) };
          },
          insert: (...a: unknown[]) => mockInsert(...a),
          delete: () => ({ eq: () => ({ eq: () => mockDelete() }) }),
        };
      }
      if (table === 'course_comments') {
        return {
          select: () => ({ eq: () => ({ order: () => mockComments() }) }),
          insert: () => ({ select: () => ({ single: () => mockInsert() }) }),
        };
      }
      return {};
    },
  },
}));

describe('CourseDetailStore', () => {
  let store: CourseDetailStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null });
    mockCourseSingle.mockResolvedValue({ data: FAKE_COURSE, error: null });
    mockLikeCount.mockResolvedValue({ count: 3, error: null });
    mockMyLikeSingle.mockResolvedValue({ data: null, error: null });
    mockComments.mockResolvedValue({ data: [], error: null });
    store = new CourseDetailStore('c1');
  });

  it('초기 상태', () => {
    expect(store.course).toBeNull();
    expect(store.loading).toBe(true);
    expect(store.notFound).toBe(false);
  });

  it('fetch() 후 course 설정', async () => {
    await store.fetch();
    expect(store.course?.id).toBe('c1');
    expect(store.notFound).toBe(false);
  });

  it('fetch() 후 likeCount 설정', async () => {
    await store.fetch();
    expect(store.likeCount).toBe(3);
  });

  it('course가 없으면 notFound=true', async () => {
    mockCourseSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    await store.fetch();
    expect(store.notFound).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/stores/CourseDetailStore.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```typescript
// src/stores/CourseDetailStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import type { Course, CourseComment } from '../types/course';

class CourseDetailStore {
  public course: Course | null = null;
  public loading: boolean = true;
  public notFound: boolean = false;
  public error: string | null = null;

  public likeCount: number = 0;
  public userHasLiked: boolean = false;
  public likeLoading: boolean = false;

  public comments: CourseComment[] = [];
  public commentBody: string = '';
  public commentSubmitting: boolean = false;

  private courseId: string;
  private currentUserId: string | null = null;

  public constructor(courseId: string) {
    this.courseId = courseId;
    makeAutoObservable(this);
  }

  public setCommentBody(v: string): void { this.commentBody = v; }

  public async fetch(): Promise<void> {
    this.loading = true;

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id ?? null;
    runInAction(() => { this.currentUserId = uid; });

    // Fetch course
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .eq('id', this.courseId)
      .single();

    if (error || !data) {
      runInAction(() => {
        this.notFound = true;
        this.loading = false;
      });
      return;
    }

    // Fetch like count
    const { count: likeCount } = await supabase
      .from('course_likes')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', this.courseId);

    // Fetch user's own like
    let userHasLiked = false;
    if (uid) {
      const { data: myLike } = await supabase
        .from('course_likes')
        .select('user_id')
        .eq('course_id', this.courseId)
        .eq('user_id', uid)
        .single();
      userHasLiked = !!myLike;
    }

    // Fetch comments
    const { data: comments } = await supabase
      .from('course_comments')
      .select('*')
      .eq('course_id', this.courseId)
      .order('created_at', { ascending: false });

    runInAction(() => {
      this.course = data as Course;
      this.likeCount = likeCount ?? 0;
      this.userHasLiked = userHasLiked;
      this.comments = (comments ?? []) as CourseComment[];
      this.loading = false;
    });
  }

  public async toggleLike(): Promise<void> {
    if (!this.currentUserId || this.likeLoading) return;
    this.likeLoading = true;

    if (this.userHasLiked) {
      await supabase
        .from('course_likes')
        .delete()
        .eq('course_id', this.courseId)
        .eq('user_id', this.currentUserId);
      runInAction(() => {
        this.userHasLiked = false;
        this.likeCount = Math.max(0, this.likeCount - 1);
        this.likeLoading = false;
      });
    } else {
      const { error } = await supabase
        .from('course_likes')
        .insert({ course_id: this.courseId, user_id: this.currentUserId });
      runInAction(() => {
        if (!error) {
          this.userHasLiked = true;
          this.likeCount += 1;
        }
        this.likeLoading = false;
      });
    }
  }

  public async submitComment(): Promise<void> {
    if (!this.commentBody.trim() || !this.currentUserId) return;
    this.commentSubmitting = true;

    const { data, error } = await supabase
      .from('course_comments')
      .insert({
        course_id: this.courseId,
        user_id: this.currentUserId,
        body: this.commentBody.trim(),
      })
      .select()
      .single();

    runInAction(() => {
      if (!error && data) {
        this.comments = [data as CourseComment, ...this.comments];
        this.commentBody = '';
      }
      this.commentSubmitting = false;
    });
  }
}

export { CourseDetailStore };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/stores/CourseDetailStore.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/CourseDetailStore.ts src/stores/CourseDetailStore.test.ts
git commit -m "feat: CourseDetailStore — course detail, like toggle, comments"
```

---

## Task 7: CourseCard Component

**Files:**
- Create: `src/components/CourseCard.tsx`
- Create: `src/components/CourseCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/components/CourseCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CourseCard } from './CourseCard';
import type { Course } from '../types/course';

const COURSE: Course = {
  id: 'c1',
  created_by: 'u1',
  name: 'Bukhansan Trail',
  description: null,
  tags: ['어려움'],
  gpx_path: 'u1/c1.gpx',
  distance_m: 8500,
  elevation_gain_m: 450,
  is_public: true,
  created_at: '2026-01-01T00:00:00Z',
};

const COURSE_NULL_DIST: Course = { ...COURSE, distance_m: null };

// Stub Intersection Observer
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(cb: IntersectionObserverCallback) {
      // immediately call with not-intersecting — thumbnail stays in placeholder
      void cb([], this as unknown as IntersectionObserver);
    }
  });
});

describe('CourseCard', () => {
  it('renders course name', () => {
    render(<CourseCard course={COURSE} likeCount={3} onClick={() => {}} />);
    expect(screen.getByText('Bukhansan Trail')).toBeTruthy();
  });

  it('renders formatted distance', () => {
    render(<CourseCard course={COURSE} likeCount={0} onClick={() => {}} />);
    expect(screen.getByText(/8\.5\s*km/i)).toBeTruthy();
  });

  it('renders — when distance_m is null', () => {
    render(<CourseCard course={COURSE_NULL_DIST} likeCount={0} onClick={() => {}} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('renders like count', () => {
    render(<CourseCard course={COURSE} likeCount={7} onClick={() => {}} />);
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('renders grey placeholder SVG initially (before intersection)', () => {
    const { container } = render(<CourseCard course={COURSE} likeCount={0} onClick={() => {}} />);
    // The placeholder rect should be present before GPX is fetched
    const rect = container.querySelector('rect');
    expect(rect).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/CourseCard.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```typescript
// src/components/CourseCard.tsx
import { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseGpxCoords, normaliseCoordsToSvgPoints } from '../lib/gpx';
import type { Course } from '../types/course';

const THUMB_W = 160;
const THUMB_H = 100;

function formatDistance(m: number | null): string {
  if (m === null) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${m} m`;
}

interface Props {
  course: Course;
  likeCount: number;
  onClick: () => void;
}

export function CourseCard({ course, likeCount, onClick }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [svgPoints, setSvgPoints] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        try {
          const { data, error } = await supabase.storage
            .from('course-gpx')
            .createSignedUrl(course.gpx_path, 3600);

          if (error || !data?.signedUrl) { setThumbError(true); return; }

          const res = await fetch(data.signedUrl);
          if (!res.ok) { setThumbError(true); return; }

          const text = await res.text();
          const coords = parseGpxCoords(text);
          if (!coords) { setThumbError(true); return; }

          const points = normaliseCoordsToSvgPoints(coords, THUMB_W, THUMB_H);
          setSvgPoints(points);
        } catch {
          setThumbError(true);
        }
      },
      { rootMargin: '200px', threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [course.gpx_path]);

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className="flex flex-col rounded-2xl overflow-hidden border border-neutral-100 bg-white shadow-sm active:opacity-80 cursor-pointer"
    >
      {/* Thumbnail */}
      <svg
        width={THUMB_W}
        height={THUMB_H}
        viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
        className="bg-neutral-100 w-full"
        style={{ height: THUMB_H }}
      >
        {thumbError || (!svgPoints && !thumbError) ? (
          <rect width={THUMB_W} height={THUMB_H} fill="#e5e5e5" rx="0" />
        ) : svgPoints ? (
          svgPoints.split(' ').length === 1 ? (
            /* single point */
            <circle cx={svgPoints.split(',')[0]} cy={svgPoints.split(',')[1]} r="4" fill="#FF5722" />
          ) : (
            <polyline
              points={svgPoints}
              fill="none"
              stroke="#FF5722"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        ) : null}
      </svg>

      {/* Info */}
      <div className="flex flex-col gap-1 p-3">
        <p className="text-sm font-semibold text-black line-clamp-1">{course.name}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500">{formatDistance(course.distance_m)}</span>
          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <Heart size={12} />
            {likeCount}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/CourseCard.test.tsx
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CourseCard.tsx src/components/CourseCard.test.tsx
git commit -m "feat: CourseCard component with lazy SVG thumbnail"
```

---

## Task 8: CoursePage

**Files:**
- Create: `src/pages/CoursePage.tsx`

- [ ] **Step 1: Write the page**

```typescript
// src/pages/CoursePage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Plus } from 'lucide-react';
import { CourseStore } from '../stores/CourseStore';
import { CourseCard } from '../components/CourseCard';

const FILTERS = [
  { key: 'all' as const, label: '전체' },
  { key: 'mine' as const, label: '내 코스' },
];

export const CoursePage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new CourseStore());

  useEffect(() => {
    store.fetchPage();
  }, [store]);

  const handleFilterChange = (key: 'all' | 'mine') => {
    store.setFilter(key);
    store.fetchPage();
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <h1 className="text-base font-semibold">코스</h1>
        <button
          onClick={() => navigate('/course/new')}
          aria-label="코스 업로드"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-black text-white"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 px-4 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              store.filter === f.key
                ? 'bg-black text-white'
                : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Course grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {store.loading && store.courses.length === 0 && (
          <div className="flex justify-center pt-16">
            <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!store.loading && store.courses.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-16 gap-2">
            <p className="text-sm text-neutral-400">코스가 없습니다</p>
          </div>
        )}

        {store.error && (
          <p className="text-xs text-red-500 text-center pt-4">{store.error}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {store.courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              likeCount={0}
              onClick={() => navigate(`/course/${course.id}`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/CoursePage.tsx
git commit -m "feat: CoursePage — course feed with filter chips"
```

---

## Task 9: CourseUploadPage

**Files:**
- Create: `src/pages/CourseUploadPage.tsx`

- [ ] **Step 1: Write the page**

```typescript
// src/pages/CourseUploadPage.tsx
import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { toast } from 'sonner';
import { CourseUploadStore } from '../stores/CourseUploadStore';
import { MapStore } from '../stores/MapStore';

const DIFFICULTY_TAGS = ['쉬움', '보통', '어려움'];
const TERRAIN_TAGS = ['산악', '도심', '해안', '평지'];

export const CourseUploadPage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new CourseUploadStore());
  const [mapStore] = useState(() => new MapStore());
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [gpxText, setGpxText] = useState<string | null>(null);

  // Init map once
  useEffect(() => {
    if (!mapRef.current) return;
    mapStore.initMap(mapRef.current);
    setMapReady(true);
    return () => mapStore.destroy();
  }, [mapStore]);

  // Draw route when GPX parsed and map ready
  useEffect(() => {
    if (mapReady && gpxText) {
      mapStore.drawGpxRoute(gpxText);
    }
  }, [mapStore, mapReady, gpxText]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    const text = await f.text();
    await store.setFile(f);
    if (!store.gpxError) setGpxText(text);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const courseId = await store.submit();
    if (courseId) {
      navigate('/course');
    } else {
      toast.error(store.error ?? '오류가 발생했습니다');
    }
  };

  return (
    <div className="h-full bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center px-2 py-2 border-b border-neutral-200">
        <button
          onClick={() => navigate('/course')}
          className="flex items-center justify-center w-11 h-11 rounded-full text-black active:bg-neutral-100 transition-colors"
          aria-label="뒤로"
        >
          <svg width="11" height="19" viewBox="0 0 11 19" fill="none" aria-hidden="true">
            <path d="M9.5 1.5L1.5 9.5L9.5 17.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="flex-1 text-center text-base font-semibold">코스 업로드</h1>
        <div className="w-11" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Map preview */}
        <div
          ref={mapRef}
          data-testid="map-container"
          className="w-full bg-neutral-100"
          style={{ height: 200 }}
        />

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
          {/* GPX file */}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-neutral-500">GPX 파일</label>
            <label className="bg-neutral-100 rounded-lg px-3 py-2 text-sm border border-neutral-200 cursor-pointer flex items-center">
              <span className="text-neutral-500">
                {store.file ? store.file.name : '파일 선택'}
              </span>
              <input type="file" accept=".gpx" className="hidden" onChange={handleFileChange} />
            </label>
            {store.gpxError && (
              <p className="text-xs text-red-500">{store.gpxError}</p>
            )}
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-neutral-500">코스 이름 <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={store.name}
              onChange={(e) => store.setName(e.target.value)}
              placeholder="코스 이름을 입력하세요"
              className="bg-neutral-100 rounded-lg px-3 py-2 text-sm border border-neutral-200 outline-none focus:border-black"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-neutral-500">설명</label>
            <textarea
              value={store.description}
              onChange={(e) => store.setDescription(e.target.value)}
              placeholder="코스 설명을 입력하세요 (선택)"
              rows={3}
              className="bg-neutral-100 rounded-lg px-3 py-2 text-sm border border-neutral-200 outline-none focus:border-black resize-none"
            />
          </div>

          {/* Difficulty tags */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-neutral-500">난이도</label>
            <div className="flex gap-2">
              {DIFFICULTY_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => store.tags.includes(tag) ? store.removeTag(tag) : store.addTag(tag)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    store.tags.includes(tag)
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-neutral-600 border-neutral-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Terrain tags */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-neutral-500">지형</label>
            <div className="flex gap-2 flex-wrap">
              {TERRAIN_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => store.tags.includes(tag) ? store.removeTag(tag) : store.addTag(tag)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    store.tags.includes(tag)
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-neutral-600 border-neutral-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={!store.isValid || store.submitting}
              className="w-full py-3 rounded-xl bg-black text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {store.submitting && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              업로드
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Write the failing component test**

```typescript
// src/pages/CourseUploadPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CourseUploadPage } from './CourseUploadPage';

// Mock stores so page renders without real Supabase/Naver
vi.mock('../stores/CourseUploadStore', () => ({
  CourseUploadStore: class {
    name = '';
    description = '';
    tags: string[] = [];
    file: File | null = null;
    gpxError: string | null = null;
    submitting = false;
    error: string | null = null;
    get isValid() { return this.name.trim() !== '' && this.file !== null && !this.gpxError; }
    setName = vi.fn((v: string) => { this.name = v; });
    setDescription = vi.fn();
    addTag = vi.fn();
    removeTag = vi.fn();
    setFile = vi.fn();
    submit = vi.fn().mockResolvedValue(null);
  },
}));

vi.mock('../stores/MapStore', () => ({
  MapStore: class {
    map = null;
    error = false;
    initMap = vi.fn();
    drawGpxRoute = vi.fn();
    destroy = vi.fn();
  },
}));

vi.mock('../lib/supabase', () => ({ supabase: {} }));

function renderPage() {
  return render(
    <MemoryRouter>
      <CourseUploadPage />
    </MemoryRouter>,
  );
}

describe('CourseUploadPage', () => {
  it('renders upload button disabled when form is empty', () => {
    renderPage();
    const btn = screen.getByRole('button', { name: /업로드/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows GPX error message when gpxError is set', async () => {
    const { CourseUploadStore } = await import('../stores/CourseUploadStore');
    // @ts-expect-error — inject gpxError for test
    CourseUploadStore.prototype.gpxError = '유효하지 않은 GPX 파일입니다';
    renderPage();
    expect(screen.getByText('유효하지 않은 GPX 파일입니다')).toBeTruthy();
    // reset
    // @ts-expect-error
    CourseUploadStore.prototype.gpxError = null;
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/pages/CourseUploadPage.test.tsx
```

Expected: FAIL — file does not exist yet (but we wrote it in Step 1, so this verifies the test runs and passes).

Actually: run this AFTER writing the page in Step 1. Expected: PASS.

```bash
npx vitest run src/pages/CourseUploadPage.test.tsx
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CourseUploadPage.tsx src/pages/CourseUploadPage.test.tsx
git commit -m "feat: CourseUploadPage — GPX upload with Naver map preview"
```

---

## Task 10: CourseDetailPage

**Files:**
- Create: `src/pages/CourseDetailPage.tsx`

- [ ] **Step 1: Write the page**

```typescript
// src/pages/CourseDetailPage.tsx
import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Heart, Send } from 'lucide-react';
import { toast } from 'sonner';
import { CourseDetailStore } from '../stores/CourseDetailStore';
import { MapStore } from '../stores/MapStore';
import { supabase } from '../lib/supabase';

export const CourseDetailPage = observer(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [store] = useState(() => new CourseDetailStore(id!));
  const [mapStore] = useState(() => new MapStore());
  const mapRef = useRef<HTMLDivElement>(null);
  const [gpxText, setGpxText] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    store.fetch();
  }, [store]);

  // Fetch GPX once course is loaded
  useEffect(() => {
    if (!store.course) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.storage
        .from('course-gpx')
        .createSignedUrl(store.course!.gpx_path, 3600);

      if (cancelled) return;
      if (error || !data?.signedUrl) { setGpxText(null); return; }

      try {
        const res = await fetch(data.signedUrl);
        if (!res.ok) { setGpxText(null); return; }
        const text = await res.text();
        if (!cancelled) setGpxText(text);
      } catch {
        if (!cancelled) setGpxText(null);
      }
    })();

    return () => { cancelled = true; };
  }, [store.course]);

  // Init map + draw route
  useEffect(() => {
    if (!mapRef.current || gpxText === undefined || store.loading) return;

    mapStore.initMap(mapRef.current);
    if (gpxText) mapStore.drawGpxRoute(gpxText);

    return () => mapStore.destroy();
  }, [mapStore, gpxText, store.loading]);

  const handleLike = async () => {
    await store.toggleLike();
    if (store.error) toast.error('좋아요 처리 중 오류가 발생했습니다');
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await store.submitComment();
  };

  if (store.loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (store.notFound) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white">
        <p className="text-sm text-neutral-500">코스를 찾을 수 없습니다</p>
        <button
          onClick={() => navigate('/course')}
          className="px-4 py-2 rounded-lg bg-black text-white text-sm font-medium"
        >
          코스 목록으로
        </button>
      </div>
    );
  }

  const course = store.course!;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Map */}
      <div className="relative" style={{ height: '45vh' }}>
        <div ref={mapRef} data-testid="map-container" className="absolute inset-0" />

        {mapStore.error && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
            <p className="text-sm text-neutral-500">지도를 불러올 수 없습니다</p>
          </div>
        )}

        {/* Back button */}
        <div className="absolute top-4 left-4">
          <button
            onClick={() => navigate('/course')}
            className="bg-white/90 text-black px-3 py-1 rounded-full text-sm font-medium shadow"
          >
            ← 코스
          </button>
        </div>
      </div>

      {/* Scrollable detail */}
      <div className="flex-1 overflow-y-auto">
        {/* Title + stats */}
        <div className="px-4 pt-4 pb-3 border-b border-neutral-100">
          <h1 className="text-lg font-bold text-black mb-2">{course.name}</h1>
          <div className="flex gap-4 text-sm text-neutral-500">
            <span>거리 {course.distance_m !== null ? `${(course.distance_m / 1000).toFixed(1)} km` : '—'}</span>
            <span>고도 {course.elevation_gain_m !== null ? `+${course.elevation_gain_m} m` : '—'}</span>
          </div>
          {course.description && (
            <p className="text-sm text-neutral-600 mt-2">{course.description}</p>
          )}
          {course.tags && course.tags.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {course.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 bg-neutral-100 rounded-full text-xs text-neutral-600">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Like */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100">
          <button
            onClick={handleLike}
            disabled={store.likeLoading}
            aria-label="좋아요"
            className="flex items-center gap-1.5"
          >
            <Heart
              size={20}
              className={store.userHasLiked ? 'fill-red-500 text-red-500' : 'text-neutral-400'}
            />
            <span className="text-sm text-neutral-600">{store.likeCount}</span>
          </button>
        </div>

        {/* Comments */}
        <div className="px-4 pt-3 pb-20">
          <h2 className="text-sm font-semibold mb-3">댓글 {store.comments.length}</h2>

          {store.comments.length === 0 && (
            <p className="text-xs text-neutral-400 mb-4">첫 댓글을 남겨보세요</p>
          )}

          <div className="flex flex-col gap-3 mb-4">
            {store.comments.map((comment) => (
              <div key={comment.id} className="flex flex-col gap-0.5">
                <p className="text-sm text-black">{comment.body}</p>
                <p className="text-xs text-neutral-400">
                  {new Date(comment.created_at).toLocaleDateString('ko-KR')}
                </p>
              </div>
            ))}
          </div>

          {/* Comment input */}
          <form onSubmit={handleCommentSubmit} className="flex gap-2">
            <input
              type="text"
              value={store.commentBody}
              onChange={(e) => store.setCommentBody(e.target.value)}
              placeholder="댓글을 입력하세요"
              className="flex-1 bg-neutral-100 rounded-full px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={!store.commentBody.trim() || store.commentSubmitting}
              aria-label="댓글 전송"
              className="flex items-center justify-center w-9 h-9 rounded-full bg-black text-white disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/CourseDetailPage.tsx
git commit -m "feat: CourseDetailPage — map, stats, likes, comments"
```

---

## Task 11: Routing, Tab Bar, App Wiring

**Files:**
- Modify: `src/components/BottomTabBar.tsx`
- Modify: `src/pages/MainLayout.tsx`
- Modify: `src/App.tsx`
- Delete: `src/pages/HistoryPage.tsx`

- [ ] **Step 1: Update BottomTabBar**

In `src/components/BottomTabBar.tsx`, replace the import and the TABS array:

```typescript
// Change import:
import { Users, Map, User } from 'lucide-react';

// Change TABS:
const TABS: Tab[] = [
  { path: '/group', label: '그룹', icon: <Users size={20} strokeWidth={2} /> },
  { path: '/course', label: '코스', icon: <Map size={20} strokeWidth={2} /> },
  { path: '/profile', label: '프로필', icon: <User size={20} strokeWidth={2} /> },
];
```

- [ ] **Step 2: Update MainLayout**

In `src/pages/MainLayout.tsx`, add `/course/new` to the array:

```typescript
const HIDE_TAB_BAR_PATHS = ['/group/new', '/course/new'];
```

- [ ] **Step 3: Update App.tsx**

```typescript
// Add imports at top:
import { CoursePage } from './pages/CoursePage';
import { CourseUploadPage } from './pages/CourseUploadPage';
import { CourseDetailPage } from './pages/CourseDetailPage';

// Remove:
import { HistoryPage } from './pages/HistoryPage';

// Inside the children of the existing ProtectedRoute layout Route (alongside group/profile routes),
// replace:
//   <Route path="history" element={<HistoryPage />} />
// with:
<Route path="course" element={<CoursePage />} />
<Route path="course/new" element={<CourseUploadPage />} />
<Route path="course/:id" element={<CourseDetailPage />} />

// These three routes MUST be nested inside the existing:
//   <Route path="/" element={<ProtectedRoute>...</ProtectedRoute>}>
// so they inherit auth protection and the MainLayout.
```

- [ ] **Step 4: Delete HistoryPage.tsx**

```bash
rm src/pages/HistoryPage.tsx
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all PASS (no references to HistoryPage in tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/BottomTabBar.tsx src/pages/MainLayout.tsx src/App.tsx
git rm src/pages/HistoryPage.tsx
git commit -m "feat: wire course tab into routing and bottom tab bar, remove history tab"
```

---

## Final Check

- [ ] Run full test suite: `npx vitest run`
- [ ] Verify dev server starts: `npm run dev`
- [ ] Manually test in browser:
  - [ ] 코스 탭 표시 확인
  - [ ] 기록 탭 사라짐 확인
  - [ ] `/course/new` 에서 탭바 숨김 확인
  - [ ] GPX 업로드 → 목록에 나타남 확인
  - [ ] 코스 카드 클릭 → 상세 페이지 이동 확인
  - [ ] 좋아요 토글 확인
  - [ ] 댓글 입력 확인
  - [ ] `내 코스` 필터 확인
