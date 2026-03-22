# Apple HIG 네비게이션 패턴 디자인 스펙 (2단계)

**날짜:** 2026-03-22
**상태:** 승인됨

---

## 개요

HIG 1단계(전역 CSS 기반)에 이어, 2단계에서는 네비게이션 UI를 HIG 패턴으로 개선한다. 재사용 컴포넌트 2개를 신규 생성하고, 기존 8개 페이지에 적용한다.

**변경 범위:**
1. `BottomTabBar` — 탭 라벨 12px (아이콘은 이미 20px)
2. `LargeTitle` 컴포넌트 — 메인 탭 4개 페이지에 적용
3. `NavigationBar` 컴포넌트 — 드릴다운 4개 페이지에 적용

---

## 1. BottomTabBar 개선

**파일:** `src/components/BottomTabBar.tsx`

탭 라벨 폰트 크기를 현재 `text-[10px]`에서 `text-hig-caption`(12px)으로 교체한다.

> **주의:** `text-hig-caption`은 `font-weight: 400`을 포함한다. 기존 활성 탭의 `font-semibold` 조건부 클래스는 그대로 유지해야 한다 — `font-semibold`는 `text-hig-caption`과 별도 클래스로 공존시킨다.

> 아이콘 크기는 이미 `size={20}`으로 설정되어 있음 — 변경 불필요.

터치 타겟(min-height: 44px)은 HIG 1단계에서 전역 적용됨 — 별도 작업 불필요.

---

## 2. LargeTitle 컴포넌트

**파일:** `src/components/LargeTitle.tsx` (신규 생성)

### Props

```typescript
interface LargeTitleProps {
  title: string;
}
```

### 구조

```tsx
export function LargeTitle({ title }: LargeTitleProps) {
  return (
    <div className="px-4 pt-5 pb-2">
      <h1 className="text-hig-title1">{title}</h1>
    </div>
  );
}
```

- `text-hig-title1`: 28px, font-weight 700, letter-spacing -0.5px, line-height 1.2 (HIG 1단계에서 정의됨)
- 좌우 패딩 `px-4`(16px), 상단 `pt-5`(20px), 하단 `pb-2`(8px)

### 적용 페이지

| 페이지 | 파일 | 제목 | 기존 헤더 처리 |
|--------|------|------|----------------|
| 그룹 | `src/pages/GroupPage.tsx` | 그룹 | 별도 제목 없음 — 추가만 |
| 코스 | `src/pages/CoursePage.tsx` | 코스 | 기존 `<h1>코스</h1>` 블록 제거 후 교체 |
| 기록 | `src/pages/HistoryPage.tsx` | 기록 | 기존 `<h1>기록</h1>` 블록 제거 후 교체 |
| 프로필 | `src/pages/ProfilePage.tsx` | 프로필 | 기존 `<p>프로필</p>` 제거 후 교체 |

각 페이지 컨텐츠 최상단(스크롤 영역 내부)에 `<LargeTitle title="..." />`을 추가한다.

> **ProfilePage 레이아웃 주의:** 현재 `flex flex-col items-center justify-center`로 가운데 정렬되어 있다. LargeTitle을 최상단에 배치하려면 `justify-center`를 제거하고 위쪽 정렬 구조로 바꿔야 한다.

---

## 3. NavigationBar 컴포넌트

**파일:** `src/components/NavigationBar.tsx` (신규 생성)

### Props

```typescript
interface NavigationBarProps {
  title: string;
  onBack: () => void;
  overlay?: boolean;       // true이면 absolute 오버레이 스타일 (지도 페이지용)
  rightAction?: ReactNode; // 우측 슬롯 (선택적 액션 버튼)
}
```

### 구조

