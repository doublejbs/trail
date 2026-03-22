# HIG 2단계 네비게이션 패턴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apple HIG 네비게이션 패턴을 적용한다 — BottomTabBar 탭 라벨 12px, 메인 탭 4개 페이지에 LargeTitle(28px), 드릴다운 4개 페이지에 NavigationBar(뒤로+제목) 컴포넌트를 추가한다.

**Architecture:** 재사용 컴포넌트 2개(`LargeTitle`, `NavigationBar`)를 신규 생성하고 8개 페이지에 적용한다. `NavigationBar`는 `overlay` prop으로 지도 오버레이 모드를, `rightAction` prop으로 우측 슬롯을 지원한다. HIG 1단계에서 추가한 `text-hig-title1`, `text-hig-caption`, `text-hig-headline`, `border-separator` CSS 클래스를 사용한다.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, lucide-react, Vitest + React Testing Library

---

## 파일 변경 목록

| 파일 | 변경 종류 | 내용 |
|------|----------|------|
| `src/components/BottomTabBar.tsx` | 수정 | 탭 라벨 `text-[10px]` → `text-hig-caption` |
| `src/components/LargeTitle.tsx` | 신규 | LargeTitle 컴포넌트 |
| `src/components/LargeTitle.test.tsx` | 신규 | LargeTitle 테스트 |
| `src/components/NavigationBar.tsx` | 신규 | NavigationBar 컴포넌트 |
| `src/components/NavigationBar.test.tsx` | 신규 | NavigationBar 테스트 |
| `src/pages/GroupPage.tsx` | 수정 | LargeTitle 추가 |
| `src/pages/GroupPage.test.tsx` | 수정 | LargeTitle heading 확인 테스트 추가 |
| `src/pages/CoursePage.tsx` | 수정 | 기존 헤더 제거 + LargeTitle 교체 |
| `src/pages/HistoryPage.tsx` | 수정 | 기존 헤더 제거 + LargeTitle 교체 |
| `src/pages/ProfilePage.tsx` | 수정 | 기존 헤더 제거 + LargeTitle 교체 + 레이아웃 수정 |
| `src/pages/GroupSettingsPage.tsx` | 수정 | 기존 헤더 제거 + NavigationBar 교체 |
| `src/pages/GroupMapPage.tsx` | 수정 | 기존 뒤로가기·설정 버튼 제거 + NavigationBar(overlay+rightAction) |
| `src/pages/CourseDetailPage.tsx` | 수정 | 기존 뒤로가기 버튼 제거 + NavigationBar(overlay) |
| `src/pages/InvitePage.tsx` | 수정 | NavigationBar 추가 |

---

## Task 1: BottomTabBar 탭 라벨 12px 적용

**Files:**
- Modify: `src/components/BottomTabBar.tsx:54`

- [ ] **Step 1: `text-[10px]`을 `text-hig-caption`으로 교체**

`src/components/BottomTabBar.tsx` line 54:

변경 전:
```tsx
className={`text-[10px] leading-none tracking-tight transition-all duration-200 ${
  active ? 'text-white font-semibold' : 'text-white/40 font-normal'
}`}
```

변경 후:
```tsx
className={`text-hig-caption leading-none tracking-tight transition-all duration-200 ${
  active ? 'text-white font-semibold' : 'text-white/40 font-normal'
}`}
```

> `text-hig-caption`은 `font-weight: 400`을 포함하지만, `font-semibold`/`font-normal` 조건부 클래스가 뒤에 오므로 활성 탭의 bold 스타일은 유지된다.

- [ ] **Step 2: 기존 테스트 통과 확인**

```bash
npx vitest run src/components/BottomTabBar.test.tsx
```

Expected: 4 tests passed

- [ ] **Step 3: 커밋**

```bash
git add src/components/BottomTabBar.tsx
git commit -m "feat: BottomTabBar 탭 라벨 text-hig-caption(12px) 적용"
```

---

## Task 2: LargeTitle 컴포넌트 생성

**Files:**
- Create: `src/components/LargeTitle.tsx`
- Create: `src/components/LargeTitle.test.tsx`

- [ ] **Step 1: 테스트 파일 작성**

