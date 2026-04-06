import { makeAutoObservable, runInAction } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { parseGpxCoords, computeDistanceM } from '../lib/gpx';
import { generateThumbnail } from '../lib/thumbnail';
import type { Course } from '../types/course';

class GroupCreateStore {
  private navigate: NavigateFunction;
  public name: string = '';
  public file: File | null = null;
  public submitting: boolean = false;
  public error: string | null = null;
  public sourceMode: 'course' | 'file' = 'course';
  public courses: Course[] = [];
  public coursesLoading: boolean = false;
  public selectedCourseId: string | null = null;

  public constructor(navigate: NavigateFunction) {
    this.navigate = navigate;
    makeAutoObservable(this);
    this.fetchCourses();
  }

  public setName(v: string): void {
    this.name = v;
  }

  public setFile(f: File | null): void {
    this.file = f;
  }

  public setSourceMode(mode: 'course' | 'file'): void {
    this.sourceMode = mode;
  }

  public setSelectedCourseId(id: string | null): void {
    this.selectedCourseId = id;
  }

  public async fetchCourses(): Promise<void> {
    runInAction(() => { this.coursesLoading = true; });

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    let query = supabase
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.or(`is_public.eq.true,created_by.eq.${userId}`);
    } else {
      query = query.eq('is_public', true);
    }

    const { data, error } = await query;
    runInAction(() => {
      this.courses = error ? [] : (data ?? []) as Course[];
      this.coursesLoading = false;
    });
  }

  public get isValid(): boolean {
    if (this.name.trim() === '') return false;
    if (this.sourceMode === 'course') return this.selectedCourseId !== null;
    return this.file !== null;
  }

  public async createFromCourse(course: Course, groupName: string): Promise<string | null> {
    runInAction(() => {
      this.submitting = true;
      this.error = null;
    });

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      runInAction(() => { this.submitting = false; });
      toast.error('로그인이 필요합니다');
      return null;
    }

    const groupId = crypto.randomUUID();
    const { error } = await supabase.from('groups').insert({
      id: groupId,
      name: groupName.trim(),
      created_by: userId,
      gpx_path: course.gpx_path,
      gpx_bucket: 'course-gpx',
      thumbnail_path: course.thumbnail_path ?? null,
    });

    if (error) {
      runInAction(() => { this.submitting = false; });
      toast.error('그룹 생성에 실패했습니다');
      return null;
    }

    // 종료 체크포인트 자동 생성
    try {
      const { data: urlData } = await supabase.storage
        .from('course-gpx')
        .createSignedUrl(course.gpx_path, 60);
      if (urlData?.signedUrl) {
        const resp = await fetch(urlData.signedUrl);
        if (resp.ok) {
          const gpxText = await resp.text();
          const coords = parseGpxCoords(gpxText);
          if (coords && coords.length >= 2) {
            const lastCoord = coords[coords.length - 1];
            const totalDist = computeDistanceM(coords);
            await supabase.from('checkpoints').insert({
              group_id: groupId,
              name: '종료',
              lat: lastCoord.lat,
              lng: lastCoord.lon,
              radius_m: 30,
              sort_order: totalDist,
              is_finish: true,
            });
          }
        }
      }
    } catch {
      // 체크포인트 생성 실패해도 그룹 생성은 성공으로 처리
    }

    runInAction(() => { this.submitting = false; });
    return groupId;
  }

  public async submit(): Promise<void> {
    runInAction(() => {
      this.submitting = true;
      this.error = null;
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      runInAction(() => {
        this.error = '인증 오류가 발생했습니다';
        this.submitting = false;
      });
      toast.error(this.error!);
      return;
    }

    const userId = userData.user.id;
    const groupId = crypto.randomUUID();

    let gpxPath: string;
    let gpxBucket: string;
    let thumbnailPath: string | null = null;
    let distanceM: number | null = null;
    let elevationGainM: number | null = null;

    if (this.sourceMode === 'course') {
      const course = this.courses.find((c) => c.id === this.selectedCourseId);
      if (!course) {
        runInAction(() => {
          this.error = '코스를 선택해주세요';
          this.submitting = false;
        });
        toast.error(this.error!);
        return;
      }
      gpxPath = course.gpx_path;
      gpxBucket = 'course-gpx';
      // 코스의 썸네일을 그대로 사용
      thumbnailPath = course.thumbnail_path;
      distanceM = course.distance_m;
      elevationGainM = course.elevation_gain_m;
    } else {
      const path = `${userId}/${groupId}.gpx`;
      const { error: uploadError } = await supabase.storage
        .from('gpx-files')
        .upload(path, this.file!);
      if (uploadError) {
        runInAction(() => {
          this.error = uploadError.message;
          this.submitting = false;
        });
        toast.error(this.error!);
        return;
      }
      gpxPath = path;
      gpxBucket = 'gpx-files';

      // GPX 업로드 시 썸네일 생성
      try {
        const text = await this.file!.text();
        const coords = parseGpxCoords(text);
        if (coords && coords.length >= 2) {
          const blob = await generateThumbnail(coords);
          if (blob) {
            const thumbPath = `${userId}/${groupId}_thumb.png`;
            const { error: thumbError } = await supabase.storage
              .from('gpx-files')
              .upload(thumbPath, blob, { contentType: 'image/png' });
            if (!thumbError) {
              thumbnailPath = thumbPath;
            }
          }
        }
      } catch {
        // 썸네일 생성 실패해도 그룹 생성은 진행
      }
    }

    const { error: insertError } = await supabase
      .from('groups')
      .insert({
        id: groupId,
        name: this.name,
        created_by: userId,
        gpx_path: gpxPath,
        gpx_bucket: gpxBucket,
        thumbnail_path: thumbnailPath,
        distance_m: distanceM,
        elevation_gain_m: elevationGainM,
      });

    if (insertError) {
      runInAction(() => {
        this.error = insertError.message;
        this.submitting = false;
      });
      toast.error(this.error!);
      return;
    }

    // 종료 체크포인트 자동 생성
    try {
      let gpxText: string | null = null;
      if (this.sourceMode === 'file' && this.file) {
        gpxText = await this.file.text();
      } else if (this.sourceMode === 'course') {
        const course = this.courses.find((c) => c.id === this.selectedCourseId);
        if (course) {
          const { data: urlData } = await supabase.storage
            .from('course-gpx')
            .createSignedUrl(course.gpx_path, 60);
          if (urlData?.signedUrl) {
            const resp = await fetch(urlData.signedUrl);
            if (resp.ok) gpxText = await resp.text();
          }
        }
      }
      if (gpxText) {
        const coords = parseGpxCoords(gpxText);
        if (coords && coords.length >= 2) {
          const lastCoord = coords[coords.length - 1];
          const totalDist = computeDistanceM(coords);
          await supabase.from('checkpoints').insert({
            group_id: groupId,
            name: '종료',
            lat: lastCoord.lat,
            lng: lastCoord.lon,
            radius_m: 30,
            sort_order: totalDist,
            is_finish: true,
          });
        }
      }
    } catch {
      // 체크포인트 생성 실패해도 그룹 생성은 성공으로 처리
    }

    runInAction(() => { this.submitting = false; });
    this.navigate('/group');
  }
}

export { GroupCreateStore };
