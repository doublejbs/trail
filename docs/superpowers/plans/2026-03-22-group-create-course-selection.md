# 그룹 생성 코스 선택 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그룹 생성 화면에서 GPX 파일 직접 업로드 외에 기존 코스 목록에서 선택할 수 있는 탭 UI 추가

**Architecture:** `GroupCreateStore`에 코스 목록 조회·선택 상태를 추가하고, `GroupCreatePage`에서 "코스 선택" / "GPX 업로드" 탭으로 분기 표시한다. 코스 선택 시 해당 코스의 `gpx_path`를 그룹에 그대로 저장해 파일 업로드를 생략한다.

**Tech Stack:** React 19, TypeScript, MobX 6, Supabase JS client, Tailwind CSS 4, Vitest + React Testing Library

---

## 변경 파일

| 파일 | 작업 |
|------|------|
| `src/stores/GroupCreateStore.ts` | 수정 — 코스 목록 필드·메서드 추가, `isValid`·`submit()` 분기 |
| `src/pages/GroupCreatePage.tsx` | 수정 — 탭 UI + 코스 카드 리스트 렌더링 |
| `src/pages/GroupCreatePage.test.tsx` | 수정 — 새 동작에 대한 테스트 추가 |

---

## Task 1: GroupCreateStore — 코스 선택 상태·메서드 추가

**Files:**
- Modify: `src/stores/GroupCreateStore.ts`

- [ ] **Step 1: 현재 파일 읽기**

  `src/stores/GroupCreateStore.ts` 전체 내용을 확인한다.

- [ ] **Step 2: 필드 및 import 추가**

  파일 상단에 `Course` 타입 import를 추가하고 클래스에 다음 필드를 추가한다:

  ```typescript
  import type { Course } from '../types/course';

  // 클래스 내부
  public sourceMode: 'course' | 'file' = 'course';
  public courses: Course[] = [];
  public coursesLoading: boolean = false;
  public selectedCourseId: string | null = null;
  ```

- [ ] **Step 3: setSourceMode, setSelectedCourseId 메서드 추가**

  ```typescript
  public setSourceMode(mode: 'course' | 'file'): void {
    this.sourceMode = mode;
  }

  public setSelectedCourseId(id: string | null): void {
    this.selectedCourseId = id;
  }
  ```

- [ ] **Step 4: fetchCourses 메서드 추가**

  ```typescript
  public async fetchCourses(): Promise<void> {
    runInAction(() => { this.coursesLoading = true; });

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    let query = supabase
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.or(`is_public.eq.true,created_by.eq.${userId}`);
    } else {
      query = query.eq('is_public', true);
    }

    const { data, error } = await query;
    runInAction(() => {
      this.courses = error ? [] : (data as Course[]);
      this.coursesLoading = false;
    });
  }
  ```

- [ ] **Step 5: 생성자에서 fetchCourses 자동 호출**

  `constructor` 마지막 줄에 `this.fetchCourses();` 추가.

- [ ] **Step 6: isValid getter 수정**

  ```typescript
  public get isValid(): boolean {
    if (this.name.trim() === '') return false;
    if (this.sourceMode === 'course') return this.selectedCourseId !== null;
    return this.file !== null;
  }
  ```

- [ ] **Step 7: submit() 분기 추가**

  기존 `submit()` 안에서 파일 업로드 직전에 분기를 추가한다:

  ```typescript
  let gpxPath: string;

  if (this.sourceMode === 'course') {
    const course = this.courses.find((c) => c.id === this.selectedCourseId);
    if (!course) {
      runInAction(() => {
        this.error = '코스를 선택해주세요';
        this.submitting = false;
      });
      toast.error(this.error!);
      return;
    }
    gpxPath = course.gpx_path;
  } else {
    const path = `${userId}/${groupId}.gpx`;
    const { error: uploadError } = await supabase.storage
      .from('gpx-files')
      .upload(path, this.file!);
    if (uploadError) {
      runInAction(() => {
        this.error = uploadError.message;
        this.submitting = false;
      });
      toast.error(this.error!);
      return;
    }
    gpxPath = path;
  }
  ```

  그 뒤 `groups` INSERT에서 `gpx_path: path` → `gpx_path: gpxPath` 로 교체.

- [ ] **Step 8: 타입 체크**

  ```bash
  npx tsc --noEmit
  ```

  오류 없음을 확인한다.

---

## Task 2: GroupCreatePage — 탭 UI + 코스 카드 리스트

**Files:**
- Modify: `src/pages/GroupCreatePage.tsx`

- [ ] **Step 1: 현재 파일 읽기**

  `src/pages/GroupCreatePage.tsx` 전체 내용을 확인한다.

