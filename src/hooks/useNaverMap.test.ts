import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useNaverMap } from './useNaverMap'

const mockMap = { setCenter: vi.fn() }
const mockNaverMaps = {
  Map: vi.fn(function () { return mockMap }),
  LatLng: vi.fn(function (lat: number, lng: number) { return { lat, lng } }),
}

describe('useNaverMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_NAVER_MAP_CLIENT_ID', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete (window as unknown as Record<string, unknown>).naver
  })

  it('window.naver 없으면 error=true 반환', () => {
    delete (window as unknown as Record<string, unknown>).naver
    const div = document.createElement('div')
    const { result } = renderHook(() => {
      const ref = { current: div }
      return useNaverMap(ref as React.RefObject<HTMLDivElement>)
    })
    expect(result.current.map).toBeNull()
    expect(result.current.error).toBe(true)
  })

  it('window.naver 있으면 지도 초기화', () => {
    ;(window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps }
    const div = document.createElement('div')
    const { result } = renderHook(() => {
      const ref = { current: div }
      return useNaverMap(ref as React.RefObject<HTMLDivElement>)
    })
    expect(mockNaverMaps.Map).toHaveBeenCalledWith(div, expect.objectContaining({
      zoom: 14,
    }))
    expect(result.current.map).toBe(mockMap)
    expect(result.current.error).toBe(false)
    expect(mockNaverMaps.LatLng).toHaveBeenCalledWith(37.5665, 126.978)
  })

  it('naver.maps.Map 생성자 throw 시 error=true', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockNaverMaps.Map.mockImplementation(function () { throw new Error('init fail') })
    ;(window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps }
    const div = document.createElement('div')
    const { result } = renderHook(() => {
      const ref = { current: div }
      return useNaverMap(ref as React.RefObject<HTMLDivElement>)
    })
    expect(result.current.map).toBeNull()
    expect(result.current.error).toBe(true)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('VITE_NAVER_MAP_CLIENT_ID 미설정 시 error=true 및 콘솔 경고', () => {
    vi.stubEnv('VITE_NAVER_MAP_CLIENT_ID', '')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps }
    const div = document.createElement('div')
    const { result } = renderHook(() => {
      const ref = { current: div }
      return useNaverMap(ref as React.RefObject<HTMLDivElement>)
    })
    expect(result.current.error).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith('VITE_NAVER_MAP_CLIENT_ID is not set')
    warnSpy.mockRestore()
  })

  it('ref.current가 null이면 초기화 안 함', () => {
    ;(window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps }
    const { result } = renderHook(() => {
      const ref = { current: null }
      return useNaverMap(ref as unknown as React.RefObject<HTMLDivElement>)
    })
    expect(mockNaverMaps.Map).not.toHaveBeenCalled()
    expect(result.current.map).toBeNull()
    expect(result.current.error).toBe(false)
  })
})
