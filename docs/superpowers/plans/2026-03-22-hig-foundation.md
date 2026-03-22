# Apple HIG 전역 기반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/index.css`에 Apple HIG 기반 타이포그래피 스케일, 색상 시맨틱 토큰, border radius 체계, 터치 타겟 규칙, 폰트 antialiasing을 추가한다.

**Architecture:** `src/index.css` 단일 파일만 수정한다. TypeScript/컴포넌트 변경 없음. 변경은 5개 독립 블록으로 나뉘며 각 블록을 별도 커밋한다. CSS 변경이라 자동화 테스트는 없고, `npm run build` 성공 여부로 검증한다.

**Tech Stack:** Tailwind CSS 4, CSS custom properties, `@layer utilities`, `@theme inline`

---

## 파일 변경 목록

| 파일 | 변경 종류 | 내용 |
|------|----------|------|
| `src/index.css` | 수정 | 아래 5개 Task 모두 이 파일에 적용 |

---

## Task 1: HIG 타이포그래피 변수 + 유틸리티 클래스

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: `:root` 블록에 `--hig-text-*` 변수 추가**

기존 `:root { ... }` 블록 닫는 `}` 바로 앞에 아래 내용을 추가한다.

```css
  /* ── HIG Typography ── */
  --hig-text-title1-size: 28px;
  --hig-text-title1-weight: 700;
  --hig-text-title1-tracking: -0.5px;
  --hig-text-title1-leading: 1.2;

  --hig-text-title2-size: 22px;
  --hig-text-title2-weight: 700;
  --hig-text-title2-tracking: -0.3px;
  --hig-text-title2-leading: 1.25;

  --hig-text-title3-size: 20px;
  --hig-text-title3-weight: 600;
  --hig-text-title3-tracking: 0;
  --hig-text-title3-leading: 1.3;

  --hig-text-headline-size: 17px;
  --hig-text-headline-weight: 600;
  --hig-text-headline-tracking: 0;
  --hig-text-headline-leading: 1.35;

  --hig-text-body-size: 17px;
  --hig-text-body-weight: 400;
  --hig-text-body-tracking: 0;
  --hig-text-body-leading: 1.5;

  --hig-text-subheadline-size: 15px;
  --hig-text-subheadline-weight: 400;
  --hig-text-subheadline-tracking: 0;
  --hig-text-subheadline-leading: 1.45;

  --hig-text-footnote-size: 13px;
  --hig-text-footnote-weight: 400;
  --hig-text-footnote-tracking: 0;
  --hig-text-footnote-leading: 1.4;

  --hig-text-caption-size: 12px;
  --hig-text-caption-weight: 400;
  --hig-text-caption-tracking: 0;
  --hig-text-caption-leading: 1.35;
```

- [ ] **Step 2: `@layer utilities` 블록 추가**

파일 맨 끝에 아래 블록을 추가한다.

```css
@layer utilities {
  .text-hig-title1 {
    font-size: var(--hig-text-title1-size);
    font-weight: var(--hig-text-title1-weight);
    letter-spacing: var(--hig-text-title1-tracking);
    line-height: var(--hig-text-title1-leading);
  }
  .text-hig-title2 {
    font-size: var(--hig-text-title2-size);
    font-weight: var(--hig-text-title2-weight);
    letter-spacing: var(--hig-text-title2-tracking);
    line-height: var(--hig-text-title2-leading);
  }
  .text-hig-title3 {
    font-size: var(--hig-text-title3-size);
    font-weight: var(--hig-text-title3-weight);
    letter-spacing: var(--hig-text-title3-tracking);
    line-height: var(--hig-text-title3-leading);
  }
  .text-hig-headline {
    font-size: var(--hig-text-headline-size);
    font-weight: var(--hig-text-headline-weight);
    letter-spacing: var(--hig-text-headline-tracking);
    line-height: var(--hig-text-headline-leading);
  }
  .text-hig-body {
    font-size: var(--hig-text-body-size);
    font-weight: var(--hig-text-body-weight);
    letter-spacing: var(--hig-text-body-tracking);
    line-height: var(--hig-text-body-leading);
  }
  .text-hig-subheadline {
    font-size: var(--hig-text-subheadline-size);
    font-weight: var(--hig-text-subheadline-weight);
    letter-spacing: var(--hig-text-subheadline-tracking);
    line-height: var(--hig-text-subheadline-leading);
  }
  .text-hig-footnote {
    font-size: var(--hig-text-footnote-size);
    font-weight: var(--hig-text-footnote-weight);
    letter-spacing: var(--hig-text-footnote-tracking);
    line-height: var(--hig-text-footnote-leading);
  }
  .text-hig-caption {
    font-size: var(--hig-text-caption-size);
    font-weight: var(--hig-text-caption-weight);
    letter-spacing: var(--hig-text-caption-tracking);
    line-height: var(--hig-text-caption-leading);
  }
}
```

