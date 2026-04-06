# 스토어 리팩토링 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 거대 스토어를 역할별로 분리하고, UI/비즈니스 스토어 경계를 확립하며, 중복 제거 및 컴포넌트 화살표 함수 전환을 완료한다.

**Architecture:** MapStore를 지도 코어/렌더링/멤버마커 3개로 분리하고, TrackingStore에서 broadcast 로직을 별도 스토어로 추출한다. 페이지의 useState/useEffect 오케스트레이션을 `src/stores/ui/` 디렉토리의 UI 스토어로 이동한다. QuickGroupCreateStore를 GroupCreateStore에 통합한다.

**Tech Stack:** React 19, TypeScript, MobX 6, Supabase, React Router 7

---

## 파일 구조

### 새로 생성
- `src/stores/MapRenderingStore.ts` — GPX 경로/마커/체크포인트 렌더링
- `src/stores/MemberMarkerStore.ts` — 멤버 실시간 위치 마커 관리
- `src/stores/TrackingBroadcastStore.ts` — Realtime 채널 broadcast + 위치 저장
- `src/stores/ui/GroupMapUIStore.ts` — GroupMapPage UI 상태 + 초기화 오케스트레이션
- `src/stores/ui/CourseDetailUIStore.ts` — CourseDetailPage UI 상태

### 수정
- `src/stores/MapStore.ts` — 렌더링/멤버마커/체크포인트 로직 제거, 코어만 유지
- `src/stores/TrackingStore.ts` — broadcast/위치저장 로직 제거
- `src/stores/GroupCreateStore.ts` — `createFromCourse()` 메서드 추가
- `src/pages/GroupMapPage.tsx` — UI 스토어 사용, useState/useEffect 제거
- `src/pages/CourseDetailPage.tsx` — QuickGroupCreateStore 제거, UI 스토어 + GroupCreateStore 사용
- 전체 `src/pages/*.tsx`, `src/components/*.tsx` — 화살표 함수 전환

---

### Task 1: MapRenderingStore 추출

**Files:**
- Create: `src/stores/MapRenderingStore.ts`
- Modify: `src/stores/MapStore.ts`

- [ ] **Step 1: `MapRenderingStore` 생성**

```typescript
// src/stores/MapRenderingStore.ts
import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { Checkpoint } from '../types/checkpoint';

function createPinHtml(color: string): string {
  return `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.4);border:2px solid white;"></div>`;
}

class MapRenderingStore {
  public gpxPolyline: naver.maps.Polyline | null = null;
  private _extraPolylines: naver.maps.Polyline[] = [];
  public startMarker: naver.maps.Marker | null = null;
  public endMarker: naver.maps.Marker | null = null;
  public isCourseVisible: boolean = true;
  private gpxBounds: naver.maps.LatLngBounds | null = null;
  private idleListener: naver.maps.MapEventListener | null = null;
  private _checkpointMarkers: Map<string, naver.maps.Marker> = new Map();
  private _checkpointCircles: Map<string, naver.maps.Circle> = new Map();
  private _onCheckpointTap: ((checkpointId: string) => void) | null = null;

  private getMap: () => naver.maps.Map | null;

  public constructor(getMap: () => naver.maps.Map | null) {
    this.getMap = getMap;
    makeAutoObservable(this, {
      gpxPolyline: observable.ref,
      startMarker: observable.ref,
      endMarker: observable.ref,
    });
  }

  public drawGpxRoute(gpxText: string): boolean {
    const map = this.getMap();
    if (!map) return false;

    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxText, 'application/xml');
    if (doc.querySelector('parsererror')) return false;

    const trkpts = Array.from(doc.getElementsByTagName('trkpt'));
    if (trkpts.length === 0) return false;

    const allPoints = trkpts
      .filter((pt) => {
        const lat = parseFloat(pt.getAttribute('lat') ?? '');
        const lon = parseFloat(pt.getAttribute('lon') ?? '');
        return !isNaN(lat) && !isNaN(lon);
      })
      .map((pt) => ({
        lat: parseFloat(pt.getAttribute('lat')!),
        lon: parseFloat(pt.getAttribute('lon')!),
      }));

    if (allPoints.length === 0) return false;

    // 이전 경로/마커 정리
    this.clearGpxRoute();

    const GAP_THRESHOLD = 150;
    const segments: naver.maps.LatLng[][] = [[]];
    for (let i = 0; i < allPoints.length; i++) {
      const pt = new window.naver.maps.LatLng(allPoints[i].lat, allPoints[i].lon);
      if (i > 0) {
        const prev = allPoints[i - 1];
        const dlat = allPoints[i].lat - prev.lat;
        const dlon = allPoints[i].lon - prev.lon;
        const approxM = Math.sqrt(dlat * dlat + dlon * dlon) * 111_000;
        if (approxM > GAP_THRESHOLD) {
          segments.push([]);
        }
      }
      segments[segments.length - 1].push(pt);
    }

    const polylines: naver.maps.Polyline[] = [];
    for (const seg of segments) {
      if (seg.length < 2) continue;
      polylines.push(new window.naver.maps.Polyline({
        map,
        path: seg,
        strokeColor: '#FF5722',
        strokeWeight: 4,
        strokeOpacity: 0.8,
      }));
    }

    const allPts = segments.flat();
    if (polylines.length > 0) {
      this.gpxPolyline = polylines[0];
      this._extraPolylines = polylines.slice(1);
    }

    const bounds = allPts.reduce(
      (b, pt) => b.extend(pt),
      new window.naver.maps.LatLngBounds(allPts[0], allPts[0]),
    );
    this.gpxBounds = bounds;

    map.setCenter(allPts[0]);

    if (this.idleListener) {
      window.naver.maps.Event.removeListener(this.idleListener);
    }
    this.idleListener = window.naver.maps.Event.addListener(
      map,
      'idle',
      () => {
        const m = this.getMap();
        if (!m || !this.gpxBounds) return;
        const mapBounds = m.getBounds();
        if (!mapBounds || typeof (mapBounds as naver.maps.LatLngBounds).intersects !== 'function') return;
        runInAction(() => {
          this.isCourseVisible = (mapBounds as naver.maps.LatLngBounds).intersects(this.gpxBounds!);
        });
      },
    );

    this.startMarker = new window.naver.maps.Marker({
      map,
      position: allPts[0],
      icon: {
        content: createPinHtml('#4CAF50'),
        anchor: new window.naver.maps.Point(10, 20),
      },
    });

    if (allPts.length > 1) {
      this.endMarker = new window.naver.maps.Marker({
        map,
        position: allPts[allPts.length - 1],
        icon: {
          content: createPinHtml('#F44336'),
          anchor: new window.naver.maps.Point(10, 20),
        },
      });
    }