```tsx
export function NavigationBar({ title, onBack, overlay = false, rightAction }: NavigationBarProps) {
  return (
    <div
      className={[
        'flex items-center px-4',
        overlay
          ? 'absolute top-0 left-0 right-0 z-10 bg-white/80 backdrop-blur-sm border-b border-separator'
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

- `overlay` prop:
  - `true`: `absolute top-0` + 반투명 배경(`bg-white/80 backdrop-blur-sm`) — 지도 위 오버레이
  - `false`(기본값): 일반 흐름 배치 + 흰색 배경
- `rightAction` prop: 우측 60px 슬롯에 액션 버튼 배치 (설정 버튼 등)
- `min-h-0 min-w-0`: 전역 `button { min-height: 44px }` 규칙 오버라이드 (NavigationBar 자체가 44px이므로 내부 버튼에서 불필요)
- `border-separator`: `--separator` 색상 토큰 (rgba(0,0,0,0.15))
- 우측 `div.w-[60px]`: 좌측 뒤로 버튼과 균형 맞춤 (제목 완전 중앙 정렬)
- `onBack`: `useNavigate()`의 `navigate(-1)` 호출

### 적용 페이지

| 페이지 | 파일 | 제목 | overlay | rightAction | 기존 헤더 처리 |
|--------|------|------|---------|-------------|----------------|
| 그룹 지도 | `src/pages/GroupMapPage.tsx` | 그룹 지도 | `true` | 설정 버튼 (소유자 전용) | 기존 `absolute top-4 left-4` 뒤로가기 + `absolute top-4 right-4` 설정 버튼 제거 후 NavigationBar로 통합 |
| 그룹 설정 | `src/pages/GroupSettingsPage.tsx` | `{store.group.name} 설정` | `false` | 없음 | 기존 헤더 div 제거 후 교체 |
| 코스 상세 | `src/pages/CourseDetailPage.tsx` | 코스 상세 | `true` | 없음 | 기존 `absolute top-4 left-4` 뒤로가기 버튼 제거 후 교체 |
| 그룹 참여 | `src/pages/InvitePage.tsx` | 그룹 참여 | `false` | 없음 | 기존 헤더 없음 — 최상단에 추가 |

> **GroupMapPage 설정 버튼 통합:** 현재 `absolute top-4 right-4`의 설정 버튼(소유자 전용 조건부 렌더링)을 NavigationBar의 `rightAction` prop으로 이동한다. 조건부 렌더링 로직은 그대로 유지.

> **CourseDetailPage overlay 레이아웃:** 이 페이지는 지도가 상단 45vh 영역을 차지하고, 스크롤 가능한 콘텐츠가 그 아래에 배치된다. NavigationBar(`overlay=true`, `min-height: 44px`)는 지도 상단 44px에 오버레이되며, 스크롤 콘텐츠 영역(`top: 45vh`)은 NavigationBar보다 아래에 있어 영향 없음.

> **InvitePage:** 성공 시 즉시 navigate로 이탈하므로 로딩·에러 화면에만 NavigationBar가 표시된다. 에러 상태에서 뒤로가기가 가능해져 UX상 유용하다.

---

## 영향 범위

| 파일 | 변경 종류 | 내용 |
|------|----------|------|
| `src/components/BottomTabBar.tsx` | 수정 | 탭 라벨 `text-[10px]` → `text-hig-caption` (font-semibold 유지) |
| `src/components/LargeTitle.tsx` | 신규 | LargeTitle 컴포넌트 |
| `src/components/NavigationBar.tsx` | 신규 | NavigationBar 컴포넌트 (overlay, rightAction prop 포함) |
| `src/pages/GroupPage.tsx` | 수정 | LargeTitle 추가 |
| `src/pages/CoursePage.tsx` | 수정 | 기존 헤더 제거 + LargeTitle 교체 |
| `src/pages/HistoryPage.tsx` | 수정 | 기존 헤더 제거 + LargeTitle 교체 |
| `src/pages/ProfilePage.tsx` | 수정 | 기존 헤더 제거 + LargeTitle 교체 + justify-center 제거 |
| `src/pages/GroupMapPage.tsx` | 수정 | NavigationBar(overlay, rightAction) 교체; 기존 뒤로가기·설정 버튼 제거 |
| `src/pages/GroupSettingsPage.tsx` | 수정 | NavigationBar 교체 |
| `src/pages/CourseDetailPage.tsx` | 수정 | NavigationBar(overlay) 교체 |
| `src/pages/InvitePage.tsx` | 수정 | NavigationBar 추가 |

**변경 없는 파일:** `src/index.css`, 스토어, 라우터, 기타 컴포넌트

---

## 검증 방법

1. `npm run build` — 빌드 성공 확인
2. `npm run test:run` — 기존 테스트 통과 확인
3. DevTools에서 BottomTabBar 탭 라벨이 12px로 렌더링되는지 확인
4. 그룹 페이지 진입 시 28px Large Title "그룹" 표시 확인
5. GroupSettingsPage에서 NavigationBar 표시 및 뒤로가기 동작 확인
6. GroupMapPage에서 NavigationBar가 지도 위 오버레이로 표시, 설정 버튼이 우측 슬롯에 위치하는지 확인
7. CourseDetailPage에서 NavigationBar overlay + 하단 스크롤 콘텐츠 정상 표시 확인
