# GroupPage 하단 세그먼트 칩 탭 UI 디자인 스펙

**날짜:** 2026-03-22
**상태:** 승인됨

---

## 개요

GroupPage의 상단 탭바(언더라인 스타일)를 제거하고, BottomTabBar 바로 위에 세그먼트 칩 컨트롤과 원형 FAB을 하나의 컨트롤 바로 통합한다.

---

## 현재 상태

- 상단에 "내가 만든 그룹" / "참여중인 그룹" 언더라인 탭바
- 하단 우측에 `absolute` 포지션 원형 FAB (`w-12 h-12`, `Plus size={22}`)
- BottomTabBar가 화면 하단 고정

---

## 변경 사항

### 1. 상단 탭바 제거

`GroupPage.tsx`에서 `<div className="flex border-b border-neutral-200 shrink-0">` 블록 전체를 제거한다.

### 2. `tabClass` 헬퍼 함수 제거

기존 `tabClass`는 `border-b-2` 기반 언더라인 스타일을 반환하므로 재사용 불가. 함수 전체를 제거하고 세그먼트 칩 버튼에 인라인 조건식으로 대체한다.

### 3. 최상위 `relative` 클래스 제거

기존 `relative`는 absolute FAB을 위한 것이었으므로, FAB이 flex flow 내부로 이동하면 제거한다.

```tsx
// 전
<div className="relative h-full flex flex-col bg-white">
// 후
<div className="h-full flex flex-col bg-white">
```

### 4. 기존 absolute FAB 제거

```tsx
// 제거
<button
  onClick={() => navigate('/group/new')}
  aria-label="그룹 만들기"
  className="absolute right-4 bottom-4 w-12 h-12 ..."
>
```

### 5. 하단 컨트롤 바 추가

BottomTabBar 바로 위, 리스트 아래에 컨트롤 바를 추가한다.

**컨트롤 바 컨테이너:**
- `flex items-center justify-between px-4 py-2.5 border-t border-neutral-200 bg-white shrink-0`

**세그먼트 칩:**
- 두 버튼을 `bg-neutral-100 rounded-lg p-0.5`로 묶어 하나의 컨트롤처럼 표시
- 활성 탭: `bg-black text-white rounded-md`
- 비활성 탭: `text-neutral-400`
- 텍스트: "내가 만든 그룹" → **"내가 만든"**, "참여중인 그룹" → **"참여중"** (칩 공간에 맞게 단축)
- 각 버튼 패딩: `py-1.5 px-4`, 폰트: `text-sm font-semibold`
- active 상태: 별도 스타일 불필요 (선택 상태가 이미 명확함)

**원형 FAB:**
- 기존 스타일 그대로 유지: `w-12 h-12 bg-black text-white rounded-full shadow-lg active:bg-neutral-800`
- `aria-label="그룹 만들기"` 유지
- `onClick={() => navigate('/group/new')}` 유지
- 아이콘: `<Plus size={22} />` 유지
- absolute 포지션에서 컨트롤 바 내 일반 flex 아이템으로 이동

### 6. 리스트 하단 패딩

리스트 컨테이너(`flex-1 overflow-y-auto`)에 `pb-2`를 추가하여 마지막 항목이 컨트롤 바에 시각적으로 잘리지 않도록 한다.

---

## 최종 컴포넌트 구조

```tsx
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
```

---

## 영향 범위

### `src/pages/GroupPage.tsx`
- 상단 탭바 블록 제거
- `tabClass` 헬퍼 함수 제거
- 최상위 div에서 `relative` 제거
- absolute FAB 제거
- 하단 컨트롤 바 추가
- 리스트 컨테이너에 `pb-2` 추가

### `src/pages/GroupPage.test.tsx`
탭 관련 테스트 쿼리 셀렉터 및 단언 업데이트:

| 위치 | 변경 전 | 변경 후 |
|------|---------|---------|
| 탭 버튼 쿼리 (1곳) | `getByRole('button', { name: '내가 만든 그룹' })` | `getByRole('button', { name: '내가 만든' })` |
| 탭 버튼 쿼리 (3곳: L70, L86, L99) | `getByRole('button', { name: '참여중인 그룹' })` | `getByRole('button', { name: '참여중' })` |
| 활성 탭 클래스 단언 | `toHaveClass('border-black')` | `toHaveClass('bg-black')` |

### `src/stores/GroupStore.ts`
변경 없음. `activeTab` 상태 및 `setActiveTab` 로직 그대로 사용.