    return true;
  }

  public clearGpxRoute(): void {
    if (this.idleListener) {
      window.naver.maps.Event.removeListener(this.idleListener);
      this.idleListener = null;
    }
    this.gpxBounds = null;
    this.isCourseVisible = true;
    this.gpxPolyline?.setMap(null);
    this.gpxPolyline = null;
    this._extraPolylines.forEach((p) => p.setMap(null));
    this._extraPolylines = [];
    this.startMarker?.setMap(null);
    this.startMarker = null;
    this.endMarker?.setMap(null);
    this.endMarker = null;
  }

  public returnToCourse(): void {
    const map = this.getMap();
    if (!map || !this.gpxBounds) return;
    map.fitBounds(this.gpxBounds, { top: 50, right: 50, bottom: 50, left: 50 });
  }

  public setOnCheckpointTap(cb: ((checkpointId: string) => void) | null): void {
    this._onCheckpointTap = cb;
  }

  public drawCheckpoints(
    checkpoints: Checkpoint[],
    visitedIds: Set<string>,
    nearId: string | null,
  ): void {
    const map = this.getMap();
    if (!map) return;

    if (checkpoints.some((cp) => cp.is_finish)) {
      this.endMarker?.setMap(null);
    }

    let order = 0;
    for (const cp of checkpoints) {
      const isVisited = visitedIds.has(cp.id);
      const isNear = nearId === cp.id;
      if (!cp.is_finish) order++;
      const displayOrder = cp.is_finish ? -1 : order;

      const existing = this._checkpointMarkers.get(cp.id);
      const position = new window.naver.maps.LatLng(cp.lat, cp.lng);
      const anchor = isNear
        ? new window.naver.maps.Point(24, 24)
        : (isVisited || cp.is_finish)
          ? new window.naver.maps.Point(18, 18)
          : new window.naver.maps.Point(16, 16);

      if (existing) {
        existing.setPosition(position);
        existing.setIcon({
          content: this._buildCheckpointHtml(cp, displayOrder, isVisited, isNear),
          anchor,
        });
      } else {
        const marker = new window.naver.maps.Marker({
          map,
          position,
          icon: {
            content: this._buildCheckpointHtml(cp, displayOrder, isVisited, isNear),
            anchor,
          },
          zIndex: 100,
        });
        window.naver.maps.Event.addListener(marker, 'click', () => {
          this._onCheckpointTap?.(cp.id);
        });
        this._checkpointMarkers.set(cp.id, marker);
      }

      const existingCircle = this._checkpointCircles.get(cp.id);
      const circleColor = cp.is_finish ? '#F44336' : isNear ? '#000000' : '#000000';
      const circleOpacity = isNear ? 0.12 : 0.05;
      if (existingCircle) {
        existingCircle.setCenter(position);
        existingCircle.setRadius(cp.radius_m);
        existingCircle.setOptions({
          center: position,
          radius: cp.radius_m,
          fillColor: circleColor,
          fillOpacity: circleOpacity,
          strokeColor: circleColor,
          strokeOpacity: isNear ? 0.4 : 0.2,
        });
      } else {
        const circle = new window.naver.maps.Circle({
          map,
          center: position,
          radius: cp.radius_m,
          strokeColor: circleColor,
          strokeOpacity: 0.2,
          strokeWeight: 1,
          fillColor: circleColor,
          fillOpacity: circleOpacity,
        });
        this._checkpointCircles.set(cp.id, circle);
      }
    }

    const currentIds = new Set(checkpoints.map((cp) => cp.id));
    for (const [cpId, marker] of this._checkpointMarkers) {
      if (!currentIds.has(cpId)) {
        marker.setMap(null);
        this._checkpointMarkers.delete(cpId);
      }
    }
    for (const [cpId, circle] of this._checkpointCircles) {
      if (!currentIds.has(cpId)) {
        circle.setMap(null);
        this._checkpointCircles.delete(cpId);
      }
    }
  }

  private _buildCheckpointHtml(
    cp: Checkpoint,
    displayOrder: number,
    isVisited: boolean,
    isNear: boolean,
  ): string {
    if (isVisited) {
      return `<div style="width:36px;height:36px;border-radius:50%;background:#22C55E;display:flex;align-items:center;justify-content:center;border:2.5px solid white;box-shadow:0 2px 8px rgba(34,197,94,0.4);">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>`;
    }
    if (isNear) {
      const label = cp.is_finish ? '종료' : displayOrder;
      const bg = cp.is_finish ? '#F44336' : '#000';
      const glow = cp.is_finish ? 'rgba(244,67,54,0.5)' : 'rgba(0,0,0,0.35)';
      return `<div style="position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:0;border-radius:50%;background:${bg};opacity:0.15;animation:cp-ring 1.5s ease-in-out infinite;"></div>
        <div style="width:40px;height:40px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;color:white;font-size:${cp.is_finish ? '10px' : '13px'};font-weight:bold;border:2.5px solid white;box-shadow:0 0 12px ${glow};animation:cp-pulse 1.5s ease-in-out infinite;z-index:1;">
          ${label}
        </div>
        <style>
          @keyframes cp-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
          @keyframes cp-ring{0%,100%{transform:scale(1);opacity:0.15}50%{transform:scale(1.3);opacity:0}}
        </style>
      </div>`;
    }
    if (cp.is_finish) {
      return `<div style="width:36px;height:36px;border-radius:50%;background:#F44336;display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);">종료</div>`;
    }
    return `<div style="width:32px;height:32px;border-radius:50%;background:white;display:flex;align-items:center;justify-content:center;color:black;font-size:12px;font-weight:bold;border:2px solid black;box-shadow:0 2px 6px rgba(0,0,0,0.15);">${displayOrder}</div>`;
  }

  public clearCheckpoints(): void {
    this._checkpointMarkers.forEach((m) => m.setMap(null));
    this._checkpointMarkers.clear();
    this._checkpointCircles.forEach((c) => c.setMap(null));
    this._checkpointCircles.clear();
  }

  public destroy(): void {
    this.clearGpxRoute();
    this.clearCheckpoints();
  }
}

export { MapRenderingStore };
```

- [ ] **Step 2: `MapStore`에서 렌더링/체크포인트 관련 코드 제거**

`src/stores/MapStore.ts`에서 아래 항목을 모두 제거:
- `gpxPolyline`, `_extraPolylines`, `startMarker`, `endMarker`, `isCourseVisible`, `gpxBounds`, `idleListener` 필드
- `_checkpointMarkers`, `_checkpointCircles`, `_onCheckpointTap` 필드
- `drawGpxRoute()`, `clearGpxRoute()`, `returnToCourse()` 메서드
- `setOnCheckpointTap()`, `drawCheckpoints()`, `_buildCheckpointHtml()`, `clearCheckpoints()` 메서드
- `createPinHtml()` 헬퍼 함수
- `destroy()` 내부의 `clearGpxRoute()`, `clearCheckpoints()` 호출

`MapStore`는 다음만 유지:
- `map`, `error`, `locationMarker`, `watchId`, `lastPosition`, `locationAvatarUrl`, `_logoEl`
- `initMap()`, `locate()`, `startWatchingLocation()`, `stopWatchingLocation()`, `setLocationAvatarUrl()`
- `destroy()`는 `stopWatchingLocation()` + 로고/지도 정리만

수정 후 `MapStore`:

```typescript
// src/stores/MapStore.ts
import { makeAutoObservable, observable, runInAction } from 'mobx';

class MapStore {
  public map: naver.maps.Map | null = null;
  public error: boolean = false;
  public locationMarker: naver.maps.Marker | null = null;

  private watchId: number | null = null;
  private lastPosition: { latitude: number; longitude: number } | null = null;
  private locationAvatarUrl: string | null = null;
  private _logoEl: HTMLDivElement | null = null;

  public constructor() {
    makeAutoObservable(this, {
      map: observable.ref,
      locationMarker: observable.ref,
    });
  }

