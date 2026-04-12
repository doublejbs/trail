import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import type { Course, CourseComment } from '../types/course';

class CourseDetailStore {
  public course: Course | null = null;
  public loading: boolean = true;
  public notFound: boolean = false;
  public error: string | null = null;

  public likeCount: number = 0;
  public userHasLiked: boolean = false;
  public likeLoading: boolean = false;
  public secondaryLoading: boolean = true;

  public comments: CourseComment[] = [];
  public commentBody: string = '';
  public commentSubmitting: boolean = false;

  private courseId: string;
  private currentUserId: string | null = null;

  public constructor(courseId: string) {
    this.courseId = courseId;
    makeAutoObservable(this);
  }

  public setCommentBody(v: string): void { this.commentBody = v; }

  public async fetch(): Promise<void> {
    runInAction(() => { this.loading = true; });

    // auth + course 병렬 로드
    const [{ data: userData }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('courses').select('*').eq('id', this.courseId).single(),
    ]);

    if (error || !data) {
      runInAction(() => { this.notFound = true; this.loading = false; });
      return;
    }

    const uid = userData?.user?.id ?? null;

    // 코스 데이터 즉시 반영 → 페이지 렌더 + GPX 다운로드 즉시 시작
    runInAction(() => {
      this.course = data as Course;
      this.currentUserId = uid;
      this.loading = false;
    });

    // 좋아요 수 / 내 좋아요 / 댓글 병렬 로드 (백그라운드)
    try {
      const [
        { count: likeCount },
        myLikeResult,
        { data: comments },
      ] = await Promise.all([
        supabase.from('course_likes').select('*', { count: 'exact', head: true }).eq('course_id', this.courseId),
        uid
          ? supabase.from('course_likes').select('user_id').eq('course_id', this.courseId).eq('user_id', uid).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('course_comments').select('*').eq('course_id', this.courseId).order('created_at', { ascending: false }),
      ]);

      runInAction(() => {
        this.likeCount = likeCount ?? 0;
        this.userHasLiked = !!(myLikeResult as { data: unknown }).data;
        this.comments = (comments ?? []) as CourseComment[];
        this.secondaryLoading = false;
      });
    } catch {
      runInAction(() => {
        this.error = '데이터를 불러올 수 없습니다';
        this.secondaryLoading = false;
      });
    }
  }

  public async toggleLike(): Promise<void> {
    if (!this.currentUserId || this.likeLoading) return;
    this.likeLoading = true;

    if (this.userHasLiked) {
      const { error } = await supabase
        .from('course_likes')
        .delete()
        .eq('course_id', this.courseId)
        .eq('user_id', this.currentUserId);
      runInAction(() => {
        if (!error) {
          this.userHasLiked = false;
          this.likeCount = Math.max(0, this.likeCount - 1);
        }
        this.likeLoading = false;
      });
    } else {
      const { error } = await supabase
        .from('course_likes')
        .insert({ course_id: this.courseId, user_id: this.currentUserId });
      runInAction(() => {
        if (!error) {
          this.userHasLiked = true;
          this.likeCount += 1;
        }
        this.likeLoading = false;
      });
    }
  }

  public async submitComment(): Promise<void> {
    if (!this.commentBody.trim() || !this.currentUserId) return;
    this.commentSubmitting = true;

    const { data, error } = await supabase
      .from('course_comments')
      .insert({
        course_id: this.courseId,
        user_id: this.currentUserId,
        body: this.commentBody.trim(),
      })
      .select()
      .single();

    runInAction(() => {
      if (!error && data) {
        this.comments = [data as CourseComment, ...this.comments];
        this.commentBody = '';
      }
      this.commentSubmitting = false;
    });
  }
}

export { CourseDetailStore };