`src/components/LargeTitle.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LargeTitle } from './LargeTitle';

describe('LargeTitle', () => {
  it('제목 텍스트를 h1으로 렌더링', () => {
    render(<LargeTitle title="그룹" />);
    expect(screen.getByRole('heading', { name: '그룹', level: 1 })).toBeInTheDocument();
  });

  it('text-hig-title1 클래스 적용', () => {
    render(<LargeTitle title="코스" />);
    expect(screen.getByRole('heading', { name: '코스', level: 1 })).toHaveClass('text-hig-title1');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/components/LargeTitle.test.tsx
```

Expected: FAIL — "Cannot find module './LargeTitle'"

- [ ] **Step 3: 컴포넌트 구현**

`src/components/LargeTitle.tsx`:

```tsx
interface LargeTitleProps {
  title: string;
}

export function LargeTitle({ title }: LargeTitleProps) {
  return (
    <div className="px-4 pt-5 pb-2">
      <h1 className="text-hig-title1">{title}</h1>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/components/LargeTitle.test.tsx
```

Expected: 2 tests passed

- [ ] **Step 5: 커밋**

```bash
git add src/components/LargeTitle.tsx src/components/LargeTitle.test.tsx
git commit -m "feat: LargeTitle 컴포넌트 추가"
```

---

## Task 3: LargeTitle 4개 페이지에 적용

**Files:**
- Modify: `src/pages/GroupPage.tsx`
- Modify: `src/pages/GroupPage.test.tsx`
- Modify: `src/pages/CoursePage.tsx`
- Modify: `src/pages/HistoryPage.tsx`
- Modify: `src/pages/ProfilePage.tsx`

- [ ] **Step 1: GroupPage 테스트에 heading 확인 추가**

`src/pages/GroupPage.test.tsx`의 `describe('GroupPage', ...)` 블록 안에 테스트 추가:

```tsx
it('그룹 Large Title이 h1으로 렌더링된다', () => {
  renderGroupPage();
  expect(screen.getByRole('heading', { name: '그룹', level: 1 })).toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/pages/GroupPage.test.tsx
```

Expected: 새로 추가한 테스트만 FAIL

- [ ] **Step 3: GroupPage에 LargeTitle 추가**

`src/pages/GroupPage.tsx` 상단 import에 추가:
```tsx
import { LargeTitle } from '../components/LargeTitle';
```

`src/pages/GroupPage.tsx` line 48 — 스크롤 영역(`<div className="flex-1 overflow-y-auto pb-2">`) 바로 안에 첫 줄로 삽입:

변경 전:
```tsx
      <div className="flex-1 overflow-y-auto pb-2">
        {visibleGroups.length === 0 ? (
```

변경 후:
```tsx
      <div className="flex-1 overflow-y-auto pb-2">
        <LargeTitle title="그룹" />
        {visibleGroups.length === 0 ? (
```

- [ ] **Step 4: CoursePage 헤더 교체**

`src/pages/CoursePage.tsx` import에 추가:
```tsx
import { LargeTitle } from '../components/LargeTitle';
```

lines 30-32 (Header div) 삭제:
```tsx
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-neutral-100">
        <h1 className="text-base font-semibold">코스</h1>
      </div>
```

그 자리에 교체:
```tsx
      <LargeTitle title="코스" />
```

- [ ] **Step 5: HistoryPage 헤더 교체**

`src/pages/HistoryPage.tsx` import에 추가:
```tsx
import { LargeTitle } from '../components/LargeTitle';
```

lines 69-71 (header div) 삭제:
```tsx
      <div className="flex items-center px-4 py-3 border-b border-neutral-100">
        <h1 className="text-base font-semibold">기록</h1>
      </div>
```

그 자리에 교체:
```tsx
      <LargeTitle title="기록" />
```

- [ ] **Step 6: ProfilePage 헤더 교체 + 레이아웃 수정**

`src/pages/ProfilePage.tsx` import에 추가:
```tsx
import { LargeTitle } from '../components/LargeTitle';
```

line 20 — 외부 div에서 `items-center justify-center` 제거:

