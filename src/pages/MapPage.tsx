import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Crosshair } from 'lucide-react'
import { useNaverMap } from '../hooks/useNaverMap'

export function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const { map, error } = useNaverMap(mapRef)

  const handleLocate = () => {
    if (!map || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords
      map.setCenter(new window.naver.maps.LatLng(latitude, longitude))
    })
  }

  return (
    <div className="relative w-full h-full">
      {/* 네이버 지도 컨테이너 */}
      <div
        ref={mapRef}
        data-testid="map-container"
        className="absolute inset-0"
      />

      {/* 에러 오버레이 */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
          <p className="text-sm text-neutral-500">지도를 불러올 수 없습니다</p>
        </div>
      )}

      {/* 내 위치 버튼 */}
      {map && (
        <div className="absolute right-3 bottom-3">
          <Button
            variant="secondary"
            size="icon"
            onClick={handleLocate}
            aria-label="내 위치"
            className="bg-white hover:bg-neutral-50 shadow-md"
          >
            <Crosshair size={18} className="text-neutral-700" />
          </Button>
        </div>
      )}
    </div>
  )
}
