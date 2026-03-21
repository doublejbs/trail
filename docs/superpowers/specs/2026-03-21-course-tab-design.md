# Course Tab Design Spec
**Date:** 2026-03-21
**Status:** Draft

## Overview

Replace the 기록(History) tab — currently a placeholder — with a 코스(Course) tab where users can upload GPX files, share courses publicly, and browse courses uploaded by others. Social features (likes, comments) are in scope for v1.

Future intent: groups will pick their route from the course library instead of uploading a GPX file directly at group creation time.

All `/course` routes sit under the existing `ProtectedRoute` wrapper, so only authenticated users can access the feature.

---

## Data Model

### `courses` table
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK DEFAULT gen_random_uuid() | |
| `created_by` | UUID NOT NULL → auth.users ON DELETE CASCADE | uploader; course is deleted when user is deleted (v1) |
| `name` | TEXT NOT NULL | course name |
| `description` | TEXT | optional |
| `tags` | TEXT[] | difficulty, terrain, etc. |
| `gpx_path` | TEXT NOT NULL | Storage path: `{uid}/{uuid}.gpx` |
| `distance_m` | INT | parsed from GPX (metres); nullable if parse fails |
| `elevation_gain_m` | INT | cumulative elevation gain (metres); nullable if no elevation data |
| `is_public` | BOOLEAN NOT NULL DEFAULT true | visibility |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Index:** add `CREATE INDEX ON courses (is_public, created_at DESC)` in the migration to support the primary feed query (`WHERE is_public = true ORDER BY created_at DESC`).

Courses are **immutable after upload** — name, description, tags, and GPX cannot be edited in v1. The `courses` UPDATE RLS policy is defined now but no edit UI exists in v1.

### `course_likes` table
| Column | Type | Notes |
|---|---|---|
| `course_id` | UUID NOT NULL → courses ON DELETE CASCADE | |
| `user_id` | UUID NOT NULL → auth.users ON DELETE CASCADE | |
| PK: `(course_id, user_id)` | | |

No `created_at` column — likes have no temporal relevance in v1.

### `course_comments` table
| Column | Type |
|---|---|
| `id` | UUID PK DEFAULT gen_random_uuid() |
| `course_id` | UUID NOT NULL → courses ON DELETE CASCADE |
| `user_id` | UUID NOT NULL → auth.users ON DELETE CASCADE |
| `body` | TEXT NOT NULL |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() |

Comments are immutable — no UPDATE. No comment-delete UI exists in v1; the DELETE RLS policy is defined for future use.

---

## Storage

Bucket: `course-gpx` (new, separate from `gpx-files` used for group routes).

**Path convention:** `{user_uid}/{uuid}.gpx`

### Storage RLS
- **SELECT:** any authenticated user can read any object (all courses in CoursePage are behind ProtectedRoute)
- **INSERT:** path must start with `auth.uid() || '/'`
- **DELETE:** path must start with `auth.uid() || '/'`
- **UPDATE:** no UPDATE policy — GPX files are immutable after upload

---

## Database RLS

All operations require the user to be authenticated (CoursePage is behind ProtectedRoute).

### `courses`
- **SELECT:** `is_public = true OR created_by = auth.uid()`
- **INSERT:** `created_by = auth.uid()`
- **UPDATE:** `created_by = auth.uid()` (defined now, no edit UI in v1)
- **DELETE:** `created_by = auth.uid()`

### `course_likes`
- **SELECT:** rows where the linked course is readable by current user:
  `EXISTS (SELECT 1 FROM courses WHERE courses.id = course_id AND (courses.is_public = true OR courses.created_by = auth.uid()))`
  — for the public feed, `is_public = true` satisfies this for all visible courses
- **INSERT:** `user_id = auth.uid()`
- **DELETE:** `user_id = auth.uid()`
- No UPDATE.

### `course_comments`
- **SELECT:** same subquery restriction as `course_likes`
- **INSERT:** `user_id = auth.uid()`
- **DELETE:** `user_id = auth.uid()` (no delete UI in v1)
- No UPDATE.

---

## Routing

```
/course          CoursePage        (main feed)
/course/new      CourseUploadPage  (upload)
/course/:id      CourseDetailPage  (detail)
```

In `App.tsx`, child route declarations follow the existing relative-path convention (no leading slash): `path="course"`, `path="course/new"`, `path="course/:id"`.

React Router v6 resolves specificity by segment type — a literal segment (`new`) wins over a dynamic segment (`:id`), so `course/new` will never be incorrectly matched as a course detail page regardless of declaration order.