- [ ] **Step 2: GPX 파일 섹션을 탭 UI로 교체**

  기존 `<div className="flex flex-col gap-1">` (GPX 파일 레이블 + input) 블록 전체를 아래 구조로 교체한다:

  ```tsx
  {/* 탭 */}
  <div className="flex rounded-lg border border-neutral-200 overflow-hidden">
    <button
      type="button"
      onClick={() => store.setSourceMode('course')}
      className={`flex-1 py-2 text-sm font-medium transition-colors ${
        store.sourceMode === 'course'
          ? 'bg-black text-white'
          : 'text-neutral-500 bg-white'
      }`}
    >
      코스 선택
    </button>
    <button
      type="button"
      onClick={() => store.setSourceMode('file')}
      className={`flex-1 py-2 text-sm font-medium transition-colors ${
        store.sourceMode === 'file'
          ? 'bg-black text-white'
          : 'text-neutral-500 bg-white'
      }`}
    >
      GPX 업로드
    </button>
  </div>

  {/* 탭 콘텐츠 */}
  {store.sourceMode === 'course' ? (
    <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
      {store.coursesLoading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
        </div>
      ) : store.courses.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-6">등록된 코스가 없습니다</p>
      ) : (
        store.courses.map((course) => (
          <button
            key={course.id}
            type="button"
            onClick={() => store.setSelectedCourseId(course.id)}
            className={`text-left rounded-lg px-3 py-2 border transition-colors ${
              store.selectedCourseId === course.id
                ? 'border-black bg-neutral-50'
                : 'border-neutral-200 bg-white'
            }`}
          >
            <div className="text-sm font-medium">{course.name}</div>
            <div className="text-xs text-neutral-400 mt-0.5">
              {course.distance_m != null
                ? `${(course.distance_m / 1000).toFixed(1)} km`
                : '거리 미상'}
              {course.elevation_gain_m != null
                ? ` · 고도 ${course.elevation_gain_m} m`
                : ''}
            </div>
          </button>
        ))
      )}
    </div>
  ) : (
    <div className="flex flex-col gap-1">
      <label className="bg-neutral-100 rounded-lg px-3 py-2 text-sm border border-neutral-200 cursor-pointer flex items-center">
        <span className="text-neutral-500">
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
  )}
  ```

- [ ] **Step 3: 타입 체크**

  ```bash
  npx tsc --noEmit
  ```

  오류 없음을 확인한다.

---

## Task 3: GroupCreatePage 테스트 업데이트

**Files:**
- Modify: `src/pages/GroupCreatePage.test.tsx`

- [ ] **Step 1: 기존 테스트 파일 읽기**

  `src/pages/GroupCreatePage.test.tsx`가 있으면 읽고, 없으면 새로 만든다.

