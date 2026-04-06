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
