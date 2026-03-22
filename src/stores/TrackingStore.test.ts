import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInAction } from 'mobx';
import { TrackingStore } from './TrackingStore';

describe('TrackingStore', () => {
  let store: TrackingStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new TrackingStore();
  });

  afterEach(() => {
    store.dispose();
    vi.useRealTimers();
  });

  describe('초기 상태', () => {
    it('isTracking이 false', () => {
      expect(store.isTracking).toBe(false);
    });

    it('elapsedSeconds가 0', () => {
      expect(store.elapsedSeconds).toBe(0);
    });

    it('distanceMeters가 0', () => {
      expect(store.distanceMeters).toBe(0);
    });

    it('speedKmh가 0', () => {
      expect(store.speedKmh).toBe(0);
    });

    it('points가 빈 배열', () => {
      expect(store.points).toEqual([]);
    });
  });

  describe('start()', () => {
    it('isTracking을 true로 설정', () => {
      store.start();
      expect(store.isTracking).toBe(true);
    });

    it('1초마다 elapsedSeconds 증가', () => {
      store.start();
      vi.advanceTimersByTime(3000);
      expect(store.elapsedSeconds).toBe(3);
    });

    it('재호출 시 상태 리셋', () => {
      store.start();
      vi.advanceTimersByTime(5000);
      store.start();
      expect(store.elapsedSeconds).toBe(0);
      expect(store.distanceMeters).toBe(0);
      expect(store.speedKmh).toBe(0);
      expect(store.points).toEqual([]);
    });
  });

  describe('stop()', () => {
    it('isTracking을 false로 설정', () => {
      store.start();
      store.stop();
      expect(store.isTracking).toBe(false);
    });

    it('stop 후 타이머 멈춤 — elapsedSeconds 증가 없음', () => {
      store.start();
      vi.advanceTimersByTime(2000);
      store.stop();
      vi.advanceTimersByTime(3000);
      expect(store.elapsedSeconds).toBe(2);
    });

    it('stop 후 상태 보존 (리셋 안됨)', () => {
      store.start();
      vi.advanceTimersByTime(2000);
      store.stop();
      expect(store.elapsedSeconds).toBe(2);
    });
  });

  describe('dispose()', () => {
    it('dispose 후 타이머 멈춤', () => {
      store.start();
      vi.advanceTimersByTime(2000);
      store.dispose();
      vi.advanceTimersByTime(3000);
      expect(store.elapsedSeconds).toBe(2);
    });

    it('트래킹 중이 아닐 때 dispose 호출해도 에러 없음', () => {
      expect(() => store.dispose()).not.toThrow();
    });
  });

  describe('addPoint()', () => {
    it('isTracking이 false이면 무시', () => {
      store.addPoint(37.5, 126.9);
      expect(store.distanceMeters).toBe(0);
    });

    it('첫 번째 포인트 — distance 0, speed 0', () => {
      store.start();
      store.addPoint(37.5, 126.9);
      expect(store.distanceMeters).toBe(0);
      expect(store.speedKmh).toBe(0);
    });

    it('두 번째 포인트 — distance 누적', () => {
      store.start();
      store.addPoint(37.5, 126.9);
      store.addPoint(37.501, 126.9);
      expect(store.distanceMeters).toBeGreaterThan(0);
    });

    it('두 번째 포인트 — speed 계산', () => {
      store.start();
      const ts1 = Date.now();
      vi.setSystemTime(ts1);
      store.addPoint(37.5, 126.9);
      vi.setSystemTime(ts1 + 1000);
      store.addPoint(37.501, 126.9);
      expect(store.speedKmh).toBeGreaterThan(0);
    });
  });

  describe('computed', () => {
    it('formattedTime — 0초는 "00:00:00"', () => {
      expect(store.formattedTime).toBe('00:00:00');
    });

    it('formattedTime — 3661초는 "01:01:01"', () => {
      store.start();
      vi.advanceTimersByTime(3661000);
      expect(store.formattedTime).toBe('01:01:01');
    });

    it('formattedDistance — 999m는 "999m"', () => {
      store.start();
      runInAction(() => { store.distanceMeters = 999; });
      expect(store.formattedDistance).toBe('999m');
    });

    it('formattedDistance — 1000m는 "1.0km"', () => {
      store.start();
      runInAction(() => { store.distanceMeters = 1000; });
      expect(store.formattedDistance).toBe('1.0km');
    });

    it('formattedDistance — 1500m는 "1.5km"', () => {
      store.start();
      runInAction(() => { store.distanceMeters = 1500; });
      expect(store.formattedDistance).toBe('1.5km');
    });

    it('formattedSpeed — "0.0km/h"', () => {
      expect(store.formattedSpeed).toBe('0.0km/h');
    });

    it('formattedSpeed — speedKmh 반영', () => {
      store.start();
      runInAction(() => { store.speedKmh = 5.67; });
      expect(store.formattedSpeed).toBe('5.7km/h');
    });
  });
});