  public initMap(el: HTMLDivElement, center?: { lat: number; lng: number }): void {
    if (this.map) return;

    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
    if (!clientId) {
      console.warn("VITE_NAVER_MAP_CLIENT_ID is not set");
      this.error = true;
      return;
    }

    if (!window.naver?.maps?.Map) {
      console.error(
        "Naver Maps SDK not loaded — check script tag and API key authorization for this domain",
      );
      this.error = true;
      return;
    }

    (window as Window & { navermap_authFailure?: () => void }).navermap_authFailure = () => {
      console.error("Naver Maps auth failed — check API key and authorized domains in NCP console");
      runInAction(() => { this.error = true; });
    };

    try {
      const instance = new window.naver.maps.Map(el, {
        center: new window.naver.maps.LatLng(
          center?.lat ?? 37.5665,
          center?.lng ?? 126.978,
        ),
        zoom: 14,
        logoControl: false,
      });
      this.map = instance;

      const hideStyle = document.createElement('style');
      hideStyle.setAttribute('data-map-logo-hide', '');
      hideStyle.textContent = `
        a[href*="ssl.pstatic.net/static/maps/mantle/notice/legal.html"] { display: none !important; }
      `;
      document.head.appendChild(hideStyle);

      const logo = document.createElement('img');
      logo.src = 'http://static.naver.net/maps/mantle/2x/new-naver-logo-normal.png';
      logo.setAttribute('data-custom-logo', '');
      logo.alt = 'NAVER';
      logo.style.cssText = `
        position: absolute;
        left: 6px;
        top: 50%;
        transform: translateY(-50%) rotate(-90deg);
        transform-origin: center center;
        z-index: 10;
        pointer-events: none;
        width: 52px;
        opacity: 0.6;
        user-select: none;
      `;
      el.appendChild(logo);
      this._logoEl = logo as unknown as HTMLDivElement;
    } catch (e) {
      console.error("Naver Maps init failed:", e);
      this.error = true;
    }
  }

  public locate(): void {
    if (!this.map) return;
    if (this.lastPosition) {
      const { latitude, longitude } = this.lastPosition;
      this.map.setCenter(new window.naver.maps.LatLng(latitude, longitude));
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          this.map!.setCenter(new window.naver.maps.LatLng(latitude, longitude));
        },
        (err) => { console.error('[locate] error', err.code, err.message); },
      );
    }
  }

  public stopWatchingLocation(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.locationMarker?.setMap(null);
    this.locationMarker = null;
  }

  private _buildLocationMarkerContent(): string {
    const avatarUrl = this.locationAvatarUrl;
    const inner = avatarUrl
      ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : `<div style="width:100%;height:100%;border-radius:50%;background:#222;"></div>`;

    return `
      <style>
        @keyframes loc-pulse {
          0%   { transform: scale(1);   opacity: 0.5; }
          70%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes loc-pulse2 {
          0%   { transform: scale(1);   opacity: 0.3; }
          70%  { transform: scale(1.7); opacity: 0; }
          100% { transform: scale(1.7); opacity: 0; }
        }
      </style>
      <div style="position:relative;width:60px;height:76px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;">
        <div style="position:relative;width:60px;height:60px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.15);animation:loc-pulse 2s ease-out infinite;z-index:0;"></div>
          <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.1);animation:loc-pulse2 2s ease-out 0.4s infinite;z-index:0;"></div>
          <div style="position:relative;width:36px;height:36px;border-radius:50%;overflow:hidden;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);flex-shrink:0;z-index:1;background:white;">
            ${inner}
          </div>
        </div>
        <div style="margin-top:-2px;font-size:11px;font-weight:700;color:#222;text-align:center;z-index:1;text-shadow:0 0 3px white,0 0 3px white,0 0 3px white;white-space:nowrap;">내 위치</div>
      </div>`;
  }

  public setLocationAvatarUrl(url: string | null): void {
    this.locationAvatarUrl = url;
    if (this.locationMarker) {
      this.locationMarker.setIcon({ content: this._buildLocationMarkerContent(), anchor: new window.naver.maps.Point(30, 30) });
    }
  }

  public startWatchingLocation(onLocationUpdate?: (lat: number, lng: number) => void): void {
    if (!this.map) return;
    if (!navigator.geolocation) return;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.lastPosition = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        if (!this.map) return;
        const { latitude, longitude } = pos.coords;
        const latLng = new window.naver.maps.LatLng(latitude, longitude);

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

        onLocationUpdate?.(latitude, longitude);
      },
      () => { /* 에러 무시 */ },
    );
  }

  public destroy(): void {
    this.stopWatchingLocation();
    this._logoEl?.remove();
    this._logoEl = null;
    document.head.querySelector('style[data-map-logo-hide]')?.remove();
    this.map?.destroy();
    this.map = null;
  }
}

export { MapStore };
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build 2>&1 | head -50`
Expected: 타입 에러 발생 (아직 소비자를 업데이트하지 않아서). 에러 목록을 확인해 Task 3에서 해결할 소비자를 파악.

- [ ] **Step 4: 커밋**

```bash
git add src/stores/MapRenderingStore.ts src/stores/MapStore.ts
git commit -m "refactor: MapStore에서 렌더링/체크포인트 로직을 MapRenderingStore로 분리"
```

---

### Task 2: MemberMarkerStore 추출

**Files:**
- Create: `src/stores/MemberMarkerStore.ts`
- Modify: `src/stores/MapStore.ts` (이미 Task 1에서 수정된 버전)

- [ ] **Step 1: `MemberMarkerStore` 생성**

```typescript
// src/stores/MemberMarkerStore.ts
import { makeAutoObservable } from 'mobx';

class MemberMarkerStore {
  private _memberMarkers: Map<string, naver.maps.Marker> = new Map();
  private getMap: () => naver.maps.Map | null;

  public constructor(getMap: () => naver.maps.Map | null) {
    this.getMap = getMap;
    makeAutoObservable(this);
  }

