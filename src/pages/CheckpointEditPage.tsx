// src/pages/CheckpointEditPage.tsx
import { useRef, useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { NavigationBar } from '../components/NavigationBar';
import { MapStore } from '../stores/MapStore';
import { MapRenderingStore } from '../stores/MapRenderingStore';
import { GroupSettingsStore } from '../stores/GroupSettingsStore';
import { parseGpxPoints } from '../utils/routeProjection';
import { snapToRoute } from '../utils/snapToRoute';
import { supabase } from '../lib/supabase';
import type { Checkpoint } from '../types/checkpoint';
import type { Group } from '../types/group';
import { useSafeBack } from '../hooks/useSafeBack';

export const CheckpointEditPage = observer(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapStore] = useState(() => new MapStore());
  const [renderingStore] = useState(() => new MapRenderingStore(() => mapStore.map));
  const [store] = useState(() => new GroupSettingsStore(navigate));
  const [gpxText, setGpxText] = useState<string | null>(null);
  const [editingCp, setEditingCp] = useState<Checkpoint | null>(null);
  const [cpName, setCpName] = useState('');
  const [cpRadius, setCpRadius] = useState('100');
  const [showSheet, setShowSheet] = useState(false);
  const [pendingSnap, setPendingSnap] = useState<{ lat: number; lng: number; distanceFromStart: number } | null>(null);

  const markersRef = useRef<naver.maps.Marker[]>([]);
  const circlesRef = useRef<naver.maps.Circle[]>([]);
  const pendingMarkerRef = useRef<naver.maps.Marker | null>(null);
  const pendingCircleRef = useRef<naver.maps.Circle | null>(null);

  const routePoints = useMemo(
    () => (gpxText ? parseGpxPoints(gpxText) : []),
    [gpxText],
  );

  // 그룹 데이터 + 체크포인트 로드
  useEffect(() => {
    if (id) store.load(id);
  }, [id, store]);

  // GPX 로드
  useEffect(() => {
    if (!store.group) return;
    const group = store.group as Group;
    (async () => {
      const { data: urlData } = await supabase.storage
        .from(group.gpx_bucket ?? 'gpx-files')
        .createSignedUrl(group.gpx_path, 3600);
      if (!urlData?.signedUrl) return;
      const resp = await fetch(urlData.signedUrl);
      if (resp.ok) {
        const text = await resp.text();
        setGpxText(text);
      }
    })();
  }, [store.group]);

  // 지도 초기화 + 경로 그리기
  useEffect(() => {
    if (!mapRef.current || !gpxText) return;
    mapStore.initMap(mapRef.current);
    renderingStore.drawGpxRoute(gpxText);
    return () => { renderingStore.destroy(); mapStore.destroy(); };
  }, [mapStore, gpxText]);

  // 체크포인트 마커 그리기
  useEffect(() => {
    if (!mapStore.map || store.checkpoints.length === 0) return;

    // 기존 마커 정리
    clearCheckpointMarkers();

    store.checkpoints.forEach((cp, i) => {
      const marker = new window.naver.maps.Marker({
        map: mapStore.map!,
        position: new window.naver.maps.LatLng(cp.lat, cp.lng),
        icon: {
          content: createCheckpointMarkerHtml(cp, i),
          anchor: new window.naver.maps.Point(16, 16),
        },
      });

      const circle = new window.naver.maps.Circle({
        map: mapStore.map!,
        center: new window.naver.maps.LatLng(cp.lat, cp.lng),
        radius: cp.radius_m,
        strokeColor: cp.is_finish ? '#F44336' : '#000000',
        strokeOpacity: 0.3,
        strokeWeight: 1,
        fillColor: cp.is_finish ? '#F44336' : '#000000',
        fillOpacity: 0.06,
      });

      window.naver.maps.Event.addListener(marker, 'click', () => {
        setEditingCp(cp);
        setCpName(cp.name);
        setCpRadius(String(cp.radius_m));
        setPendingSnap(null);
        setShowSheet(true);
      });

      markersRef.current.push(marker);
      circlesRef.current.push(circle);
    });
  }, [mapStore.map, store.checkpoints]);

  // 지도 클릭 → 새 체크포인트 or 수정 중 위치 변경
  const editingCpRef = useRef(editingCp);
  editingCpRef.current = editingCp;
  const cpRadiusRef = useRef(cpRadius);
  cpRadiusRef.current = cpRadius;

  useEffect(() => {
    if (!mapStore.map) return;
    const listener = window.naver.maps.Event.addListener(mapStore.map, 'click', (e: naver.maps.PointerEvent) => {
      if (routePoints.length < 2) return;
      const coord = e.coord as naver.maps.LatLng;
      const snap = snapToRoute(coord.lat(), coord.lng(), routePoints);
      if (!snap) return;

      if (editingCpRef.current) {
        // 수정 중이면 위치만 변경
        const r = parseInt(cpRadiusRef.current, 10) || 30;
        setPendingSnap(snap);
        showPendingMarker(snap.lat, snap.lng, r);
      } else {
        // 새 체크포인트
        setPendingSnap(snap);
        setEditingCp(null);
        setCpName('');
        setCpRadius('100');
        showPendingMarker(snap.lat, snap.lng, 100);
        setShowSheet(true);
      }
    });
    return () => { window.naver.maps.Event.removeListener(listener); };
  }, [mapStore.map, routePoints]);

  function clearCheckpointMarkers() {
    markersRef.current.forEach((m) => m.setMap(null));
    circlesRef.current.forEach((c) => c.setMap(null));
    markersRef.current = [];
    circlesRef.current = [];
  }

  function clearPendingMarker() {
    pendingMarkerRef.current?.setMap(null);
    pendingMarkerRef.current = null;
    pendingCircleRef.current?.setMap(null);
    pendingCircleRef.current = null;
  }

  function showPendingMarker(lat: number, lng: number, radius: number) {
    if (!mapStore.map) return;
    const position = new window.naver.maps.LatLng(lat, lng);

    clearPendingMarker();

    pendingMarkerRef.current = new window.naver.maps.Marker({
      map: mapStore.map,
      position,
      icon: {
        content: `<div style="width:32px;height:32px;border-radius:50%;background:black;display:flex;align-items:center;justify-content:center;color:white;font-size:14px;font-weight:bold;border:2px dashed white;box-shadow:0 2px 8px rgba(0,0,0,0.3);opacity:0.7;">+</div>`,
        anchor: new window.naver.maps.Point(16, 16),
      },
      zIndex: 200,
    });

    pendingCircleRef.current = new window.naver.maps.Circle({
      map: mapStore.map,
      center: position,
      radius,
      strokeColor: '#000000',
      strokeOpacity: 0.4,
      strokeWeight: 1.5,
      strokeStyle: 'dash',
      fillColor: '#000000',
      fillOpacity: 0.08,
    });
  }

  function createCheckpointMarkerHtml(cp: Checkpoint, index: number): string {
    if (cp.is_finish) {
      return `<div style="width:32px;height:32px;border-radius:50%;background:#F44336;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);">F</div>`;
    }
    return `<div style="width:32px;height:32px;border-radius:50%;background:white;display:flex;align-items:center;justify-content:center;color:black;font-size:12px;font-weight:bold;border:2px solid black;box-shadow:0 2px 6px rgba(0,0,0,0.15);">${index + 1}</div>`;
  }

  const handleSave = async () => {
    if (!id) return;
    const radius = parseInt(cpRadius, 10);
    if (isNaN(radius) || radius < 1) return;
    const name = cpName.trim() || '체크포인트';

    if (editingCp) {
      // 수정
      const updates: Record<string, unknown> = { name, radius_m: radius };
      if (pendingSnap) {
        updates.lat = pendingSnap.lat;
        updates.lng = pendingSnap.lng;
        updates.sort_order = pendingSnap.distanceFromStart;
      }
      await store.updateCheckpoint(editingCp.id, updates as { name?: string; radius_m?: number; lat?: number; lng?: number; sort_order?: number });
    } else if (pendingSnap) {
      // 신규
      await store.addCheckpoint(id, pendingSnap.lat, pendingSnap.lng, name, radius, pendingSnap.distanceFromStart);
    }

    setShowSheet(false);
    setEditingCp(null);
    setPendingSnap(null);
    clearPendingMarker();
  };

  const handleDelete = async () => {
    if (!editingCp) return;
    await store.removeCheckpoint(editingCp.id);
    setShowSheet(false);
    setEditingCp(null);
  };

  if (store.group === undefined) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <div className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (store.group === null || !id) {
    return <Navigate to="/group" replace />;
  }

  return (
    <div className="absolute inset-0 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <NavigationBar
        title="체크포인트 편집"
        onBack={safeBack}
      />
      <div className="flex-1 relative overflow-hidden">
        <div ref={mapRef} className="absolute inset-0 w-full h-full" />

        {/* 안내 오버레이 */}
        {!showSheet && (
          <div className="absolute top-4 left-4 right-4 z-10">
            <div className="bg-white/90 backdrop-blur rounded-xl px-4 py-2.5 shadow-lg shadow-black/5 border border-black/[0.06]">
              <p className="text-[12px] text-black/50 font-medium text-center">
                지도를 터치하여 체크포인트를 추가하세요
              </p>
            </div>
          </div>
        )}

        {/* 바텀시트 — 체크포인트 추가/수정 */}
        {showSheet && (
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-white rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.10)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="w-9 h-1 bg-black/10 rounded-full" />
            </div>
            <div className="px-5 pb-5 flex flex-col gap-3">
              <h3 className="text-[15px] font-bold text-black">
                {editingCp ? '체크포인트 수정' : '새 체크포인트'}
              </h3>
              <div>
                <label className="text-[11px] text-black/40 font-medium mb-1 block">이름</label>
                <input
                  type="text"
                  value={cpName}
                  onChange={(e) => setCpName(e.target.value)}
                  placeholder="체크포인트 이름"
                  className="w-full bg-black/[0.03] border border-black/[0.06] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-black/20"
                />
              </div>
              <div>
                <label className="text-[11px] text-black/40 font-medium mb-1 block">반경 (m)</label>
                <input
                  type="number"
                  min={1}
                  value={cpRadius}
                  onChange={(e) => {
                    setCpRadius(e.target.value);
                    const r = parseInt(e.target.value, 10);
                    if (pendingSnap && !isNaN(r) && r > 0) {
                      showPendingMarker(pendingSnap.lat, pendingSnap.lng, r);
                    }
                  }}
                  className="w-full bg-black/[0.03] border border-black/[0.06] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-black/20"
                />
              </div>
              <div className="flex gap-2 pt-1">
                {editingCp && !editingCp.is_finish && (
                  <button
                    onClick={handleDelete}
                    className="px-5 py-2.5 rounded-xl border border-red-200 text-red-500 text-[13px] font-semibold active:bg-red-50 transition-colors"
                  >
                    삭제
                  </button>
                )}
                <button
                  onClick={() => { setShowSheet(false); setEditingCp(null); setPendingSnap(null); clearPendingMarker(); }}
                  className="flex-1 py-2.5 rounded-xl border border-black/10 text-[13px] font-semibold text-black/50 active:bg-black/[0.03] transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-2.5 rounded-xl bg-black text-white text-[13px] font-semibold active:bg-black/80 transition-colors"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