- [ ] **Step 3: 빌드 성공 확인**

```bash
npm run build
```

Expected: 에러 없이 빌드 성공. `dist/` 생성.

- [ ] **Step 4: 커밋**

```bash
git add src/index.css
git commit -m "feat: HIG 타이포그래피 스케일 CSS 변수 및 유틸리티 클래스 추가"
```

---

## Task 2: HIG 색상 시맨틱 토큰

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: `:root` 블록에 색상 토큰 추가**

기존 `:root { ... }` 블록 닫는 `}` 바로 앞에 아래 내용을 추가한다 (Task 1에서 추가한 타이포그래피 변수 아래).

```css
  /* ── HIG Color tokens ── */
  --label: rgba(0, 0, 0, 1);
  --label-secondary: rgba(0, 0, 0, 0.6);
  --label-tertiary: rgba(0, 0, 0, 0.3);
  --fill: rgba(0, 0, 0, 0.12);
  --fill-secondary: rgba(0, 0, 0, 0.06);
  --separator: rgba(0, 0, 0, 0.15);
```

- [ ] **Step 2: `@theme inline` 블록에 Tailwind 유틸리티 노출**

기존 `@theme inline { ... }` 블록 닫는 `}` 바로 앞에 아래 내용을 추가한다.

```css
  /* ── HIG Color utilities ── */
  --color-label: var(--label);
  --color-label-secondary: var(--label-secondary);
  --color-label-tertiary: var(--label-tertiary);
  --color-fill: var(--fill);
  --color-fill-secondary: var(--fill-secondary);
  --color-separator: var(--separator);
```

- [ ] **Step 3: 빌드 성공 확인**

```bash
npm run build
```

Expected: 에러 없이 빌드 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/index.css
git commit -m "feat: HIG 색상 시맨틱 토큰 추가 (label, fill, separator)"
```

---

## Task 3: Border Radius 재정의

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: `@theme inline` 에서 기존 radius calc 표현식 7개를 HIG 고정값 5개로 교체**

`@theme inline { ... }` 블록에서 아래 7줄을 찾아 삭제한다:

```css
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
```

그 자리에 아래 5줄로 교체한다:

```css
  --radius-sm: 0.625rem;
  --radius-md: 0.75rem;
  --radius-lg: 1rem;
  --radius-xl: 1.25rem;
  --radius-full: 9999px;
```

- [ ] **Step 2: 빌드 성공 확인**

```bash
npm run build
```

Expected: 에러 없이 빌드 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/index.css
git commit -m "feat: border radius를 HIG 5단계 고정값으로 재정의"
```

---

## Task 4: 터치 타겟 최소값 + 폰트 antialiasing

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: `@layer base`의 `body` 규칙에 antialiasing 추가**

현재 `@layer base` 블록의 `body` 규칙을 찾아 아래와 같이 수정한다.

현재:
```css
  body {
    @apply bg-background text-foreground;}
```

변경 후:
```css
  body {
    @apply bg-background text-foreground;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
```

- [ ] **Step 2: `@layer base`에 터치 타겟 규칙 추가**

`@layer base { ... }` 블록 닫는 `}` 바로 앞에 아래 내용을 추가한다.

```css
  button, a, [role="button"] {
    min-height: 44px;
    min-width: 44px;
  }
```

> 참고: `min-height`는 `height`보다 우선하므로 shadcn/ui `size="icon"` 버튼(h-9 = 36px)이 44px로 확장된다. 이는 HIG 터치 타겟 기준을 따른 의도적인 동작이다. 특정 요소에서 원치 않으면 `min-h-0 min-w-0`으로 오버라이드한다.

- [ ] **Step 3: 빌드 성공 확인**

```bash
npm run build
```

Expected: 에러 없이 빌드 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/index.css
git commit -m "feat: 터치 타겟 44px 최소값 및 폰트 antialiasing 적용"
```

---

## 최종 검증

- [ ] `npm run build` 최종 성공 확인
- [ ] `npm run test:run` — 기존 테스트 332개 모두 통과 확인 (CSS 변경이므로 테스트 실패 없어야 함)

```bash
npm run test:run
```

Expected: 36 test files, 332 tests passed
