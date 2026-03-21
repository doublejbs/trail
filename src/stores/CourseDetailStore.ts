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
    this.loading = true;

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id ?? null;
    runInAction(() => { this.currentUserId = uid; });

    // Fetch course
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .eq('id', this.courseId)
      .single();

    if (error || !data) {
      runInAction(() => {
        this.notFound = true;
        this.loading = false;
      });
      return;
    }

    // Fetch like count
    const { count: likeCount } = await supabase
      .from('course_likes')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', this.courseId);

    // Fetch user's own like
    let userHasLiked = false;
    if (uid) {
      const { data: myLike } = await supabase
        .from('course_likes')
        .select('user_id')
        .eq('course_id', this.courseId)
        .eq('user_id', uid)
        .single();
      userHasLiked = !!myLike;
    }

    // Fetch comments
    const { data: comments } = await supabase
      .from('course_comments')
      .select('*')
      .eq('course_id', this.courseId)
      .order('created_at', { ascending: false });

    runInAction(() => {
      this.course = data as Course;
      this.likeCount = likeCount ?? 0;
      this.userHasLiked = userHasLiked;
      this.comments = (comments ?? []) as CourseComment[];
      this.loading = false;
    });
  }

  public async toggleLike(): Promise<void> {
    if (!this.currentUserId || this.likeLoading) return;
    this.likeLoading = true;

    if (this.userHasLiked) {
      await supabase
        .from('course_likes')
        .delete()
        .eq('course_id', this.courseId)
        .eq('user_id', this.currentUserId);
      runInAction(() => {
        this.userHasLiked = false;
        this.likeCount = Math.max(0, this.likeCount - 1);
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
