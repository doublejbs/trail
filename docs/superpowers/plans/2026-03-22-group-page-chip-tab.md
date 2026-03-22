# GroupPage 하단 세그먼트 칩 탭 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GroupPage의 상단 언더라인 탭바를 제거하고, 하단에 세그먼트 칩 + 원형 FAB을 하나의 컨트롤 바로 통합한다.

**Architecture:** 테스트를 먼저 새 UI에 맞게 업데이트한 뒤(실패 확인), GroupPage.tsx를 변경해 테스트를 통과시킨다. GroupStore는 변경하지 않는다.

**Tech Stack:** React 19, TypeScript, MobX 6, Tailwind CSS 4, Vitest, React Testing Library

---

## 파일 변경 목록

| 파일 | 변경 종류 | 내용 |
|------|----------|------|
| `src/pages/GroupPage.test.tsx` | 수정 | 탭 버튼 쿼리 레이블, 활성 클래스 단언 업데이트 |
| `src/pages/GroupPage.tsx` | 수정 | 상단 탭바 제거, 하단 컨트롤 바 추가 |

---

## Task 1: 테스트 업데이트 (실패 상태로 만들기)

**Files:**
- Modify: `src/pages/GroupPage.test.tsx`

- [ ] **Step 1: 테스트에서 탭 버튼 쿼리 레이블 변경**

`src/pages/GroupPage.test.tsx` 에서 아래 5곳을 변경한다.

```typescript
// L48: '내가 만든 그룹' → '내가 만든'
const ownedTab = screen.getByRole('button', { name: '내가 만든' });

// L49: 'border-black' → 'bg-black'
expect(ownedTab).toHaveClass('bg-black');

// L70: '참여중인 그룹' → '참여중'
fireEvent.click(screen.getByRole('button', { name: '참여중' }));

// L86: '참여중인 그룹' → '참여중'
fireEvent.click(screen.getByRole('button', { name: '참여중' }));

// L99: '참여중인 그룹' → '참여중'
fireEvent.click(screen.getByRole('button', { name: '참여중' }));
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/pages/GroupPage.test.tsx
```

Expected: 5개 테스트 FAIL (`Unable to find role="button" with name "내가 만든"` 등)

---

## Task 2: GroupPage.tsx UI 변경

**Files:**
- Modify: `src/pages/GroupPage.tsx`

- [ ] **Step 1: 상단 탭바 블록, `tabClass` 함수, `relative` 클래스 제거**

`src/pages/GroupPage.tsx` 를 아래와 같이 변경한다.

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
  const visibleGroups = store.activeTab === 'owned' ? ownedGroups : joinedGroups;
  const emptyMessage =
    store.activeTab === 'owned'
      ? '아직 만든 그룹이 없습니다'
      : '아직 참여한 그룹이 없습니다';

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Group list */}
      <div className="flex-1 overflow-y-auto pb-2">
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

      {/* Bottom control bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-neutral-200 bg-white shrink-0">
        {/* Segmented chip */}
        <div className="flex-1 flex justify-center">
          <div className="flex bg-neutral-100 rounded-lg p-0.5">
            <button
              onClick={() => store.setActiveTab('owned')}
              className={`py-1.5 px-4 text-sm font-semibold rounded-md transition-colors ${
                store.activeTab === 'owned' ? 'bg-black text-white' : 'text-neutral-400'
              }`}
            >
              내가 만든
            </button>
            <button
              onClick={() => store.setActiveTab('joined')}
              className={`py-1.5 px-4 text-sm font-semibold rounded-md transition-colors ${
                store.activeTab === 'joined' ? 'bg-black text-white' : 'text-neutral-400'
              }`}
            >
              참여중
            </button>
          </div>
        </div>
        {/* FAB */}
        <button
          onClick={() => navigate('/group/new')}
          aria-label="그룹 만들기"
          className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center shadow-lg active:bg-neutral-800"
        >
          <Plus size={22} />
        </button>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: 테스트 실행 — 통과 확인**

```bash
npx vitest run src/pages/GroupPage.test.tsx
```

Expected: 5개 테스트 모두 PASS

- [ ] **Step 3: 커밋**

```bash
git add src/pages/GroupPage.tsx src/pages/GroupPage.test.tsx
git commit -m "feat: 그룹 페이지 탭을 하단 세그먼트 칩 + FAB 컨트롤 바로 교체"
```
