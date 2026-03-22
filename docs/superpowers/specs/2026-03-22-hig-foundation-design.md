# Apple HIG 전역 기반 디자인 스펙 (1단계)

**날짜:** 2026-03-22
**상태:** 승인됨

---

## 개요

`src/index.css`에 Apple Human Interface Guidelines 기반의 타이포그래피 스케일, 색상 시맨틱 토큰, border radius 체계, 터치 타겟 규칙을 정의한다. 폰트는 현재의 Geist Variable을 유지하고, 색상은 흑백 계열(achromatic)을 유지한다.

이 1단계는 CSS 변수와 유틸리티 클래스만 추가/수정한다. 페이지별 적용은 이후 단계에서 진행한다.

**다크 모드:** 1단계 범위에서 제외한다. HIG 색상 토큰의 다크 모드 대응(`.dark` 블록)은 별도 단계에서 진행한다.

---

## 1. 타이포그래피 스케일

### 변수 위치: `:root`

타이포그래피 세부 변수(`--hig-text-*`)는 `:root`에 정의한다. `@theme inline`에 두면 Tailwind CSS 4가 이를 `text-*` utility 토큰으로 파싱하여 의도치 않은 클래스를 생성하므로 `:root`에만 둔다.

```css
:root {
  /* HIG Typography scale — `:root`에 정의 (Tailwind 파싱 방지) */
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
}
```

### 유틸리티 클래스: `@layer utilities`

모든 클래스에 `hig-` 접두어를 사용하여 Tailwind 기본 클래스 및 shadcn/ui 클래스와의 충돌을 방지한다.

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

---

## 2. 색상 시맨틱 토큰

`:root` 블록에 HIG label/fill/separator 토큰을 추가한다. 기존 shadcn 토큰(`--primary`, `--muted` 등)은 유지한다.

```css
:root {
  /* HIG Label tokens */
  --label: rgba(0, 0, 0, 1);
  --label-secondary: rgba(0, 0, 0, 0.6);
  --label-tertiary: rgba(0, 0, 0, 0.3);

  /* HIG Fill tokens */
  --fill: rgba(0, 0, 0, 0.12);
  --fill-secondary: rgba(0, 0, 0, 0.06);

  /* HIG Separator */
  --separator: rgba(0, 0, 0, 0.15);
}
```

`@theme inline`에 Tailwind 유틸리티로 노출 (`--color-*` 패턴):

```css
@theme inline {
  --color-label: var(--label);
  --color-label-secondary: var(--label-secondary);
  --color-label-tertiary: var(--label-tertiary);
  --color-fill: var(--fill);
  --color-fill-secondary: var(--fill-secondary);
  --color-separator: var(--separator);
}
```

이렇게 하면 `text-label`, `text-label-secondary`, `bg-fill`, `bg-fill-secondary`, `border-separator` 등의 Tailwind 클래스로 사용 가능하다.

---

## 3. Border Radius 체계

현재 `@theme inline`의 `--radius-sm` ~ `--radius-4xl` (calc 표현식 기반)을 HIG 5단계 고정값으로 교체한다.

**제거 대상 (기존 `@theme inline`에서 삭제):**
- `--radius-sm: calc(var(--radius) * 0.6)`
- `--radius-md: calc(var(--radius) * 0.8)`
- `--radius-lg: var(--radius)`
- `--radius-xl: calc(var(--radius) * 1.4)`
- `--radius-2xl: calc(var(--radius) * 1.8)`
- `--radius-3xl: calc(var(--radius) * 2.2)`
- `--radius-4xl: calc(var(--radius) * 2.6)`

**교체 후 (`@theme inline`에 추가):**

```css
@theme inline {
  --radius-sm: 0.625rem;   /* 10px — 버튼, 칩 */
  --radius-md: 0.75rem;    /* 12px — 카드, 입력 */
  --radius-lg: 1rem;       /* 16px — 패널, 시트 */
  --radius-xl: 1.25rem;    /* 20px — 모달, 플로팅 카드 */
  --radius-full: 9999px;   /* full — FAB, 아바타 */
}
```

> `:root`의 `--radius: 0.625rem` 기준값은 유지한다. shadcn/ui 컴포넌트들이 `rounded-lg`, `rounded-md` 등을 내부적으로 사용하는데, 위 고정값으로 교체해도 시각적으로 동일하거나 유사하게 렌더링된다.

---

## 4. 터치 타겟 최소값

`@layer base`에 전역 규칙을 추가한다:

```css
@layer base {
  button, a, [role="button"] {
    min-height: 44px;
    min-width: 44px;
  }
}
```

> `min-height`는 `height`보다 우선한다. 따라서 shadcn/ui `size="icon"` 버튼(`h-9` = 36px)은 이 규칙에 의해 44px로 확장된다. 이는 접근성(HIG 터치 타겟) 기준을 따른 의도적인 동작이다. 시각적으로 문제가 되는 경우 해당 컴포넌트에 `min-h-0`으로 오버라이드한다.

---

## 5. 폰트 렌더링 개선

`@layer base`의 `body` 규칙에 antialiasing을 추가한다:

```css
@layer base {
  body {
    @apply bg-background text-foreground;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}
```

---

## 영향 범위

| 파일 | 변경 종류 | 내용 |
|------|----------|------|
| `src/index.css` | 수정 | `:root`에 HIG 타이포그래피 변수 + 색상 토큰 추가, `@theme inline` radius 재정의, `@layer utilities`에 `text-hig-*` 클래스 추가, `@layer base`에 터치 타겟 + antialiasing 추가 |

**변경 없는 파일:** 모든 페이지 컴포넌트, 스토어, 라우터

---

## 검증 방법

1. `npm run build` — 빌드 성공 확인 (CSS only 변경)
2. `npm run dev` 후 DevTools에서 `:root`에 `--hig-text-*`, `--label`, `--separator` 등이 정의됐는지 확인
3. DevTools에서 임의 요소에 `text-hig-title1` 클래스 추가해 28px/700 스타일 적용 확인
4. `rounded-sm`, `rounded-md`, `rounded-lg`가 10/12/16px로 렌더링되는지 확인
