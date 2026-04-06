# Capacitor 네이티브 앱 래핑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 React 웹 앱을 Capacitor로 래핑하여 iOS/Android 네이티브 앱으로 제공하면서 웹 버전도 유지한다. 포그라운드 트래킹 + Wake Lock으로 화면 꺼짐을 방지한다.

**Architecture:** 플랫폼 분기 방식 — `Capacitor.isNativePlatform()`으로 네이티브/웹을 구분하고, Geolocation과 Wake Lock은 각각 통합 래퍼를 통해 플랫폼별 구현을 선택한다. 기존 코드 변경을 최소화하면서 네이티브 기능을 추가한다.

**Tech Stack:** Capacitor 8, @capacitor/geolocation, @capacitor-community/keep-awake, @capacitor/status-bar, @capacitor/splash-screen

---

## File Structure

| 파일 | 역할 |
|------|------|
| `src/lib/platform.ts` | 새 파일 — 플랫폼 판별 유틸 |
| `src/lib/geolocation.ts` | 새 파일 — Geolocation 통합 래퍼 (네이티브/웹 분기) |
| `src/lib/wakeLock.ts` | 새 파일 — Wake Lock 래퍼 (네이티브/웹 분기) |
| `src/stores/MapStore.ts` | 수정 — `navigator.geolocation` → 래퍼 사용 |
| `src/stores/TrackingStore.ts` | 수정 — start/stop에서 wake lock acquire/release |
| `capacitor.config.ts` | 수정 — 플러그인 설정 추가 |
| `package.json` | 수정 — 플러그인 의존성 추가 |

---

### Task 1: 플러그인 설치 및 Capacitor 설정

**Files:**
- Modify: `package.json`
- Modify: `capacitor.config.ts`

- [ ] **Step 1: Capacitor 플러그인 설치**

```bash
npm install @capacitor/geolocation @capacitor/status-bar @capacitor/splash-screen @capacitor-community/keep-awake --registry https://registry.npmjs.org/
```

- [ ] **Step 2: capacitor.config.ts에 플러그인 설정 추가**

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trail.app',
  appName: 'waypoint',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
      backgroundColor: '#ffffff',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#ffffff',
    },
  },
};

export default config;
```

- [ ] **Step 3: 커밋**

```bash
git add package.json package-lock.json capacitor.config.ts
git commit -m "feat: add Capacitor plugins (geolocation, keep-awake, status-bar, splash-screen)"
```

---

### Task 2: 플랫폼 판별 유틸리티

**Files:**
- Create: `src/lib/platform.ts`
- Create: `src/lib/__tests__/platform.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/lib/__tests__/platform.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('platform', () => {
  it('웹 환경에서 isNative()는 false를 반환한다', async () => {
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
    }));
    const { isNative } = await import('../platform');
    expect(isNative()).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/lib/__tests__/platform.test.ts
```

Expected: FAIL — `../platform` 모듈이 없으므로 실패

- [ ] **Step 3: 구현**

```typescript
// src/lib/platform.ts
import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => Capacitor.isNativePlatform();
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/__tests__/platform.test.ts
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/platform.ts src/lib/__tests__/platform.test.ts
git commit -m "feat: add platform detection utility"
```

---

### Task 3: Geolocation 통합 래퍼

**Files:**
- Create: `src/lib/geolocation.ts`
- Create: `src/lib/__tests__/geolocation.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/lib/__tests__/geolocation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 기본적으로 웹 환경으로 mock
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    requestPermissions: vi.fn().mockResolvedValue({ location: 'granted' }),
    watchPosition: vi.fn().mockResolvedValue('native-watch-1'),
    getCurrentPosition: vi.fn().mockResolvedValue({
      coords: { latitude: 37.5, longitude: 127.0 },
    }),
    clearWatch: vi.fn(),
  },
}));

