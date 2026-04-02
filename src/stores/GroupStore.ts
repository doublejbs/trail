import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';

type Tab = 'owned' | 'joined';

class GroupStore {
  public groups: Group[] = [];
  public loading: boolean = true;
  public error: boolean = false;
  public currentUserId: string | null = null;
  public activeTab: Tab = 'joined';

  public constructor() {
    makeAutoObservable(this);
  }

  public setActiveTab(tab: Tab): void {
    this.activeTab = tab;
  }

  public async load(): Promise<void> {
    this.loading = true;
    this.error = false;

    const [{ data: userData }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);

    runInAction(() => {
      if (error) {
        this.error = true;
      } else {
        this.groups = data ?? [];
        this.currentUserId = userData?.user?.id ?? null;
      }
      this.loading = false;
    });
  }
}

export { GroupStore };