변경 전 (`return` 전체):
```tsx
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-white px-6">
      <p className="text-lg font-semibold">프로필</p>

      <div className="w-full max-w-xs flex flex-col gap-2">
        <label className="text-sm text-neutral-500">닉네임</label>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="표시될 이름을 입력하세요"
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <Button
          onClick={() => void profileStore.save(inputValue)}
          disabled={profileStore.saving || !inputValue.trim()}
          className="w-full"
        >
          {profileStore.saving ? '저장 중...' : '저장'}
        </Button>
      </div>

      <Button variant="outline" onClick={() => authStore.signOut()}>
        로그아웃
      </Button>
    </div>
  );
```

변경 후 (`return` 전체):
```tsx
  return (
    <div className="flex h-full flex-col bg-white">
      <LargeTitle title="프로필" />
      <div className="flex flex-col items-center gap-4 px-6 pt-4">
        <div className="w-full max-w-xs flex flex-col gap-2">
          <label className="text-sm text-neutral-500">닉네임</label>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="표시될 이름을 입력하세요"
            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          <Button
            onClick={() => void profileStore.save(inputValue)}
            disabled={profileStore.saving || !inputValue.trim()}
            className="w-full"
          >
            {profileStore.saving ? '저장 중...' : '저장'}
          </Button>
        </div>

        <Button variant="outline" onClick={() => authStore.signOut()}>
          로그아웃
        </Button>
      </div>
    </div>
  );
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
npx vitest run src/pages/GroupPage.test.tsx src/pages/ProfilePage.test.tsx
```

Expected: 모두 통과

- [ ] **Step 8: 빌드 확인**

```bash
npm run build
```

Expected: 에러 없이 성공

- [ ] **Step 9: 커밋**

```bash
git add src/pages/GroupPage.tsx src/pages/GroupPage.test.tsx src/pages/CoursePage.tsx src/pages/HistoryPage.tsx src/pages/ProfilePage.tsx
git commit -m "feat: 메인 탭 4개 페이지에 LargeTitle 적용"
```

---

## Task 4: NavigationBar 컴포넌트 생성

**Files:**
- Create: `src/components/NavigationBar.tsx`
- Create: `src/components/NavigationBar.test.tsx`

- [ ] **Step 1: 테스트 파일 작성**

`src/components/NavigationBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavigationBar } from './NavigationBar';

describe('NavigationBar', () => {
  it('제목 텍스트 렌더링', () => {
    render(<NavigationBar title="그룹 설정" onBack={vi.fn()} />);
    expect(screen.getByText('그룹 설정')).toBeInTheDocument();
  });

  it('뒤로 버튼 클릭 시 onBack 호출', () => {
    const onBack = vi.fn();
    render(<NavigationBar title="테스트" onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /뒤로/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('rightAction이 전달되면 우측 슬롯에 렌더링', () => {
    render(
      <NavigationBar
        title="테스트"
        onBack={vi.fn()}
        rightAction={<button>설정</button>}
      />
    );
    expect(screen.getByRole('button', { name: '설정' })).toBeInTheDocument();
  });

  it('overlay=true이면 absolute 클래스 포함', () => {
    const { container } = render(
      <NavigationBar title="테스트" onBack={vi.fn()} overlay />
    );
    expect(container.firstChild).toHaveClass('absolute');
  });

  it('overlay=false(기본값)이면 absolute 클래스 없음', () => {
    const { container } = render(
      <NavigationBar title="테스트" onBack={vi.fn()} />
    );
    expect(container.firstChild).not.toHaveClass('absolute');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/components/NavigationBar.test.tsx
```

Expected: FAIL — "Cannot find module './NavigationBar'"

- [ ] **Step 3: 컴포넌트 구현**

`src/components/NavigationBar.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

interface NavigationBarProps {
  title: string;
  onBack: () => void;
  overlay?: boolean;
  rightAction?: ReactNode;
}

export function NavigationBar({ title, onBack, overlay = false, rightAction }: NavigationBarProps) {
  return (
    <div
      className={[
        'flex items-center px-4',
        overlay
          ? 'absolute top-0 left-0 right-0 z-20 bg-white/80 backdrop-blur-sm border-b border-separator'
          : 'border-b border-separator bg-white',
      ].join(' ')}
      style={{ minHeight: '44px' }}
    >
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-hig-headline min-h-0 min-w-0"
      >
        <ChevronLeft size={20} />
        뒤로
      </button>
      <span className="flex-1 text-center text-hig-headline font-semibold">{title}</span>
      <div className="w-[60px] flex justify-end">
        {rightAction}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/components/NavigationBar.test.tsx
```