describe('geolocation (웹 환경)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getCurrentPosition은 좌표를 반환한다', async () => {
    // navigator.geolocation mock
    const mockGetCurrentPosition = vi.fn((success) => {
      success({ coords: { latitude: 37.5, longitude: 127.0 } });
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { geolocation: { getCurrentPosition: mockGetCurrentPosition } },
      writable: true,
    });

    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
    }));

    const { getCurrentPosition } = await import('../geolocation');
    const pos = await getCurrentPosition();
    expect(pos.latitude).toBe(37.5);
    expect(pos.longitude).toBe(127.0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/lib/__tests__/geolocation.test.ts
```

Expected: FAIL — `../geolocation` 모듈이 없으므로 실패

- [ ] **Step 3: 구현**

```typescript
// src/lib/geolocation.ts
import { Capacitor } from '@capacitor/core';
import { Geolocation as CapGeolocation } from '@capacitor/geolocation';

export interface Position {
  latitude: number;
  longitude: number;
}

type PositionCallback = (pos: Position) => void;
type ErrorCallback = (err: { code: number; message: string }) => void;

/**
 * 위치 권한 요청 (네이티브 전용, 웹에서는 항상 true)
 */
export const requestPermission = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return true;
  const status = await CapGeolocation.requestPermissions();
  return status.location === 'granted';
};

/**
 * 현재 위치 1회 조회
 */
export const getCurrentPosition = async (): Promise<Position> => {
  if (Capacitor.isNativePlatform()) {
    const pos = await CapGeolocation.getCurrentPosition();
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject({ code: err.code, message: err.message }),
    );
  });
};

/**
 * 위치 연속 감시 시작. watchId를 반환한다.
 */
export const watchPosition = async (
  onSuccess: PositionCallback,
  onError?: ErrorCallback,
): Promise<string> => {
  if (Capacitor.isNativePlatform()) {
    const id = await CapGeolocation.watchPosition({}, (pos, err) => {
      if (err) {
        onError?.({ code: 0, message: err.message ?? 'Unknown error' });
        return;
      }
      if (pos) {
        onSuccess({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      }
    });
    return id;
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => onSuccess({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
    (err) => onError?.({ code: err.code, message: err.message }),
  );
  return String(id);
};

/**
 * 위치 감시 중지
 */
export const clearWatch = async (watchId: string): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    await CapGeolocation.clearWatch({ id: watchId });
    return;
  }
  navigator.geolocation.clearWatch(Number(watchId));
};
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/__tests__/geolocation.test.ts
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/geolocation.ts src/lib/__tests__/geolocation.test.ts
git commit -m "feat: add geolocation wrapper with native/web branching"
```

---

### Task 4: Wake Lock 래퍼

**Files:**
- Create: `src/lib/wakeLock.ts`
- Create: `src/lib/__tests__/wakeLock.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/lib/__tests__/wakeLock.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: {
    keepAwake: vi.fn().mockResolvedValue(undefined),
    allowSleep: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('wakeLock (웹 환경)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('acquireWakeLock은 에러 없이 실행된다', async () => {
    const mockRequest = vi.fn().mockResolvedValue({ release: vi.fn() });
    Object.defineProperty(globalThis, 'navigator', {
      value: { wakeLock: { request: mockRequest } },
      writable: true,
    });

    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
    }));

    const { acquireWakeLock } = await import('../wakeLock');
    await expect(acquireWakeLock()).resolves.not.toThrow();
    expect(mockRequest).toHaveBeenCalledWith('screen');
  });

  it('releaseWakeLock은 에러 없이 실행된다', async () => {
    const releaseFn = vi.fn().mockResolvedValue(undefined);
    const mockRequest = vi.fn().mockResolvedValue({ release: releaseFn });
    Object.defineProperty(globalThis, 'navigator', {
      value: { wakeLock: { request: mockRequest } },
      writable: true,
    });

    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
    }));

    const { acquireWakeLock, releaseWakeLock } = await import('../wakeLock');
    await acquireWakeLock();
    await releaseWakeLock();
    expect(releaseFn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/lib/__tests__/wakeLock.test.ts
```

Expected: FAIL — `../wakeLock` 모듈이 없으므로 실패

- [ ] **Step 3: 구현**

```typescript
// src/lib/wakeLock.ts
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

let wakeLockSentinel: WakeLockSentinel | null = null;

/**
 * 화면 꺼짐 방지 활성화
 */
export const acquireWakeLock = async (): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    await KeepAwake.keepAwake();
    return;
  }
  // Web Wake Lock API
  if ('wakeLock' in navigator) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch {
      // Wake Lock 획득 실패 시 무시 (브라우저 정책)
    }
  }
};

