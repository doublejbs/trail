# Apple HIG 네비게이션 패턴 디자인 스펙 (2단계)

**날짜:** 2026-03-22
**상태:** 승인됨

---

## 개요

HIG 1단계(전역 CSS 기반)에 이어, 2단계에서는 네비게이션 UI를 HIG 패턴으로 개선한다. 재사용 컴포넌트 2개를 신규 생성하고, 기존 8개 페이지에 적용한다.

**변경 범위:**
1. `BottomTabBar` — 탭 라벨 12px, 아이콘 20px
2. `LargeTitle` 컴포넌트 — 메인 탭 4개 페이지에 적용
3. `NavigationBar` 컴포넌트 — 드릴다운 4개 페이지에 적용

---

## 1. BottomTabBar 개선

**파일:** `src/components/BottomTabBar.tsx`

탭 라벨 폰트 크기를 현재 `text-[10px]`에서 `text-hig-caption`(12px)으로 교체한다.
아이콘 크기를 현재 16px에서 20px로 조정한다.

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

| 페이지 | 파일 | 제목 |
|--------|------|------|
| 그룹 | `src/pages/GroupPage.tsx` | 그룹 |
| 코스 | `src/pages/CoursePage.tsx` | 코스 |
| 기록 | `src/pages/HistoryPage.tsx` | 기록 |
| 프로필 | `src/pages/ProfilePage.tsx` | 프로필 |

각 페이지 컨텐츠 최상단(스크롤 영역 내부)에 `<LargeTitle title="..." />`을 추가한다.
기존 페이지에 별도 제목 텍스트가 있으면 제거한다.

---

## 3. NavigationBar 컴포넌트

**파일:** `src/components/NavigationBar.tsx` (신규 생성)

### Props

```typescript
interface NavigationBarProps {
  title: string;
  onBack: () => void;
}
```

### 구조

```tsx
export function NavigationBar({ title, onBack }: NavigationBarProps) {
  return (
    <div className="flex items-center px-4 border-b border-separator" style={{ minHeight: '44px' }}>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-hig-headline min-h-0 min-w-0"
      >
        <ChevronLeft size={20} />
        뒤로
      </button>
      <span className="flex-1 text-center text-hig-headline font-semibold">{title}</span>
      <div className="w-[60px]" />
    </div>
  );
}
```

- `min-h-0 min-w-0`: HIG 1단계의 전역 `button { min-height: 44px }` 규칙을 내부 버튼에서 오버라이드
- `border-separator`: HIG 1단계에서 정의한 `--separator` 색상 토큰 (rgba(0,0,0,0.15))
- 우측 `div.w-[60px]`: 좌측 뒤로 버튼과 균형 맞춤 (제목 완전 중앙 정렬)
- `onBack`: `useNavigate()`의 `navigate(-1)` 호출

### 적용 페이지

| 페이지 | 파일 | 제목 |
|--------|------|------|
| 그룹 지도 | `src/pages/GroupMapPage.tsx` | 그룹 지도 |
| 그룹 설정 | `src/pages/GroupSettingsPage.tsx` | 그룹 설정 |
| 코스 상세 | `src/pages/CourseDetailPage.tsx` | 코스 상세 |
| 그룹 참여 | `src/pages/JoinGroupPage.tsx` | 그룹 참여 |

각 페이지의 기존 헤더/뒤로가기 구현을 제거하고 `<NavigationBar>`로 교체한다.

---

## 영향 범위

| 파일 | 변경 종류 | 내용 |
|------|----------|------|
| `src/components/BottomTabBar.tsx` | 수정 | 탭 라벨 12px, 아이콘 20px |
| `src/components/LargeTitle.tsx` | 신규 | LargeTitle 컴포넌트 |
| `src/components/NavigationBar.tsx` | 신규 | NavigationBar 컴포넌트 |
| `src/pages/GroupPage.tsx` | 수정 | LargeTitle 추가 |
| `src/pages/CoursePage.tsx` | 수정 | LargeTitle 추가 |
| `src/pages/HistoryPage.tsx` | 수정 | LargeTitle 추가 |
| `src/pages/ProfilePage.tsx` | 수정 | LargeTitle 추가 |
| `src/pages/GroupMapPage.tsx` | 수정 | NavigationBar 교체 |
| `src/pages/GroupSettingsPage.tsx` | 수정 | NavigationBar 교체 |
| `src/pages/CourseDetailPage.tsx` | 수정 | NavigationBar 교체 |
| `src/pages/JoinGroupPage.tsx` | 수정 | NavigationBar 교체 |

**변경 없는 파일:** `src/index.css`, 스토어, 라우터, 기타 컴포넌트

---

## 검증 방법

1. `npm run build` — 빌드 성공 확인
2. `npm run test:run` — 기존 테스트 통과 확인
3. DevTools에서 BottomTabBar 탭 라벨이 12px로 렌더링되는지 확인
4. 그룹 페이지 진입 시 28px Large Title "그룹" 표시 확인
5. 드릴다운 페이지에서 NavigationBar 표시 및 뒤로가기 동작 확인