  public updateMemberMarker(userId: string, displayName: string, lat: number, lng: number, avatarUrl?: string | null): void {
    const map = this.getMap();
    if (!map) return;
    const latLng = new window.naver.maps.LatLng(lat, lng);
    const existing = this._memberMarkers.get(userId);
    if (existing) {
      existing.setPosition(latLng);
    } else {
      const initial = displayName.charAt(0).toUpperCase() || '?';
      const inner = avatarUrl
        ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
        : `<div style="width:100%;height:100%;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;">${initial}</div>`;
      const content = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="width:32px;height:32px;border-radius:50%;overflow:hidden;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2);background:white;flex-shrink:0;">
            ${inner}
          </div>
          <div style="background:rgba(0,0,0,0.72);color:white;border-radius:4px;padding:2px 5px;font-size:10px;font-weight:600;white-space:nowrap;max-width:64px;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.01em;">${displayName}</div>
        </div>`;
      const marker = new window.naver.maps.Marker({
        map,
        position: latLng,
        icon: {
          content,
          anchor: new window.naver.maps.Point(16, 16),
        },
      });
      this._memberMarkers.set(userId, marker);
    }
  }

  public clearAll(): void {
    this._memberMarkers.forEach((marker) => marker.setMap(null));
    this._memberMarkers.clear();
  }
}

export { MemberMarkerStore };
```

- [ ] **Step 2: `MapStore`에서 멤버마커 관련 코드 제거**

`src/stores/MapStore.ts`에서 제거:
- `_memberMarkers` 필드
- `updateMemberMarker()` 메서드
- `clearMemberMarkers()` 메서드
- `destroy()`의 `clearMemberMarkers()` 호출

- [ ] **Step 3: 커밋**

```bash
git add src/stores/MemberMarkerStore.ts src/stores/MapStore.ts
git commit -m "refactor: MapStore에서 멤버 마커 로직을 MemberMarkerStore로 분리"
```

---

### Task 3: TrackingBroadcastStore 추출

**Files:**
- Create: `src/stores/TrackingBroadcastStore.ts`
- Modify: `src/stores/TrackingStore.ts`

- [ ] **Step 1: `TrackingBroadcastStore` 생성**

```typescript
// src/stores/TrackingBroadcastStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { haversineMeters } from '../utils/routeProjection';
import type { TrackingStore } from './TrackingStore';

class TrackingBroadcastStore {
  public displayName: string | null = null;
  private _channel: ReturnType<typeof supabase.channel> | null = null;
  private _userId: string | null = null;
  private _lastBroadcastLat: number | null = null;
  private _lastBroadcastLng: number | null = null;
  private _positionSaveTimerId: ReturnType<typeof setInterval> | null = null;
  private groupId: string;
  private trackingStore: TrackingStore;

  public constructor(groupId: string, trackingStore: TrackingStore) {
    this.groupId = groupId;
    this.trackingStore = trackingStore;
    makeAutoObservable(this);
  }

  public get userId(): string | null {
    return this._userId;
  }

  public async start(): Promise<void> {
    if (this._channel) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();

      const channel = supabase.channel(`group-progress:${this.groupId}`);
      channel.subscribe();

      runInAction(() => {
        this._userId = user.id;
        this.displayName = profile?.display_name ?? user.email?.split('@')[0] ?? null;
        this._channel = channel;
      });
    } catch {
      return;
    }

    // 진입 즉시 위치 저장
    const lat = this.trackingStore.latestLat;
    const lng = this.trackingStore.latestLng;
    if (this._userId && lat !== null && lng !== null) {
      void supabase.from('group_member_positions').upsert({
        user_id: this._userId,
        group_id: this.groupId,
        lat,
        lng,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,group_id' });
    }

    runInAction(() => {
      this._positionSaveTimerId = setInterval(() => {
        const curLat = this.trackingStore.latestLat;
        const curLng = this.trackingStore.latestLng;
        if (this._userId && curLat !== null && curLng !== null) {
          void supabase.from('group_member_positions').upsert({
            user_id: this._userId,
            group_id: this.groupId,
            lat: curLat,
            lng: curLng,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,group_id' });
        }
      }, 5000);
    });
  }

  public broadcast(lat: number, lng: number): void {
    if (!this._channel || !this._userId) return;

    const MIN_DISTANCE_M = 5;
    if (this._lastBroadcastLat !== null && this._lastBroadcastLng !== null) {
      const dist = haversineMeters(this._lastBroadcastLat, this._lastBroadcastLng, lat, lng);
      if (dist < MIN_DISTANCE_M) return;
    }

    this._lastBroadcastLat = lat;
    this._lastBroadcastLng = lng;

    void this._channel.send({
      type: 'broadcast',
      event: 'progress',
      payload: {
        userId: this._userId,
        displayName: this.displayName,
        maxRouteMeters: this.trackingStore.maxRouteMeters,
        lat,
        lng,
        checkpointsVisited: this.trackingStore.visitedCheckpointIds.size,
      },
    });
  }

  public broadcastImmediate(): void {
    const lat = this.trackingStore.latestLat;
    const lng = this.trackingStore.latestLng;
    if (lat !== null && lng !== null) {
      this._lastBroadcastLat = null;
      this._lastBroadcastLng = null;
      this.broadcast(lat, lng);
    }
  }

  public dispose(): void {
    if (this._positionSaveTimerId !== null) {
      clearInterval(this._positionSaveTimerId);
      this._positionSaveTimerId = null;
    }
    // 마지막 위치 저장
    const lat = this.trackingStore.latestLat;
    const lng = this.trackingStore.latestLng;
    if (this._userId && lat !== null && lng !== null) {
      void supabase.from('group_member_positions').upsert({
        user_id: this._userId,
        group_id: this.groupId,
        lat,
        lng,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,group_id' });
    }
    if (this._channel) {
      void supabase.removeChannel(this._channel);
      runInAction(() => { this._channel = null; });
    }
  }
}

export { TrackingBroadcastStore };
```

- [ ] **Step 2: `TrackingStore`에서 broadcast 관련 코드 제거**

`src/stores/TrackingStore.ts`에서 제거:
- `displayName` 필드
- `_lastBroadcastLat`, `_lastBroadcastLng` 필드
- `_positionSaveTimerId` 필드
- `_userId` 필드 (broadcast에서만 사용 — `visitCheckpoint`에서 필요하면 인라인으로 `supabase.auth.getUser()` 호출 또는 별도 저장)
- `_channel` 필드
- `startLocationBroadcast()` 메서드
- `_maybeBroadcast()` 메서드
- `dispose()`에서 `_positionSaveTimerId` 정리, `_channel` 정리, 위치 저장 로직
- `setLatestPosition()`에서 `this._maybeBroadcast(lat, lng)` 호출
- `visitCheckpoint()`에서 broadcast 전송 코드 (lines 421-435)

**주의:** `_userId`와 `_sessionId`는 `start()`, `stop()`, `restore()`, `visitCheckpoint()` 등에서도 사용됨. `_userId`는 TrackingStore에 유지하되, broadcast 관련 로직만 제거.

수정 후 `TrackingStore.setLatestPosition()`:
```typescript
public setLatestPosition(lat: number, lng: number): void {
  this.latestLat = lat;
  this.latestLng = lng;
  this._updateNearCheckpoint(lat, lng);
}
```

수정 후 `TrackingStore.dispose()`:
```typescript
public dispose(): void {
  this._clearTimer();
}
```

수정 후 `TrackingStore.visitCheckpoint()` — broadcast 전송 부분 제거, `onCheckpointVisited` 콜백 추가:
```typescript
private _onCheckpointVisited: (() => void) | null = null;

public setOnCheckpointVisited(cb: (() => void) | null): void {
  this._onCheckpointVisited = cb;
}

public async visitCheckpoint(checkpointId: string): Promise<void> {
  // ... 기존 로직 유지, broadcast 전송 코드만 제거 ...

  runInAction(() => {
    this.visitedCheckpointIds = new Set([...this.visitedCheckpointIds, checkpointId]);
    this.nearCheckpointId = null;
  });

  this._onCheckpointVisited?.();

  if (checkpoint?.is_finish) {
    runInAction(() => {
      this.maxRouteMeters = totalRouteDistance(this.routePoints);
    });
    runInAction(() => { this.isFinished = true; });
    await this.stop();
  }
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build 2>&1 | head -50`
Expected: 소비자(GroupMapPage)에서 타입 에러. Task 5에서 해결.

- [ ] **Step 4: 커밋**

```bash
git add src/stores/TrackingBroadcastStore.ts src/stores/TrackingStore.ts
git commit -m "refactor: TrackingStore에서 broadcast 로직을 TrackingBroadcastStore로 분리"
```

---

### Task 4: GroupMapUIStore 생성

**Files:**
- Create: `src/stores/ui/GroupMapUIStore.ts`

- [ ] **Step 1: `ui/` 디렉토리 생성 및 `GroupMapUIStore` 작성**

```typescript
// src/stores/ui/GroupMapUIStore.ts
import { makeAutoObservable, runInAction, reaction } from 'mobx';
import { supabase } from '../../lib/supabase';
import { parseGpxCoords } from '../../lib/gpx';
import { parseGpxPoints } from '../../utils/routeProjection';
import { MapStore } from '../MapStore';
import { MapRenderingStore } from '../MapRenderingStore';
import { MemberMarkerStore } from '../MemberMarkerStore';
import { GroupMapStore } from '../GroupMapStore';
import { TrackingStore } from '../TrackingStore';
import { TrackingBroadcastStore } from '../TrackingBroadcastStore';
import { LeaderboardStore } from '../LeaderboardStore';
import type { Checkpoint } from '../../types/checkpoint';

class GroupMapUIStore {
  public activeTab: 'map' | 'leaderboard' = 'map';
  public showElevation = false;
  public showRestartConfirm = false;
  public showCountdown = false;
  public starting = false;
  public resetting = false;
  public checkpoints: Checkpoint[] = [];
  public totalCheckpoints = 0;

  public mapStore: MapStore;
  public renderingStore: MapRenderingStore;
  public memberMarkerStore: MemberMarkerStore;
  public groupMapStore: GroupMapStore;
  public trackingStore: TrackingStore;
  public broadcastStore: TrackingBroadcastStore;
  public leaderboardStore: LeaderboardStore;

  private _disposers: (() => void)[] = [];

  public constructor(groupId: string, navigate: import('react-router-dom').NavigateFunction) {
    this.mapStore = new MapStore();
    this.renderingStore = new MapRenderingStore(() => this.mapStore.map);
    this.memberMarkerStore = new MemberMarkerStore(() => this.mapStore.map);
    this.groupMapStore = new GroupMapStore(navigate);
    this.trackingStore = new TrackingStore(groupId, []);
    this.broadcastStore = new TrackingBroadcastStore(groupId, this.trackingStore);
    this.leaderboardStore = new LeaderboardStore(groupId);

    makeAutoObservable(this);
  }

  public get routePoints() {
    return this.groupMapStore.gpxText ? parseGpxPoints(this.groupMapStore.gpxText) : [];
  }

  public setActiveTab(tab: 'map' | 'leaderboard'): void {
    this.activeTab = tab;
  }

  public toggleLeaderboard(): void {
    this.activeTab = this.activeTab === 'leaderboard' ? 'map' : 'leaderboard';
  }

  public toggleElevation(): void {
    this.showElevation = !this.showElevation;
    this.activeTab = 'map';
  }

  public openRestartConfirm(): void {
    if (!this.resetting) this.showRestartConfirm = true;
  }

  public closeRestartConfirm(): void {
    this.showRestartConfirm = false;
  }

  public openCountdown(): void {
    this.showCountdown = true;
  }

  public async handleCountdownComplete(): Promise<void> {
    runInAction(() => { this.starting = true; });
    try {
      await this.trackingStore.start();
    } finally {
      runInAction(() => {
        this.starting = false;
        this.showCountdown = false;
      });
    }
  }

  public async handleRestart(): Promise<void> {
    this.showRestartConfirm = false;
    runInAction(() => { this.resetting = true; });
    try {
      await this.trackingStore.restart();
    } finally {
      runInAction(() => { this.resetting = false; });
    }
  }

  public async initMap(el: HTMLDivElement): Promise<void> {
    this.mapStore.initMap(el);

    this.mapStore.startWatchingLocation((lat, lng) => {
      this.trackingStore.setLatestPosition(lat, lng);
      this.trackingStore.addPoint(lat, lng);
      this.broadcastStore.broadcast(lat, lng);
    });

    void this.broadcastStore.start();

    this.renderingStore.setOnCheckpointTap((cpId) => {
      void this.trackingStore.visitCheckpoint(cpId);
    });

    this.trackingStore.setOnCheckpointVisited(() => {
      this.broadcastStore.broadcastImmediate();
    });
  }

  public async loadGroup(groupId: string): Promise<void> {
    this.groupMapStore.load(groupId);
  }

  public async loadAvatarUrl(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_path')
      .eq('id', user.id)
      .single();
    if (!profile?.avatar_path) return;
    const { data: signed } = await supabase.storage
      .from('avatars')
      .createSignedUrl(profile.avatar_path, 3600);
    if (signed?.signedUrl) this.mapStore.setLocationAvatarUrl(signed.signedUrl);
  }

  public drawRoute(): void {
    const gpxText = this.groupMapStore.gpxText;
    if (gpxText === undefined || !this.mapStore.map) return;
    if (gpxText === null) {
      runInAction(() => { this.mapStore.error = true; });
      return;
    }
    const firstCoord = parseGpxCoords(gpxText)?.[0];
    if (firstCoord) this.mapStore.map.setCenter(new window.naver.maps.LatLng(firstCoord.lat, firstCoord.lon));
    this.renderingStore.drawGpxRoute(gpxText);
  }

  public async initAfterLoad(groupId: string): Promise<void> {
    const routePoints = this.routePoints;
    if (routePoints.length > 0) this.trackingStore.setRoutePoints(routePoints);

    await this.trackingStore.restore();

    // 체크포인트 로드
    const { data } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('group_id', groupId)
      .order('sort_order', { ascending: true });

    const cps = (data ?? []) as Checkpoint[];
    runInAction(() => {
      this.checkpoints = cps;
      this.totalCheckpoints = cps.length;
    });
    this.trackingStore.setCheckpoints(cps);

    void this.leaderboardStore.load(this.groupMapStore.periodStartedAt ?? null);

    const admin = this.groupMapStore.currentUserId === this.groupMapStore.group?.created_by;
    const unsubscribe = this.groupMapStore.subscribeToPeriodEvents(admin);
    this._disposers.push(unsubscribe);

    const disposerEnd = reaction(
      () => this.groupMapStore.periodEndedAt,
      (endedAt) => {
        void this.leaderboardStore.load(this.groupMapStore.periodStartedAt);
        if (endedAt && this.trackingStore.isTracking) {
          void this.trackingStore.stop();
        }
      },
    );
    this._disposers.push(disposerEnd);

    const disposerStart = reaction(
      () => this.groupMapStore.periodStartedAt,
      (startedAt) => { void this.leaderboardStore.load(startedAt); },
    );
    this._disposers.push(disposerStart);
  }

  public dispose(): void {
    this._disposers.forEach((d) => d());
    this._disposers = [];
    this.trackingStore.dispose();
    this.broadcastStore.dispose();
    this.leaderboardStore.dispose();
    this.renderingStore.destroy();
    this.memberMarkerStore.clearAll();
    this.mapStore.destroy();
  }
}

export { GroupMapUIStore };
```

- [ ] **Step 2: 커밋**

```bash
git add src/stores/ui/GroupMapUIStore.ts
git commit -m "feat: GroupMapUIStore 생성 — GroupMapPage UI 상태 및 오케스트레이션 담당"
```

---

### Task 5: GroupMapPage를 새 스토어들 사용하도록 수정

**Files:**
- Modify: `src/pages/GroupMapPage.tsx`

- [ ] **Step 1: GroupMapPage를 GroupMapUIStore 사용하도록 전면 수정**

`GroupMapPage`의 모든 `useState` (activeTab, showElevation, showRestartConfirm, showCountdown, starting, resetting, checkpoints, totalCheckpoints)를 제거하고, `GroupMapUIStore`의 상태를 사용. `useEffect`들을 최소화.

```tsx
// src/pages/GroupMapPage.tsx
import { useRef, useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { NavigationBar } from '../components/NavigationBar';
import { RestartConfirmSheet } from '../components/RestartConfirmSheet';
import { CountdownOverlay } from '../components/CountdownOverlay';
import { FinishCelebration } from '../components/FinishCelebration';
import { runInAction, autorun } from 'mobx';
import { Button } from '@/components/ui/button';
import { Crosshair, Trophy, X, Settings, TrendingUp } from 'lucide-react';
import { ElevationChart } from '../components/ElevationChart';
import { totalRouteDistance } from '../utils/routeProjection';
import { GroupMapUIStore } from '../stores/ui/GroupMapUIStore';
import type { Ranking } from '../stores/LeaderboardStore';

export const GroupMapPage = observer(() => {
  const { id } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const [uiStore] = useState(() => new GroupMapUIStore(id!, navigate));

  // 편의 참조
  const mapStore = uiStore.mapStore;
  const renderingStore = uiStore.renderingStore;
  const groupMapStore = uiStore.groupMapStore;
  const trackingStore = uiStore.trackingStore;
  const leaderboardStore = uiStore.leaderboardStore;

  const totalRouteMeters = useMemo(
    () => totalRouteDistance(uiStore.routePoints),
    [uiStore.routePoints],
  );

  // 그룹 데이터 로드
  useEffect(() => {
    if (!id) return;
    return groupMapStore.load(id);
  }, [groupMapStore, id]);

  // 아바타 URL 로드
  useEffect(() => {
    void uiStore.loadAvatarUrl();
  }, [uiStore]);

  // 지도 초기화
  useEffect(() => {
    if (!mapRef.current || !groupMapStore.group) return;
    void uiStore.initMap(mapRef.current);
    return () => { uiStore.dispose(); };
  }, [uiStore, groupMapStore.group]);

  // 경로 그리기
  useEffect(() => {
    uiStore.drawRoute();
  }, [uiStore, groupMapStore.gpxText, mapStore.map]);

  // 그룹/GPX 로드 완료 후 초기화
  const initialized = useRef(false);
  useEffect(() => {
    if (!id || groupMapStore.group == null || groupMapStore.gpxText == null || initialized.current) return;
    initialized.current = true;
    void uiStore.initAfterLoad(id);
  }, [id, uiStore, groupMapStore.group, groupMapStore.gpxText]);

  // 멤버 마커 업데이트
  useEffect(() => {
    const disposer = autorun(() => {
      leaderboardStore.rankings.forEach((r) => {
        if (r.userId === groupMapStore.currentUserId) return;
        if (r.lat != null && r.lng != null) {
          uiStore.memberMarkerStore.updateMemberMarker(r.userId, r.displayName, r.lat, r.lng, r.avatarUrl);
        }
      });
    });
    return disposer;
  }, [leaderboardStore, uiStore.memberMarkerStore, groupMapStore]);

  // 체크포인트 마커 렌더링
  useEffect(() => {
    if (uiStore.checkpoints.length === 0 || !mapStore.map) return;
    const disposer = autorun(() => {
      renderingStore.drawCheckpoints(
        uiStore.checkpoints,
        trackingStore.visitedCheckpointIds,
        trackingStore.nearCheckpointId,
      );
    });
    return disposer;
  }, [uiStore.checkpoints, mapStore, renderingStore, trackingStore]);

  if (groupMapStore.group === null) return <Navigate to="/group" replace />;

  if (groupMapStore.group === undefined) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white">
        <div
          role="status"
          className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin"
        />
      </div>
    );
  }

  const isTrackingActive = trackingStore.isTracking || trackingStore.saving;
  const sideButtonsBottom = uiStore.showElevation ? 236 : isTrackingActive ? 176 : 96;
  const trackingPanelBottom = uiStore.showElevation ? 228 : 24;
  const bottomCenterBottom = uiStore.showElevation ? 228 : 32;

  const displayRankings = (() => {
    if (!trackingStore.isTracking || !groupMapStore.currentUserId) return leaderboardStore.rankings;
    const meAlreadyIn = leaderboardStore.rankings.some((r) => r.userId === groupMapStore.currentUserId);
    if (meAlreadyIn) return leaderboardStore.rankings;
    const myEntry: Ranking = {
      userId: groupMapStore.currentUserId,
      displayName: uiStore.broadcastStore.displayName ?? '나',
      maxRouteMeters: trackingStore.maxRouteMeters,
      isLive: true,
      lat: trackingStore.latestLat,
      lng: trackingStore.latestLng,
      avatarUrl: null,
      checkpointsVisited: trackingStore.visitedCheckpointIds.size,
    };
    return [...leaderboardStore.rankings, myEntry].sort((a, b) => b.maxRouteMeters - a.maxRouteMeters);
  })();

  const formatProgress = (maxRouteMeters: number) => {
    if (totalRouteMeters > 0) {
      const pct = Math.min(100, Math.round((maxRouteMeters / totalRouteMeters) * 100));
      return `${pct}%`;
    }
    return maxRouteMeters >= 1000
      ? `${(maxRouteMeters / 1000).toFixed(1)}km`
      : `${Math.round(maxRouteMeters)}m`;
  };

  // JSX는 기존과 동일하되, 아래 변경사항 적용:
  // - setActiveTab → uiStore.setActiveTab
  // - setShowElevation → uiStore.toggleElevation()
  // - setShowRestartConfirm → uiStore.openRestartConfirm() / uiStore.closeRestartConfirm()
  // - setShowCountdown → uiStore.openCountdown()
  // - trackingStore.start/restart → uiStore.handleCountdownComplete() / uiStore.handleRestart()
  // - mapStore.returnToCourse() → renderingStore.returnToCourse()
  // - mapStore.gpxPolyline → renderingStore.gpxPolyline
  // - mapStore.isCourseVisible → renderingStore.isCourseVisible
  // - store.* → groupMapStore.*
  // - 전체 JSX return문은 기존 UI를 유지하면서 위 참조만 교체

  return (
    // ... 기존 JSX 유지, 상태 참조만 교체 (전체 JSX 코드는 기존 GroupMapPage.tsx 참고) ...
    // 핵심 변경점:
    // 1. renderingStore.gpxPolyline 사용 (shimmer 조건)
    // 2. renderingStore.isCourseVisible 사용 (코스로 돌아가기 버튼)
    // 3. renderingStore.returnToCourse() 사용
    // 4. uiStore.activeTab, uiStore.showElevation 등 UI 상태 사용
    // 5. uiStore.toggleLeaderboard(), uiStore.toggleElevation() 등 UI 액션 사용
    // 6. uiStore.handleCountdownComplete(), uiStore.handleRestart() 사용
    // 7. groupMapStore.* 사용 (group, isPeriodActive 등)
    // 8. uiStore.broadcastStore.displayName 사용 (displayRankings 내)
    // ... 기존 return문 전체를 복사하되 위 참조를 적용 ...
  );
});
```

**참고: JSX return문은 기존 GroupMapPage.tsx의 return문 전체를 복사한 후, 상태 참조만 위 매핑에 따라 치환합니다. JSX 구조 자체는 변경 없음.**

주요 치환 맵:
| 기존 | 변경 |
|------|------|
| `mapStore.gpxPolyline` | `renderingStore.gpxPolyline` |
| `mapStore.isCourseVisible` | `renderingStore.isCourseVisible` |
| `mapStore.returnToCourse()` | `renderingStore.returnToCourse()` |
| `activeTab` | `uiStore.activeTab` |
| `setActiveTab(...)` | `uiStore.setActiveTab(...)` |
| `showElevation` | `uiStore.showElevation` |
| `setShowElevation(...)` | `uiStore.toggleElevation()` |
| `showRestartConfirm` | `uiStore.showRestartConfirm` |
| `setShowRestartConfirm(true)` | `uiStore.openRestartConfirm()` |
| `setShowRestartConfirm(false)` | `uiStore.closeRestartConfirm()` |
| `showCountdown` | `uiStore.showCountdown` |
| `setShowCountdown(true)` | `uiStore.openCountdown()` |
| `starting` | `uiStore.starting` |
| `resetting` | `uiStore.resetting` |
| `store.*` | `groupMapStore.*` |
| `trackingStore.displayName` | `uiStore.broadcastStore.displayName` |
| `checkpoints` | `uiStore.checkpoints` |
| `totalCheckpoints` | `uiStore.totalCheckpoints` |

RestartConfirmSheet onConfirm:
```tsx
onConfirm={() => void uiStore.handleRestart()}
```

CountdownOverlay onComplete:
```tsx
onComplete={() => void uiStore.handleCountdownComplete()}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build 2>&1 | head -80`
Expected: PASS (또는 CourseDetailPage 관련 에러만 남음)

- [ ] **Step 3: 커밋**

```bash
git add src/pages/GroupMapPage.tsx
git commit -m "refactor: GroupMapPage가 GroupMapUIStore 사용하도록 수정"
```

---

### Task 6: QuickGroupCreateStore를 GroupCreateStore에 통합

**Files:**
- Modify: `src/stores/GroupCreateStore.ts`

- [ ] **Step 1: `GroupCreateStore`에 `createFromCourse()` 메서드 추가**

```typescript
// GroupCreateStore.ts에 추가
public async createFromCourse(course: Course, groupName: string): Promise<string | null> {
  runInAction(() => {
    this.submitting = true;
    this.error = null;
  });

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    runInAction(() => { this.submitting = false; });
    toast.error('로그인이 필요합니다');
    return null;
  }

  const groupId = crypto.randomUUID();
  const { error } = await supabase.from('groups').insert({
    id: groupId,
    name: groupName.trim(),
    created_by: userId,
    gpx_path: course.gpx_path,
    gpx_bucket: 'course-gpx',
    thumbnail_path: course.thumbnail_path ?? null,
  });

  if (error) {
    runInAction(() => { this.submitting = false; });
    toast.error('그룹 생성에 실패했습니다');
    return null;
  }

  // 종료 체크포인트 자동 생성
  try {
    const { data: urlData } = await supabase.storage
      .from('course-gpx')
      .createSignedUrl(course.gpx_path, 60);
    if (urlData?.signedUrl) {
      const resp = await fetch(urlData.signedUrl);
      if (resp.ok) {
        const gpxText = await resp.text();
        const coords = parseGpxCoords(gpxText);
        if (coords && coords.length >= 2) {
          const lastCoord = coords[coords.length - 1];
          const totalDist = computeDistanceM(coords);
          await supabase.from('checkpoints').insert({
            group_id: groupId,
            name: '종료',
            lat: lastCoord.lat,
            lng: lastCoord.lon,
            radius_m: 30,
            sort_order: totalDist,
            is_finish: true,
          });
        }
      }
    }
  } catch {
    // 체크포인트 생성 실패해도 그룹 생성은 성공으로 처리
  }

  runInAction(() => { this.submitting = false; });
  return groupId;
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/stores/GroupCreateStore.ts
git commit -m "feat: GroupCreateStore에 createFromCourse() 메서드 추가"
```

---

### Task 7: CourseDetailUIStore 생성 + CourseDetailPage 수정

**Files:**
- Create: `src/stores/ui/CourseDetailUIStore.ts`
- Modify: `src/pages/CourseDetailPage.tsx`

- [ ] **Step 1: `CourseDetailUIStore` 생성**

```typescript
// src/stores/ui/CourseDetailUIStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { GroupCreateStore } from '../GroupCreateStore';
import type { Course } from '../../types/course';

class CourseDetailUIStore {
  public gpxText: string | null | undefined = undefined;
  public showCreateSheet = false;
  public sheetVisible = false;
  public groupName = '';
  public groupCreateStore: GroupCreateStore;

  private navigate: NavigateFunction;

  public constructor(navigate: NavigateFunction) {
    this.navigate = navigate;
    this.groupCreateStore = new GroupCreateStore(navigate);
    makeAutoObservable(this);
  }

  public get canSubmit(): boolean {
    return this.groupName.trim().length > 0 && !this.groupCreateStore.submitting;
  }

  public setGroupName(v: string): void {
    this.groupName = v;
  }

  public openSheet(): void {
    this.showCreateSheet = true;
  }

  public setSheetVisible(v: boolean): void {
    this.sheetVisible = v;
  }

  public closeSheet(): void {
    this.sheetVisible = false;
  }

  public hideSheet(): void {
    this.showCreateSheet = false;
    this.groupName = '';
  }

  public async createGroup(course: Course): Promise<void> {
    if (!this.canSubmit) return;
    const groupId = await this.groupCreateStore.createFromCourse(course, this.groupName);
    if (groupId) {
      this.navigate(`/group/${groupId}`);
    }
  }

  public async loadGpxText(gpxPath: string): Promise<void> {
    try {
      const { data, error } = await supabase.storage
        .from('course-gpx')
        .createSignedUrl(gpxPath, 3600);

      if (error || !data?.signedUrl) {
        runInAction(() => { this.gpxText = null; });
        return;
      }

      const res = await fetch(data.signedUrl);
      if (!res.ok) {
        runInAction(() => { this.gpxText = null; });
        return;
      }
      const text = await res.text();
      runInAction(() => { this.gpxText = text; });
    } catch {
      runInAction(() => { this.gpxText = null; });
    }
  }
}

export { CourseDetailUIStore };
```

- [ ] **Step 2: CourseDetailPage에서 QuickGroupCreateStore 제거 + CourseDetailUIStore 사용**

`src/pages/CourseDetailPage.tsx`에서:
1. `QuickGroupCreateStore` 클래스 정의 전체 삭제 (lines 17-93)
2. `CourseDetailUIStore` import 추가
3. `quickStore`, `showCreateSheet`, `sheetVisible`, `gpxText` useState 제거
4. `CourseDetailUIStore` 사용

변경 후 상단부:
```tsx
import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Heart, Send, Mountain, Route } from 'lucide-react';
import { toast } from 'sonner';
import { CourseDetailStore } from '../stores/CourseDetailStore';
import { MapStore } from '../stores/MapStore';
import { MapRenderingStore } from '../stores/MapRenderingStore';
import { NavigationBar } from '../components/NavigationBar';
import { ElevationChart } from '../components/ElevationChart';
import { CourseDetailUIStore } from '../stores/ui/CourseDetailUIStore';

export const CourseDetailPage = observer(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [store] = useState(() => new CourseDetailStore(id!));
  const [mapStore] = useState(() => new MapStore());
  const [renderingStore] = useState(() => new MapRenderingStore(() => mapStore.map));
  const [uiStore] = useState(() => new CourseDetailUIStore(navigate));
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<naver.maps.Map | null>(null);
  const elevationMarkerRef = useRef<naver.maps.Marker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openSheet = () => {
    if (!store.course) return;
    uiStore.openSheet();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        uiStore.setSheetVisible(true);
        setTimeout(() => inputRef.current?.focus(), 320);
      });
    });
  };

  const closeSheet = () => {
    uiStore.closeSheet();
    setTimeout(() => uiStore.hideSheet(), 300);
  };
  // ... 나머지 useEffect, JSX는 기존 구조 유지
  // gpxText → uiStore.gpxText
  // quickStore → uiStore
  // showCreateSheet → uiStore.showCreateSheet
  // sheetVisible → uiStore.sheetVisible
  // mapStore.drawGpxRoute → renderingStore.drawGpxRoute
  // mapStore.returnToCourse → renderingStore.returnToCourse
  // mapStore.gpxPolyline → renderingStore.gpxPolyline
```

GPX 로드 useEffect:
```tsx
useEffect(() => {
  if (!store.course) return;
  void uiStore.loadGpxText(store.course.gpx_path);
}, [store.course, uiStore]);
```

GPX 경로 그리기 useEffect:
```tsx
useEffect(() => {
  if (!uiStore.gpxText || !mapStore.map) return;
  renderingStore.drawGpxRoute(uiStore.gpxText);
  renderingStore.returnToCourse();
}, [renderingStore, uiStore.gpxText, mapStore.map]);
```

지도 초기화 useEffect의 destroy:
```tsx
return () => {
  renderingStore.destroy();
  mapStore.destroy();
  mapInstanceRef.current = null;
};
```

Bottom sheet의 create 버튼:
```tsx
onClick={() => void uiStore.createGroup(store.course!)}
disabled={!uiStore.canSubmit}
```

Input value:
```tsx
value={uiStore.groupName}
onChange={(e) => uiStore.setGroupName(e.target.value)}
onKeyDown={(e) => { if (e.key === 'Enter' && uiStore.canSubmit) void uiStore.createGroup(store.course!); }}
```

Shimmer 조건:
```tsx
{!renderingStore.gpxPolyline && !mapStore.error && ( ... )}
```

- [ ] **Step 3: 불필요한 import 정리**

CourseDetailPage에서 제거: `makeAutoObservable`, `runInAction`, `NavigateFunction`, `supabase`, `parseGpxCoords`, `computeDistanceM`, `Course` 타입 (uiStore가 처리)

- [ ] **Step 4: 빌드 확인**

Run: `npm run build 2>&1 | head -50`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/stores/ui/CourseDetailUIStore.ts src/pages/CourseDetailPage.tsx
git commit -m "refactor: CourseDetailPage에서 QuickGroupCreateStore 제거, CourseDetailUIStore로 통합"
```

---

### Task 8: 컴포넌트 화살표 함수 전환

**Files:**
- Modify: 모든 `function` 키워드로 선언된 컴포넌트/페이지 파일

- [ ] **Step 1: 페이지 컴포넌트 전환**

다음 파일들에서 `export function X()` 또는 `export default function X()` → `export const X = () => { ... };` 또는 `export const X = observer(() => { ... });` 로 변경:

- `src/pages/SetupProfilePage.tsx`: `export function SetupProfilePage()` → `export const SetupProfilePage = () => { ... };`
- `src/pages/AuthCallbackPage.tsx`: `export function AuthCallbackPage()` → `export const AuthCallbackPage = () => { ... };`
- `src/pages/MainLayout.tsx`: `export function MainLayout()` → `export const MainLayout = () => { ... };`
- `src/App.tsx`: `export default function App()` → `const App = () => { ... }; export default App;`

- [ ] **Step 2: 컴포넌트 전환**

- `src/components/GroupCard.tsx`: `export function GroupCard(...)` → `export const GroupCard = (...) => { ... };`, `export function useSignedUrl(...)` → `export const useSignedUrl = (...) => { ... };` (훅도 화살표 함수). 내부 헬퍼 함수 `getGroupStatus`, `formatDistance`, `formatElevation`, `MemberAvatarsSkeleton`, `MemberAvatars`도 화살표 함수로.
- `src/components/LargeTitle.tsx`: `export function LargeTitle(...)` → `export const LargeTitle = (...) => { ... };`
- `src/components/NavigationBar.tsx`: `export function NavigationBar(...)` → `export const NavigationBar = (...) => { ... };`
- `src/components/CourseThumbnail.tsx`: `export function CourseThumbnail(...)` → `export const CourseThumbnail = (...) => { ... };`
- `src/components/BottomTabBar.tsx`: `export function BottomTabBar()` → `export const BottomTabBar = () => { ... };`
- `src/components/FinishCelebration.tsx`: `export function FinishCelebration(...)` → `export const FinishCelebration = (...) => { ... };`
- `src/components/RestartConfirmSheet.tsx`: `export function RestartConfirmSheet(...)` → `export const RestartConfirmSheet = (...) => { ... };`
- `src/components/ElevationChart.tsx`: `export function ElevationChart(...)` → `export const ElevationChart = (...) => { ... };`
- `src/components/CountdownOverlay.tsx`: `export function CountdownOverlay(...)` → `export const CountdownOverlay = (...) => { ... };`
- `src/components/CourseCard.tsx`: `export function CourseCard(...)` → `export const CourseCard = (...) => { ... };`
- `src/components/CourseMapView.tsx`: `export function CourseMapView(...)` → `export const CourseMapView = (...) => { ... };`

**주의:** `src/components/ui/card.tsx`, `src/components/ui/button.tsx` 등 shadcn/ui 컴포넌트는 그대로 유지 (shadcn 컨벤션 존중).

- [ ] **Step 3: 페이지 내부 헬퍼 컴포넌트 전환**

- `src/pages/InvitePage.tsx`: `function GroupThumbnail(...)` → `const GroupThumbnail = (...) => { ... };`
- `src/pages/CoursePage.tsx`: `function Compass(...)` → `const Compass = (...) => { ... };`
- `src/pages/LoginPage.tsx`: `function GoogleIcon()` → `const GoogleIcon = () => { ... };`, `function KakaoIcon()` → `const KakaoIcon = () => { ... };`
- `src/pages/HistoryPage.tsx`: `function formatTime(...)`, `function formatDistance(...)`, `function formatDate(...)` → 화살표 함수. `function SessionCard(...)` → `const SessionCard = (...) => { ... };`
- `src/components/GroupCard.tsx`: 내부 헬퍼 `function getGroupStatus`, `function formatDistance`, `function formatElevation`, `function MemberAvatarsSkeleton`, `function MemberAvatars` → 화살표 함수.
- `src/components/BottomTabBar.tsx`: `function isActive(...)` → `const isActive = (...) => { ... };`
- `src/components/FinishCelebration.tsx`: `function randomBetween(...)` → `const randomBetween = (...) => { ... };`
- `src/components/CourseCard.tsx`: `function formatDistance(...)`, `function formatElevation(...)` → 화살표 함수
- `src/components/CourseMapView.tsx`: `function formatDistance(...)` → 화살표 함수

- [ ] **Step 4: import 경로 업데이트**

`App.tsx`에서 `export default function App` → named export로 변경하면 import가 달라질 수 있음. 기존에 `export default`로 사용 중이면 `const App = () => { ... }; export default App;`으로 유지하여 import 변경 최소화.

- [ ] **Step 5: 빌드 확인**

Run: `npm run build 2>&1 | head -50`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "refactor: 전체 컴포넌트를 화살표 함수로 전환"
```

---

### Task 9: CLAUDE.md 컨벤션 업데이트

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md에 새 컨벤션 추가**

`### 상태 관리 — MobX 스토어` 섹션 하단에 추가:

```markdown
### 스토어 분류

| 분류 | 접미사 | 위치 | 역할 |
|------|--------|------|------|
| 비즈니스 스토어 | `~Store` | `src/stores/` | 데이터 fetch, 비즈니스 로직, Supabase 통신 |
| UI 스토어 | `~UIStore` | `src/stores/ui/` | 페이지 전용 UI 상태 (탭, 모달, 초기화 오케스트레이션) |

**UI 스토어 패턴:** 페이지의 `useState`/`useEffect` 오케스트레이션을 UI 스토어로 이동한다. 페이지 컴포넌트는 JSX 렌더링만 담당.

```typescript
// UI 스토어 — src/stores/ui/GroupMapUIStore.ts
class GroupMapUIStore {
  activeTab: 'map' | 'leaderboard' = 'map';
  showElevation = false;
  // ...
  constructor() { makeAutoObservable(this); }
}
```
```

`### UI 컴포넌트` 섹션에 추가:

```markdown
### 컴포넌트 선언 규칙

- 리액트 컴포넌트/훅은 **화살표 함수**로 선언한다:
  ```tsx
  export const GroupCard = ({ group }: Props) => { ... };
  export const LoginPage = observer(() => { ... });
  ```
- `function` 키워드 선언은 사용하지 않는다 (shadcn/ui 기본 컴포넌트 제외).
```

- [ ] **Step 2: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md에 스토어 분류 및 컴포넌트 선언 컨벤션 추가"
```

---

## 요약

| Task | 내용 | 예상 변경 파일 수 |
|------|------|-----------------|
| 1 | MapRenderingStore 추출 | 2 (생성 1, 수정 1) |
| 2 | MemberMarkerStore 추출 | 2 (생성 1, 수정 1) |
| 3 | TrackingBroadcastStore 추출 | 2 (생성 1, 수정 1) |
| 4 | GroupMapUIStore 생성 | 1 (생성 1) |
| 5 | GroupMapPage 수정 | 1 |
| 6 | GroupCreateStore에 createFromCourse 추가 | 1 |
| 7 | CourseDetailUIStore + CourseDetailPage 수정 | 2 (생성 1, 수정 1) |
| 8 | 화살표 함수 전환 | ~15 |
| 9 | CLAUDE.md 업데이트 | 1 |