/**
 * 화면 꺼짐 방지 해제
 */
export const releaseWakeLock = async (): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    await KeepAwake.allowSleep();
    return;
  }
  if (wakeLockSentinel) {
    await wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
};
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/lib/__tests__/wakeLock.test.ts
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/wakeLock.ts src/lib/__tests__/wakeLock.test.ts
git commit -m "feat: add wake lock wrapper with native/web branching"
```

---

### Task 5: MapStore — Geolocation 래퍼 적용

**Files:**
- Modify: `src/stores/MapStore.ts`

- [ ] **Step 1: MapStore import 변경 및 메서드 수정**

`navigator.geolocation` 직접 호출을 래퍼 함수로 교체한다. `watchId` 타입이 `number`에서 `string`으로 변경된다.

```typescript
// src/stores/MapStore.ts 상단에 추가
import { getCurrentPosition, watchPosition, clearWatch } from '../lib/geolocation';
```

변경 대상 메서드:

**`locate()`** — `navigator.geolocation.getCurrentPosition` → `getCurrentPosition()`:
```typescript
public locate(): void {
  if (!this.map) return;
  if (this.lastPosition) {
    const { latitude, longitude } = this.lastPosition;
    this.map.setCenter(new window.naver.maps.LatLng(latitude, longitude));
  } else {
    getCurrentPosition()
      .then((pos) => {
        this.map!.setCenter(new window.naver.maps.LatLng(pos.latitude, pos.longitude));
      })
      .catch((err) => { console.error('[locate] error', err); });
  }
}
```

**`startWatchingLocation()`** — `navigator.geolocation.watchPosition` → `watchPosition()`:
```typescript
public startWatchingLocation(onLocationUpdate?: (lat: number, lng: number) => void): void {
  if (!this.map) return;

  watchPosition(
    (pos) => {
      this.lastPosition = { latitude: pos.latitude, longitude: pos.longitude };
      if (!this.map) return;
      const latLng = new window.naver.maps.LatLng(pos.latitude, pos.longitude);

      runInAction(() => {
        if (!this.locationMarker) {
          this.locationMarker = new window.naver.maps.Marker({
            map: this.map!,
            position: latLng,
            clickable: false,
            zIndex: 50,
            icon: {
              content: this._buildLocationMarkerContent(),
              anchor: new window.naver.maps.Point(30, 30),
            },
          });
        } else {
          this.locationMarker.setPosition(latLng);
        }
      });

      onLocationUpdate?.(pos.latitude, pos.longitude);
    },
  ).then((id) => {
    this.watchId = id;
  });
}
```

**`stopWatchingLocation()`** — `navigator.geolocation.clearWatch` → `clearWatch()`:
```typescript
public stopWatchingLocation(): void {
  if (this.watchId !== null) {
    clearWatch(this.watchId);
    this.watchId = null;
  }
  this.locationMarker?.setMap(null);
  this.locationMarker = null;
}
```

**`watchId` 타입 변경:** `private watchId: number | null = null;` → `private watchId: string | null = null;`

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 타입 에러 없이 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add src/stores/MapStore.ts
git commit -m "refactor: MapStore uses geolocation wrapper instead of navigator.geolocation"
```

---

### Task 6: TrackingStore — Wake Lock 적용

