# GroupPage Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "내가 만든 그룹" / "참여중인 그룹" tabs to GroupPage, replacing the existing 소유자/멤버 badges.

**Architecture:** Client-side filter of `store.groups` using `store.currentUserId`. A single `useState<'owned' | 'joined'>` tracks the active tab. No new stores, routes, or API calls.

**Tech Stack:** React 19, TypeScript, MobX (`observer`), Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-03-20-group-page-tabs-design.md`

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `src/pages/GroupPage.tsx` | Add tab state, filtering, tab UI; remove badges and global empty check |
| Modify | `src/pages/GroupPage.test.tsx` | Delete badge tests; add tab behaviour tests |

---

## Task 1: GroupPage Tabs

**Files:**
- Modify: `src/pages/GroupPage.tsx`
- Modify: `src/pages/GroupPage.test.tsx`

---

- [ ] **Step 1: Replace test file with failing tests**

Replace the full content of `src/pages/GroupPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GroupPage } from './GroupPage';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    groups: [] as { id: string; name: string; created_by: string; gpx_path: string; created_at: string; max_members: null }[],
    loading: false,
    error: false,
    currentUserId: 'owner-id',
    load: vi.fn(),
  },
}));

vi.mock('../stores/GroupStore', () => ({
  GroupStore: vi.fn(function () { return mockStore; }),
}));

const renderGroupPage = () =>
  render(
    <MemoryRouter initialEntries={['/group']}>
      <Routes>
        <Route path="/group" element={<GroupPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('GroupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.loading = false;
    mockStore.error = false;
    mockStore.currentUserId = 'owner-id';
    mockStore.groups = [];
  });

  it('기본 탭은 "내가 만든 그룹"', () => {
    renderGroupPage();
    const ownedTab = screen.getByRole('button', { name: '내가 만든 그룹' });
    expect(ownedTab).toHaveClass('border-black');
  });

  it('"내가 만든 그룹" 탭: created_by === currentUserId 그룹만 표시', async () => {
    mockStore.groups = [
      { id: 'g1', name: '내 그룹', created_by: 'owner-id', gpx_path: '', created_at: '', max_members: null },
      { id: 'g2', name: '남의 그룹', created_by: 'other-user', gpx_path: '', created_at: '', max_members: null },
    ];
    renderGroupPage();
    await waitFor(() => {
      expect(screen.getByText('내 그룹')).toBeInTheDocument();
      expect(screen.queryByText('남의 그룹')).not.toBeInTheDocument();
    });
  });

  it('"참여중인 그룹" 탭: created_by !== currentUserId 그룹만 표시', async () => {
    mockStore.groups = [
      { id: 'g1', name: '내 그룹', created_by: 'owner-id', gpx_path: '', created_at: '', max_members: null },
      { id: 'g2', name: '남의 그룹', created_by: 'other-user', gpx_path: '', created_at: '', max_members: null },
    ];
    renderGroupPage();
    fireEvent.click(screen.getByRole('button', { name: '참여중인 그룹' }));
    await waitFor(() => {
      expect(screen.queryByText('내 그룹')).not.toBeInTheDocument();
      expect(screen.getByText('남의 그룹')).toBeInTheDocument();
    });
  });

  it('"내가 만든 그룹" 탭 비었을 때 전용 empty 메시지', async () => {
    renderGroupPage();
    await waitFor(() => {
      expect(screen.getByText('아직 만든 그룹이 없습니다')).toBeInTheDocument();
    });
  });

  it('"참여중인 그룹" 탭 비었을 때 전용 empty 메시지', async () => {
    renderGroupPage();
    fireEvent.click(screen.getByRole('button', { name: '참여중인 그룹' }));
    await waitFor(() => {
      expect(screen.getByText('아직 참여한 그룹이 없습니다')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/pages/GroupPage.test.tsx
```

Expected: FAIL — tab buttons don't exist yet.

- [ ] **Step 3: Replace GroupPage implementation**

Replace the full content of `src/pages/GroupPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Plus } from 'lucide-react';
import { GroupStore } from '../stores/GroupStore';

type Tab = 'owned' | 'joined';

export const GroupPage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new GroupStore());
  const [activeTab, setActiveTab] = useState<Tab>('owned');

  useEffect(() => {
    store.load();
  }, [store]);

  if (store.loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (store.error) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <p className="text-sm text-neutral-400">그룹을 불러올 수 없습니다</p>
      </div>
    );
  }

  const ownedGroups = store.groups.filter(
    (g) => g.created_by === store.currentUserId
  );
  const joinedGroups = store.groups.filter(
    (g) => g.created_by !== store.currentUserId
  );
  const visibleGroups = activeTab === 'owned' ? ownedGroups : joinedGroups;
  const emptyMessage =
    activeTab === 'owned'
      ? '아직 만든 그룹이 없습니다'
      : '아직 참여한 그룹이 없습니다';

  const tabClass = (tab: Tab) =>
    `flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
      activeTab === tab
        ? 'border-black text-black'
        : 'border-transparent text-neutral-400'
    }`;

  return (
    <div className="relative h-full flex flex-col bg-white">
      {/* Tab bar */}
      <div className="flex border-b border-neutral-200 shrink-0">
        <button
          className={tabClass('owned')}
          onClick={() => setActiveTab('owned')}
        >
          내가 만든 그룹
        </button>
        <button
          className={tabClass('joined')}
          onClick={() => setActiveTab('joined')}
        >
          참여중인 그룹
        </button>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto">
        {visibleGroups.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-neutral-400">{emptyMessage}</p>
          </div>
        ) : (
          visibleGroups.map((group) => (
            <button
              key={group.id}
              onClick={() => navigate(`/group/${group.id}`)}
              className="w-full px-4 py-4 text-left text-black border-b border-neutral-200 active:bg-neutral-100"
            >
              {group.name}
            </button>
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate('/group/new')}
        aria-label="그룹 만들기"
        className="absolute right-4 bottom-4 w-12 h-12 bg-black text-white rounded-full flex items-center justify-center shadow-lg active:bg-neutral-800"
      >
        <Plus size={22} />
      </button>
    </div>
  );
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/pages/GroupPage.test.tsx
```

Expected: all PASS

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/GroupPage.tsx src/pages/GroupPage.test.tsx
git commit -m "feat: GroupPage — 내가 만든 그룹 / 참여중인 그룹 tabs"
```
