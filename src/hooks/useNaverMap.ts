import { type RefObject, useEffect, useState } from 'react'

interface UseNaverMapResult {
  map: naver.maps.Map | null
  error: boolean
}

export function useNaverMap(ref: RefObject<HTMLDivElement | null>): UseNaverMapResult {
  const [map, setMap] = useState<naver.maps.Map | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!ref.current) return

    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID
    if (!clientId) {
      console.warn('VITE_NAVER_MAP_CLIENT_ID is not set')
      setError(true)
      return
    }

    if (!window.naver) {
      setError(true)
      return
    }

    try {
      const instance = new window.naver.maps.Map(ref.current, {
        center: new window.naver.maps.LatLng(37.5665, 126.978),
        zoom: 14,
      })
      setMap(instance)
    } catch (e) {
      console.error('Naver Maps init failed:', e)
      setError(true)
    }
  }, [ref])

  return { map, error }
}