- [ ] **Step 2: 테스트 파일 작성**

  기존 내용을 유지하거나 없으면 아래 내용으로 작성한다. 모든 Supabase 호출은 mock 처리한다.

  ```tsx
  // src/pages/GroupCreatePage.test.tsx
  import { describe, it, expect, vi } from 'vitest';
  import { render, screen, fireEvent } from '@testing-library/react';
  import { MemoryRouter } from 'react-router-dom';

  vi.mock('../lib/supabase', () => ({ supabase: {} }));

  type SourceMode = 'course' | 'file';

  function makeMockStore(overrides: Partial<{
    name: string;
    sourceMode: SourceMode;
    courses: { id: string; name: string; distance_m: number | null; elevation_gain_m: number | null; gpx_path: string }[];
    coursesLoading: boolean;
    selectedCourseId: string | null;
    file: File | null;
  }> = {}) {
    return class {
      name = overrides.name ?? '';
      sourceMode: SourceMode = overrides.sourceMode ?? 'course';
      courses = overrides.courses ?? [];
      coursesLoading = overrides.coursesLoading ?? false;
      selectedCourseId: string | null = overrides.selectedCourseId ?? null;
      file: File | null = overrides.file ?? null;
      submitting = false;
      error: string | null = null;
      get isValid() {
        if (this.name.trim() === '') return false;
        if (this.sourceMode === 'course') return this.selectedCourseId !== null;
        return this.file !== null;
      }
      setName = vi.fn((v: string) => { this.name = v; });
      setFile = vi.fn();
      setSourceMode = vi.fn((m: SourceMode) => { this.sourceMode = m; });
      setSelectedCourseId = vi.fn((id: string | null) => { this.selectedCourseId = id; });
      submit = vi.fn().mockResolvedValue(null);
    };
  }

  describe('GroupCreatePage', () => {
    it('기본적으로 코스 선택 탭이 활성화된다', async () => {
      vi.doMock('../stores/GroupCreateStore', () => ({
        GroupCreateStore: makeMockStore(),
      }));
      const { GroupCreatePage } = await import('./GroupCreatePage');
      render(<MemoryRouter><GroupCreatePage /></MemoryRouter>);
      expect(screen.getByRole('button', { name: '코스 선택' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'GPX 업로드' })).toBeTruthy();
    });

    it('코스 로딩 중엔 스피너가 표시된다', async () => {
      vi.resetModules();
      vi.doMock('../lib/supabase', () => ({ supabase: {} }));
      vi.doMock('../stores/GroupCreateStore', () => ({
        GroupCreateStore: makeMockStore({ coursesLoading: true }),
      }));
      const { GroupCreatePage } = await import('./GroupCreatePage');
      const { container } = render(<MemoryRouter><GroupCreatePage /></MemoryRouter>);
      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });

    it('코스가 없으면 안내 문구가 표시된다', async () => {
      vi.resetModules();
      vi.doMock('../lib/supabase', () => ({ supabase: {} }));
      vi.doMock('../stores/GroupCreateStore', () => ({
        GroupCreateStore: makeMockStore({ courses: [] }),
      }));
      const { GroupCreatePage } = await import('./GroupCreatePage');
      render(<MemoryRouter><GroupCreatePage /></MemoryRouter>);
      expect(screen.getByText('등록된 코스가 없습니다')).toBeTruthy();
    });

    it('코스 카드가 목록으로 표시된다', async () => {
      vi.resetModules();
      vi.doMock('../lib/supabase', () => ({ supabase: {} }));
      vi.doMock('../stores/GroupCreateStore', () => ({
        GroupCreateStore: makeMockStore({
          courses: [
            { id: 'c1', name: '북한산 둘레길', distance_m: 12400, elevation_gain_m: 340, gpx_path: 'a' },
            { id: 'c2', name: '한강공원', distance_m: null, elevation_gain_m: null, gpx_path: 'b' },
          ],
        }),
      }));
      const { GroupCreatePage } = await import('./GroupCreatePage');
      render(<MemoryRouter><GroupCreatePage /></MemoryRouter>);
      expect(screen.getByText('북한산 둘레길')).toBeTruthy();
      expect(screen.getByText('한강공원')).toBeTruthy();
      expect(screen.getByText(/12\.4 km/)).toBeTruthy();
    });

    it('코스 선택 후 그룹 만들기 버튼이 활성화된다', async () => {
      vi.resetModules();
      vi.doMock('../lib/supabase', () => ({ supabase: {} }));
      vi.doMock('../stores/GroupCreateStore', () => ({
        GroupCreateStore: makeMockStore({
          name: '내 그룹',
          courses: [{ id: 'c1', name: '북한산', distance_m: null, elevation_gain_m: null, gpx_path: 'a' }],
          selectedCourseId: 'c1',
        }),
      }));
      const { GroupCreatePage } = await import('./GroupCreatePage');
      render(<MemoryRouter><GroupCreatePage /></MemoryRouter>);
      const btn = screen.getByRole('button', { name: /그룹 만들기/i });
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    });

    it('GPX 업로드 탭으로 전환하면 파일 입력이 표시된다', async () => {
      vi.resetModules();
      vi.doMock('../lib/supabase', () => ({ supabase: {} }));
      vi.doMock('../stores/GroupCreateStore', () => ({
        GroupCreateStore: makeMockStore({ sourceMode: 'file' }),
      }));
      const { GroupCreatePage } = await import('./GroupCreatePage');
      const { container } = render(<MemoryRouter><GroupCreatePage /></MemoryRouter>);
      expect(container.querySelector('input[type="file"]')).toBeTruthy();
    });
  });
  ```

- [ ] **Step 3: 테스트 실행**

  ```bash
  npx vitest run src/pages/GroupCreatePage.test.tsx
  ```

  모든 테스트가 PASS인지 확인한다.

- [ ] **Step 4: 커밋**

  ```bash
  git add src/stores/GroupCreateStore.ts src/pages/GroupCreatePage.tsx src/pages/GroupCreatePage.test.tsx
  git commit -m "feat: 그룹 생성 시 코스 목록에서 선택 기능 추가"
  ```

---

## 최종 확인

- [ ] `npm run build` 실행 후 오류 없음 확인
- [ ] 개발 서버(`npm run dev`)에서 그룹 만들기 화면 직접 확인:
  - "코스 선택" 탭 기본 활성
  - 코스 카드 표시 및 선택 강조
  - "GPX 업로드" 탭 전환 시 기존 파일 입력 표시
  - 코스 선택 후 그룹 만들기 정상 동작
