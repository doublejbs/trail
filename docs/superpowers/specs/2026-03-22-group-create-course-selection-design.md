# 그룹 생성 — 코스 선택 기능 디자인

**날짜:** 2026-03-22
**범위:** `GroupCreatePage`, `GroupCreateStore`

## 목표

그룹 생성 시 GPX 파일을 직접 업로드하는 방식에 더해, 기존에 등록된 코스 목록에서 선택할 수 있는 기능 추가.

## 결정 사항

- GPX 파일 업로드와 코스 선택을 **둘 다** 제공 (탭으로 전환)
- 코스 선택 탭은 **카드 리스트 (인라인 스크롤)** 방식으로 표시

## GroupCreateStore 변경

### 추가 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `sourceMode` | `'course' \| 'file'` | 현재 선택된 탭 (기본값: `'course'`) |
| `courses` | `Course[]` | 로드된 코스 목록 |
| `coursesLoading` | `boolean` | 코스 목록 로딩 중 여부 |
| `selectedCourseId` | `string \| null` | 선택된 코스 ID |

### 추가 메서드

- `setSourceMode(mode)` — 탭 전환
- `setSelectedCourseId(id)` — 코스 선택
- `fetchCourses()` — Supabase에서 코스 목록 조회 (생성자에서 자동 호출)

### fetchCourses 쿼리

공개 코스(`is_public = true`) + 현재 사용자가 만든 코스(`created_by = userId`)를 OR 조건으로 조회. `created_at` 내림차순 정렬.

### isValid 변경

```
name.trim() !== '' &&
  (sourceMode === 'course' ? selectedCourseId !== null : file !== null)
```

### submit() 변경

- `sourceMode === 'course'`: 선택된 코스의 `gpx_path`를 그대로 그룹의 `gpx_path`로 사용. 파일 업로드 생략.
- `sourceMode === 'file'`: 기존 로직 유지 (gpx-files 버킷에 업로드 후 경로 저장).

## GroupCreatePage 변경

### 레이아웃

GPX 파일 입력 영역을 탭 UI로 교체:

```
[ 코스 선택 ] [ GPX 업로드 ]
```

### 코스 선택 탭

- 코스 카드 리스트 (세로 스크롤)
- 각 카드: 코스 이름, 거리(km), 고도 상승(m)
- 선택된 카드는 검정 테두리로 강조
- 로딩 중: 스피너 표시
- 코스 없음: "등록된 코스가 없습니다" 안내 문구

### GPX 업로드 탭

기존 파일 선택 UI 그대로 유지.

## 데이터 흐름

```
GroupCreatePage 마운트
  → GroupCreateStore 생성
  → fetchCourses() 자동 호출
  → Supabase courses 테이블 조회
  → courses 배열 채워짐

사용자: 코스 탭에서 카드 클릭
  → setSelectedCourseId(id)

사용자: "그룹 만들기" 클릭
  → submit()
  → sourceMode === 'course': course.gpx_path 사용
  → groups 테이블 INSERT
  → navigate('/group')
```

## 변경 파일

- `src/stores/GroupCreateStore.ts`
- `src/pages/GroupCreatePage.tsx`
