import { makeAutoObservable, runInAction } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
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
    }

    const { error: insertError } = await supabase
      .from('groups')
      .insert({ id: groupId, name: this.name, created_by: userId, gpx_path: gpxPath, gpx_bucket: gpxBucket });

    if (insertError) {
      runInAction(() => {
        this.error = insertError.message;
        this.submitting = false;
      });
      toast.error(this.error!);
      return;
    }

    runInAction(() => { this.submitting = false; });
    this.navigate('/group');
  }
}

export { GroupCreateStore };