### Tab bar visibility
- `HIDE_TAB_BAR_PATHS` in `MainLayout.tsx` uses exact `includes()` match (existing behaviour). Add `'/course/new'` to the array.
- `/course/:id`: tab bar **is visible** (same as `/group/:id`). 코스 tab stays highlighted via `startsWith` — intentional.

### Tab bar change
- Remove: 기록 (`/history`, `Clock` icon)
- Add: 코스 (`/course`, `Map` icon from lucide-react)
- Order: 그룹 / 코스 / 프로필

---

## Pages

### CoursePage (main feed)
- Upload `+` button top-right
- Default: all public courses, latest first, paginated (20 per page)
- Filter chips: `전체` / `내 코스` / tag filters (difficulty, terrain)
- Course card: SVG map thumbnail + name + distance + like count
  - `distance_m` null → display `—`
  - Like count always shown (0 if none)

### CourseUploadPage
1. GPX file picker
2. Parse GPX in browser → render route preview on Leaflet map
3. Form: name (required), description (optional), tags — difficulty chip group + terrain chip group
4. Submit: upload GPX to `course-gpx` bucket → INSERT into `courses` with parsed stats
5. On success: navigate to `/course`

### CourseDetailPage
- Full-screen Leaflet map with GPX route overlay (same stack as GroupMapPage)
- Stats card: distance (`—` if null), elevation gain (`—` if null)
- Like button (toggle, shows total count)
- Comments section: list (latest first) + input field
- Header back button → `/course`
- **Not-found state:** if Supabase SELECT returns zero rows (deleted course, wrong ID, or private course of another user), render a centred "코스를 찾을 수 없습니다" message with a button to navigate back to `/course`

---

## GPX Parsing & Thumbnail

### Library
`@tmcw/togeojson` — converts GPX XML to GeoJSON.

### Upload flow
1. File selected → parse GPX to GeoJSON in browser
2. Extract coordinate array → compute `distance_m` (Haversine sum) and `elevation_gain_m`
3. Render Leaflet preview
4. User confirms → upload file to `course-gpx` Storage → INSERT metadata row

### Thumbnail rendering (card list)
- `CourseCard` fetches its GPX lazily using Intersection Observer
- Observer config: `rootMargin: '200px'` (pre-fetch cards entering viewport soon), `threshold: 0`
- No explicit concurrency cap in v1 — browser's native fetch queue (~6 concurrent) provides natural throttling
- On fetch: parse GPX → normalize lat/lon to SVG viewBox → render `<polyline>` at 160 × 100 px
- Single-point GPX edge case (only one `<trkpt>`): render a centre dot instead of polyline, show placeholder if bounding box is zero-dimension
- On fetch failure: grey placeholder SVG

**Known trade-off:** each card fetches its own GPX file (potentially 50–500 KB each). This is acceptable for v1 with 20 items per page. Server-side thumbnail pre-generation (Edge Function) is the upgrade path if performance becomes an issue.

---

## Error Handling

| Scenario | Handling |
|---|---|
| Invalid / unparseable GPX | Inline error on file picker, block submit |
| Storage upload failure | Toast error, form state preserved |
| GPX fetch failure on card thumbnail | Grey placeholder SVG |
| Like / comment network failure | Toast error |
| `distance_m` or `elevation_gain_m` is null | Display `—` in UI |
| CourseDetailPage: course not found | Show "코스를 찾을 수 없습니다" + back to `/course` |
| Single-point GPX (1 trackpoint) | Render centre dot, not polyline |

---

## Files Changed

- `src/components/BottomTabBar.tsx` — replace 기록 tab with 코스
- `src/pages/MainLayout.tsx` — add `'/course/new'` to `HIDE_TAB_BAR_PATHS`
- `src/App.tsx` — remove `path="history"` route, add `path="course"` / `path="course/new"` / `path="course/:id"`; remove `HistoryPage` import
- `src/pages/HistoryPage.tsx` — delete
- `src/pages/CoursePage.tsx` — new
- `src/pages/CourseUploadPage.tsx` — new
- `src/pages/CourseDetailPage.tsx` — new
- `src/components/CourseCard.tsx` — new (lazy thumbnail + stats)
- `src/lib/gpx.ts` — new (parse, distance, elevation, SVG normalization utils)
- `supabase/migrations/20260321000000_courses.sql` — new (tables + RLS + storage policies + recommended index)

---

## Testing

- Unit: `src/lib/gpx.ts` — distance calculation, elevation gain, SVG coordinate normalization, null-safe returns, single-point edge case
- Component: `CourseCard` renders placeholder when GPX fetch fails
- Component: `CourseCard` renders `—` when `distance_m` is null
- Component: `CourseUploadPage` blocks submit on invalid GPX
- Integration: upload flow (mock Storage + Supabase insert)
- E2E: not in scope for this iteration
