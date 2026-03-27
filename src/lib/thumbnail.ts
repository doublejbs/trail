import type { GpxCoord } from './gpx';

const THUMB_W = 400;
const THUMB_H = 240;
const THUMB_PAD = 24;

function downsample(coords: GpxCoord[], maxPoints: number): GpxCoord[] {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const result: GpxCoord[] = [];
  for (let i = 0; i < maxPoints - 1; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  result.push(coords[coords.length - 1]);
  return result;
}

function mercatorY(lat: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
}

function calcMapView(coords: GpxCoord[]): { centerLon: number; centerLat: number; zoom: number } {
  const lons = coords.map((c) => c.lon);
  const lats = coords.map((c) => c.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;

  const lonSpan = (maxLon - minLon) * 1.3 || 0.005;
  const mercSpan = Math.abs(mercatorY(maxLat) - mercatorY(minLat)) * 1.3 || 0.00001;

  const zoomLon = Math.log2(THUMB_W / (lonSpan / 360 * 256));
  const zoomLat = Math.log2(THUMB_H / (mercSpan * 256));
  const zoom = Math.max(7, Math.min(17, Math.floor(Math.min(zoomLon, zoomLat)) - 1));

  return { centerLon, centerLat, zoom };
}

function lonLatToPixel(
  lon: number, lat: number,
  centerLon: number, centerLat: number,
  zoom: number, w: number, h: number,
): { x: number; y: number } {
  const scale = 256 * Math.pow(2, zoom);

  const worldX = ((lon + 180) / 360) * scale;
  const worldY = (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2 * scale;

  const centerWorldX = ((centerLon + 180) / 360) * scale;
  const centerWorldY = (1 - Math.log(Math.tan((centerLat * Math.PI) / 180) + 1 / Math.cos((centerLat * Math.PI) / 180)) / Math.PI) / 2 * scale;

  const adjust = 2;
  return {
    x: (worldX - centerWorldX) * adjust + w / 2,
    y: (worldY - centerWorldY) * adjust + h / 2,
  };
}

function drawRouteOnCanvas(
  ctx: CanvasRenderingContext2D,
  coords: GpxCoord[],
  centerLon: number, centerLat: number, zoom: number,
) {
  const toP = (c: GpxCoord) => lonLatToPixel(c.lon, c.lat, centerLon, centerLat, zoom, THUMB_W, THUMB_H);

  ctx.beginPath();
  const p0 = toP(coords[0]);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < coords.length; i++) {
    const p = toP(coords[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < coords.length; i++) {
    const p = toP(coords[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(p0.x, p0.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#4CAF50';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  const pLast = toP(coords[coords.length - 1]);
  ctx.beginPath();
  ctx.arc(pLast.x, pLast.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#F44336';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function canvasToBlob(canvas: HTMLCanvasElement): Blob | null {
  const dataUrl = canvas.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: 'image/png' });
}

/** Static Map API 배경 + Canvas 경로 오버레이 썸네일 생성 */
export async function renderThumbnailWithMap(coords: GpxCoord[]): Promise<Blob | null> {
  const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
  if (!clientId || coords.length < 2) return null;

  const { centerLon, centerLat, zoom } = calcMapView(coords);

  const staticMapUrl = `https://maps.apigw.ntruss.com/map-static/v2/raster-cors`
    + `?w=${THUMB_W}&h=${THUMB_H}`
    + `&center=${centerLon.toFixed(6)},${centerLat.toFixed(6)}`
    + `&level=${zoom}`
    + `&format=png`
    + `&X-NCP-APIGW-API-KEY-ID=${clientId}`;

  try {
    const res = await fetch(staticMapUrl, { referrerPolicy: 'origin' });
    if (!res.ok) return null;
    const mapBlob = await res.blob();
    if (!mapBlob.type.startsWith('image/')) return null;

    const bitmap = await createImageBitmap(mapBlob);
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext('2d')!;

    ctx.drawImage(bitmap, 0, 0, THUMB_W, THUMB_H);

    const sampled = downsample(coords, 200);
    drawRouteOnCanvas(ctx, sampled, centerLon, centerLat, zoom);

    return canvasToBlob(canvas);
  } catch {
    return null;
  }
}

/** 폴백: 지도 배경 없이 경로만 그리기 */
export function renderThumbnailFallback(coords: GpxCoord[]): Blob | null {
  if (coords.length < 2) return null;

  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#f3f3f0';
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  const lons = coords.map((c) => c.lon);
  const lats = coords.map((c) => c.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const dLon = maxLon - minLon || 0.001;
  const dLat = maxLat - minLat || 0.001;

  const drawW = THUMB_W - THUMB_PAD * 2;
  const drawH = THUMB_H - THUMB_PAD * 2;
  const scale = Math.min(drawW / dLon, drawH / dLat);
  const offsetX = THUMB_PAD + (drawW - dLon * scale) / 2;
  const offsetY = THUMB_PAD + (drawH - dLat * scale) / 2;

  const toX = (lon: number) => offsetX + (lon - minLon) * scale;
  const toY = (lat: number) => THUMB_H - offsetY - (lat - minLat) * scale;

  ctx.beginPath();
  ctx.moveTo(toX(coords[0].lon), toY(coords[0].lat));
  for (let i = 1; i < coords.length; i++) {
    ctx.lineTo(toX(coords[i].lon), toY(coords[i].lat));
  }
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(toX(coords[0].lon), toY(coords[0].lat), 5, 0, Math.PI * 2);
  ctx.fillStyle = '#4CAF50';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  const last = coords[coords.length - 1];
  ctx.beginPath();
  ctx.arc(toX(last.lon), toY(last.lat), 5, 0, Math.PI * 2);
  ctx.fillStyle = '#F44336';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvasToBlob(canvas);
}

/** 좌표에서 썸네일 생성 → Blob 반환 (Static Map API 시도 후 폴백) */
export async function generateThumbnail(coords: GpxCoord[]): Promise<Blob | null> {
  if (coords.length < 2) return null;
  const blob = await renderThumbnailWithMap(coords);
  if (blob) return blob;
  return renderThumbnailFallback(coords);
}
