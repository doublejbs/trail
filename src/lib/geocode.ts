/**
 * 네이버 Maps JS SDK의 reverseGeocode 서비스로 시/군/구명 반환.
 * SDK가 로드되지 않았거나 실패 시 null 반환.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (typeof window === 'undefined' || !window.naver?.maps?.Service) return null;

  return new Promise((resolve) => {
    window.naver.maps.Service.reverseGeocode(
      { coords: new window.naver.maps.LatLng(lat, lng), orders: 'admcode' },
      (status, response) => {
        if (status !== window.naver.maps.Service.Status.OK) {
          resolve(null);
          return;
        }
        const result = response.v2?.results?.[0]?.region?.area2?.name ?? null;
        resolve(result || null);
      },
    );
  });
}