Expected: 5 tests passed

- [ ] **Step 5: 커밋**

```bash
git add src/components/NavigationBar.tsx src/components/NavigationBar.test.tsx
git commit -m "feat: NavigationBar 컴포넌트 추가 (overlay, rightAction prop 지원)"
```

---

## Task 5: NavigationBar — GroupSettingsPage 적용

**Files:**
- Modify: `src/pages/GroupSettingsPage.tsx:54-65`

- [ ] **Step 1: 헤더 교체**

`src/pages/GroupSettingsPage.tsx` import에 추가:
```tsx
import { NavigationBar } from '../components/NavigationBar';
```

lines 54-65 (header div 전체) 삭제:
```tsx
  return (
    <div className="absolute inset-0 overflow-y-auto bg-white">
      {/* Header */}
      <div className="flex items-center px-4 py-4 border-b border-neutral-200">
        <button
          onClick={() => navigate(`/group/${id}`)}
          className="text-sm text-neutral-500 mr-3"
        >
          ←
        </button>
        <h1 className="text-base font-semibold">{store.group.name} 설정</h1>
      </div>
```

변경 후:
```tsx
  return (
    <div className="absolute inset-0 overflow-y-auto bg-white">
      <NavigationBar
        title={`${store.group.name} 설정`}
        onBack={() => navigate(-1)}
      />
```

- [ ] **Step 2: 기존 테스트 통과 확인**

```bash
npx vitest run src/pages/GroupSettingsPage.test.tsx
```

Expected: 모두 통과

- [ ] **Step 3: 커밋**

```bash
git add src/pages/GroupSettingsPage.tsx
git commit -m "feat: GroupSettingsPage NavigationBar 적용"
```

---

## Task 6: NavigationBar — GroupMapPage 적용 (overlay + rightAction)

**Files:**
- Modify: `src/pages/GroupMapPage.tsx:315-336`

- [ ] **Step 1: import 추가**

`src/pages/GroupMapPage.tsx` 상단 import에 추가:
```tsx
import { NavigationBar } from '../components/NavigationBar';
```

- [ ] **Step 2: 기존 뒤로가기 + 설정 버튼 블록 삭제**

lines 315-336 전체를 삭제한다:
```tsx
      {/* 뒤로가기 버튼 */}
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => navigate('/group')}
          className="bg-white/90 text-black px-3 py-1 rounded-full text-sm font-medium shadow"
        >
          ← {store.group.name}
        </button>
      </div>

      {/* 설정 버튼 (소유자 전용) */}
      {store.currentUserId && store.group && store.currentUserId === store.group.created_by && (
        <div className="absolute top-4 right-4 z-10">
          <a
            href={`/group/${id}/settings`}
            aria-label="설정"
            className="bg-white/90 text-black px-3 py-1 rounded-full text-sm font-medium shadow"
          >
            ⚙ 설정
          </a>
        </div>
      )}
```

- [ ] **Step 3: 탭 칩 div 바로 앞에 NavigationBar 삽입**

line 300의 탭 칩 `<div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 flex gap-2">` 바로 앞에 삽입한다:

```tsx
      <NavigationBar
        title="그룹 지도"
        onBack={() => navigate(-1)}
        overlay
        rightAction={
          store.currentUserId && store.group && store.currentUserId === store.group.created_by ? (
            <a
              href={`/group/${id}/settings`}
              aria-label="설정"
              className="text-hig-headline min-h-0 min-w-0"
            >
              ⚙
            </a>
          ) : undefined
        }
      />
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 flex gap-2">
```

> NavigationBar는 `z-20`을 사용해 탭 칩(`z-10`)보다 확실히 위에 렌더링된다. 탭 칩 `top-14`(56px)는 NavigationBar 44px 아래에 위치한다.

