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