**Files:**
- Modify: `src/stores/TrackingStore.ts`

- [ ] **Step 1: TrackingStore에 wake lock import 추가 및 start/stop/restart 수정**

```typescript
// src/stores/TrackingStore.ts 상단에 추가
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock';
```

**`start()` 메서드** — `this._startTimer();` 바로 뒤에 추가:
```typescript
    this._startTimer();
    acquireWakeLock();
```

**`stop()` 메서드** — `this._clearTimer();` 바로 뒤에 추가:
```typescript
    this._clearTimer();
    releaseWakeLock();
```

**`restart()` 메서드** — `this._clearTimer();` 바로 뒤에 추가:
```typescript
    this._clearTimer();
    releaseWakeLock();
```

**`restore()` 메서드** — `this._startTimer();` 바로 뒤에 추가 (복원 시에도 wake lock 유지):
```typescript
      this._startTimer();
      acquireWakeLock();
```

**`dispose()` 메서드** — wake lock도 해제:
```typescript
  public dispose(): void {
    this._clearTimer();
    releaseWakeLock();
  }
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 타입 에러 없이 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add src/stores/TrackingStore.ts
git commit -m "feat: acquire/release wake lock during tracking sessions"
```

---

### Task 7: Capacitor 네이티브 프로젝트 동기화 및 권한 설정

**Files:**
- Modify: `ios/App/App/Info.plist` (Capacitor가 자동 생성)
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: 빌드 및 Capacitor sync**

```bash
npm run build && npx cap sync
```

Expected: 웹 에셋이 ios/, android/에 복사됨

- [ ] **Step 2: iOS 위치 권한 설명 추가**

`ios/App/App/Info.plist`에 아래 키가 없으면 추가:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>트래킹을 위해 위치 정보가 필요합니다</string>
```

- [ ] **Step 3: Android 위치 권한 확인**

`android/app/src/main/AndroidManifest.xml`에 아래 권한이 없으면 추가:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

그리고 Wake Lock 권한도 추가:

```xml
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

- [ ] **Step 4: 다시 sync**

```bash
npx cap sync
```

- [ ] **Step 5: 커밋**

```bash
git add capacitor.config.ts ios/ android/
git commit -m "feat: configure native projects with location and wake lock permissions"
```

---

### Task 8: .gitignore에 네이티브 빌드 아티팩트 추가

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: .gitignore에 네이티브 빌드 아티팩트 추가**

`.gitignore` 하단 Capacitor 섹션에 추가:

```
ios/App/Pods/
ios/App/build/
android/.gradle/
android/app/build/
android/build/
```

- [ ] **Step 2: 커밋**

```bash
git add .gitignore
git commit -m "chore: add native build artifacts to .gitignore"
```

---

### Task 9: 상태바/스플래시 스크린 초기화

**Files:**
- Modify: `src/App.tsx` 또는 최상위 컴포넌트

- [ ] **Step 1: App.tsx 최상위에서 네이티브 초기화 로직 추가**

앱 시작 시 상태바와 스플래시 스크린을 설정한다. `src/App.tsx`(또는 최상위 레이아웃)에서:

```typescript
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

// App 컴포넌트 바깥 또는 useEffect 내부에서 1회 실행
if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Light });
  StatusBar.setBackgroundColor({ color: '#ffffff' });
  SplashScreen.hide();
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add src/App.tsx
git commit -m "feat: initialize status bar and splash screen on native platforms"
```

---

### Task 10: 통합 검증

- [ ] **Step 1: 전체 테스트 실행**

```bash
npm run test:run
```

Expected: 모든 테스트 PASS

- [ ] **Step 2: 빌드 + Capacitor 동기화**

```bash
npm run cap:sync
```

Expected: 성공

- [ ] **Step 3: 웹 개발 서버 동작 확인**

```bash
npm run dev
```

브라우저에서 지도 페이지 접속 → 위치 추적 동작 확인 (기존 웹 기능 유지)