- [ ] **Step 4: 기존 테스트 통과 확인**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```

Expected: 통과 (pre-existing 실패가 있다면 이 Task와 무관한 것)

- [ ] **Step 5: 커밋**

```bash
git add src/pages/GroupMapPage.tsx
git commit -m "feat: GroupMapPage NavigationBar(overlay) 적용, 설정버튼 rightAction으로 이동"
```

---

## Task 7: NavigationBar — CourseDetailPage 적용 (overlay)

**Files:**
- Modify: `src/pages/CourseDetailPage.tsx:107-115`

- [ ] **Step 1: 뒤로가기 버튼 교체**

`src/pages/CourseDetailPage.tsx` import에 추가:
```tsx
import { NavigationBar } from '../components/NavigationBar';
```

지도 영역 `<div className="absolute inset-x-0 top-0" style={{ height: MAP_HEIGHT }}>` 내부의 Back button 블록 삭제:
```tsx
        {/* Back button */}
        <div className="absolute top-4 left-4">
          <button
            onClick={() => navigate('/course')}
            className="bg-white/90 text-black px-3 py-1 rounded-full text-sm font-medium shadow"
          >
            ← 코스
          </button>
        </div>
```

지도 영역 `<div className="absolute inset-x-0 top-0">` 바로 안, `<div ref={mapRef} ...>` 앞에 NavigationBar 삽입:
```tsx
      <div className="absolute inset-x-0 top-0" style={{ height: MAP_HEIGHT }}>
        <NavigationBar
          title="코스 상세"
          onBack={() => navigate(-1)}
          overlay
        />
        <div ref={mapRef} data-testid="map-container" className="absolute inset-0 w-full h-full" />
```

> NavigationBar(44px)는 지도 위에 오버레이된다. 스크롤 콘텐츠(`top: 45vh`)는 지도 아래에 있어 영향 없음.

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 에러 없이 성공

- [ ] **Step 3: 커밋**

```bash
git add src/pages/CourseDetailPage.tsx
git commit -m "feat: CourseDetailPage NavigationBar(overlay) 적용"
```

---

## Task 8: NavigationBar — InvitePage 적용

**Files:**
- Modify: `src/pages/InvitePage.tsx`

- [ ] **Step 1: NavigationBar 추가**

`src/pages/InvitePage.tsx` import에 추가:
```tsx
import { NavigationBar } from '../components/NavigationBar';
```

각 렌더링 상태에 NavigationBar 추가 (Navigate 리다이렉트와 `return null` 제외):

변경 전:
```tsx
  if (!store.sessionChecked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  // ... (Navigate 리다이렉트는 그대로 유지)
  if (store.status === 'loading' || store.status === 'idle') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (store.status === 'invalid') {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <p className="text-sm text-neutral-500">유효하지 않은 초대 링크입니다</p>
      </div>
    );
  }

  if (store.status === 'full') {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <p className="text-sm text-neutral-500">그룹이 가득 찼습니다</p>
      </div>
    );
  }
```

변경 후:
```tsx
  if (!store.sessionChecked) {
    return (
      <div className="flex flex-col h-screen bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }
  // ... (Navigate 리다이렉트는 그대로 유지)
  if (store.status === 'loading' || store.status === 'idle') {
    return (
      <div className="flex flex-col h-screen bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (store.status === 'invalid') {
    return (
      <div className="flex flex-col h-screen bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-sm text-neutral-500">유효하지 않은 초대 링크입니다</p>
        </div>
      </div>
    );
  }

  if (store.status === 'full') {
    return (
      <div className="flex flex-col h-screen bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-sm text-neutral-500">그룹이 가득 찼습니다</p>
        </div>
      </div>
    );
  }
```

- [ ] **Step 2: 기존 테스트 통과 확인**

```bash
npx vitest run src/pages/InvitePage.test.tsx
```

Expected: 모두 통과

- [ ] **Step 3: 커밋**

```bash
git add src/pages/InvitePage.tsx
git commit -m "feat: InvitePage NavigationBar 적용"
```

---

## 최종 검증

- [ ] **빌드 성공 확인**

```bash
npm run build
```

Expected: 에러 없이 성공, `dist/` 생성

- [ ] **전체 테스트 통과 확인**

```bash
npm run test:run
```

Expected: 36+ test files 통과

> 참고: `GroupMapPage.test.tsx`와 `TrackingStore.test.ts`에 이전 커밋(`f348bbe`)에서 발생한 기존 실패가 있을 수 있음. 이번 Task와 무관한 pre-existing 실패이므로 새로운 실패가 없으면 완료.
