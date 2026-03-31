import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import type { Course } from '../types/course';

type Filter = 'all' | 'mine';

const PAGE_SIZE = 20;

class CourseStore {
  public courses: Course[] = [];
  public filter: Filter = 'all';
  public query: string = '';
  public loading: boolean = false;
  public error: string | null = null;
  public page: number = 0;

  public constructor() {
    makeAutoObservable(this);
  }

  public setFilter(f: Filter): void {
    this.filter = f;
    this.courses = [];
    this.page = 0;
  }

  public setQuery(q: string): void {
    this.query = q;
    this.courses = [];
    this.page = 0;
  }

  public async fetchPage(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.error = null;

    const from = this.page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let result: { data: Course[] | null; error: { message: string } | null };

    if (this.filter === 'mine') {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? '';
      let q = supabase
        .from('courses')
        .select('*')
        .eq('created_by', uid)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (this.query.trim()) q = q.or(`name.ilike.%${this.query.trim()}%,region.ilike.%${this.query.trim()}%`);
      result = await q;
    } else {
      let q = supabase
        .from('courses')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (this.query.trim()) q = q.or(`name.ilike.%${this.query.trim()}%,region.ilike.%${this.query.trim()}%`);
      result = await q;
    }

    runInAction(() => {
      if (result.error) {
        this.error = result.error.message;
      } else if (result.data) {
        this.courses = [...this.courses, ...result.data];
        this.page += 1;
      }
      this.loading = false;
    });
  }
}

export { CourseStore };
