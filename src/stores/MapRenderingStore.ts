import { makeAutoObservable, observable, runInAction } from "mobx";
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

  public constructor(private getMap: () => naver.maps.Map | null) {
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

    // 이전 경로/마커 정리 (재호출 시 leak 방지)
    this.gpxPolyline?.setMap(null);
    this._extraPolylines.forEach((p) => p.setMap(null));
    this._extraPolylines = [];
    this.startMarker?.setMap(null);
    this.startMarker = null;
    this.endMarker?.setMap(null);
    this.endMarker = null;

    // 포인트 간 150m 이상 간격이면 세그먼트 분리 (트레일 구간 분리)
    const GAP_THRESHOLD = 150;
    const segments: naver.maps.LatLng[][] = [[]];
    for (let i = 0; i < allPoints.length; i++) {
      const pt = new window.naver.maps.LatLng(allPoints[i].lat, allPoints[i].lon);
      if (i > 0) {
        const prev = allPoints[i - 1];
        const dlat = allPoints[i].lat - prev.lat;
        const dlon = allPoints[i].lon - prev.lon;
        // 빠른 근사 거리 (정확한 haversine 대신)
        const approxM = Math.sqrt(dlat * dlat + dlon * dlon) * 111_000;
        if (approxM > GAP_THRESHOLD) {
          segments.push([]);
        }
      }
      segments[segments.length - 1].push(pt);
    }

    // 각 세그먼트를 별도 폴리라인으로 그리기
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

    // 첫 번째를 gpxPolyline으로, 나머지를 _extraPolylines로
    const allPts = segments.flat();
    if (polylines.length > 0) {
      this.gpxPolyline = polylines[0];
      this._extraPolylines = polylines.slice(1);
    }

    // gpxBounds 계산
    const bounds = allPts.reduce(
      (b, pt) => b.extend(pt),
      new window.naver.maps.LatLngBounds(allPts[0], allPts[0]),
    );
    this.gpxBounds = bounds;

    map.setCenter(allPts[0]);

    // 기존 idle 리스너 정리 후 재등록
    if (this.idleListener) {
      window.naver.maps.Event.removeListener(this.idleListener);
    }
    this.idleListener = window.naver.maps.Event.addListener(
      map,
      'idle',
      () => {
        const currentMap = this.getMap();
        if (!currentMap || !this.gpxBounds) return;
        const mapBounds = currentMap.getBounds();
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

    // 기존 endMarker 숨기기 (종료 체크포인트가 대체)
    if (checkpoints.some((cp) => cp.is_finish)) {
      this.endMarker?.setMap(null);
    }

    // 체크포인트별 순서 번호 (is_finish 제외)
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

      // 반경 원
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

    // 삭제된 체크포인트 정리
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
