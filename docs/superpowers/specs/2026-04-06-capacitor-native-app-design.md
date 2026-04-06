# Capacitor 네이티브 앱 래핑 설계

## 개요

기존 React + Vite 모바일 웹 앱을 Capacitor로 래핑하여 iOS/Android 네이티브 앱으로 제공한다.
웹 버전도 계속 유지하는 플랫폼 분기 방식(B안)을 채택한다.

## 범위

- Capacitor 프로젝트 초기화 (ios/, android/)
- 플랫폼 분기 유틸리티
- Geolocation 통합 래퍼 (네이티브 플러그인 / 웹 API 분기)
- Wake Lock (트래킹 중 화면 꺼짐 방지)
- 상태바/스플래시 스크린 기본 설정
- 백그라운드 GPS는 향후 단계 (transistorsoft 유료 플러그인)

## 플러그인

| 플러그인 | 용도 |
|---------|------|
| `@capacitor/geolocation` | 네이티브 GPS + 권한 관리 |
| `@capacitor/status-bar` | 상태바 스타일 제어 |
| `@capacitor/splash-screen` | 스플래시 화면 |
| `@nicepkg/capacitor-keep-awake` 또는 `@capacitor-community/keep-awake` | 네이티브 화면 꺼짐 방지 |

## 플랫폼 분기

### 유틸리티

```typescript
// src/lib/platform.ts
import { Capacitor } from '@capacitor/core';
export const isNative = () => Capacitor.isNativePlatform();
```

### Geolocation 래퍼

`src/lib/geolocation.ts` — 통합 인터페이스:

- **네이티브**: `@capacitor/geolocation` 사용 (권한 요청 → watchPosition)
- **웹**: 기존 `navigator.geolocation` 유지
- `MapStore`에서 이 래퍼를 호출하도록 변경

```typescript
// 인터페이스
export const requestPermission: () => Promise<boolean>;
export const watchPosition: (callback) => Promise<string>;  // watchId 반환
export const getCurrentPosition: () => Promise<Position>;
export const clearWatch: (watchId: string) => void;
```

### Wake Lock 래퍼

`src/lib/wakeLock.ts` — 트래킹 중 화면 꺼짐 방지:

- **네이티브**: `@capacitor-community/keep-awake` 플러그인
- **웹**: `navigator.wakeLock` API (지원 시)
- `TrackingStore`의 start에서 acquire, stop/complete에서 release

```typescript
export const acquireWakeLock: () => Promise<void>;
export const releaseWakeLock: () => Promise<void>;
```

## 변경 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `capacitor.config.ts` | webDir, appId, appName 설정 |
| `src/lib/platform.ts` | 새 파일 - 플랫폼 판별 |
| `src/lib/geolocation.ts` | 새 파일 - Geolocation 통합 래퍼 |
| `src/lib/wakeLock.ts` | 새 파일 - Wake Lock 래퍼 |
| `src/stores/MapStore.ts` | `navigator.geolocation` → geolocation 래퍼 사용 |
| `src/stores/TrackingStore.ts` | wake lock acquire/release 추가 |
| `package.json` | 플러그인 의존성 + 스크립트 추가 |

## 빌드 흐름

```
npm run build        → dist/ 생성
npx cap sync         → ios/, android/에 웹 에셋 복사
npx cap open ios     → Xcode에서 빌드/실행
npx cap open android → Android Studio에서 빌드/실행
```

## 향후 확장

- `@transistorsoft/capacitor-background-geolocation` — 백그라운드 GPS ($299)
- 푸시 알림 (`@capacitor/push-notifications`)
- 앱스토어/플레이스토어 배포 설정
