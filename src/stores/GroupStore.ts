import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';

class GroupStore {
  public groups: Group[] = [];
  public loading: boolean = true;
  public error: boolean = false;

  public constructor() {
    makeAutoObservable(this);
  }

  public async load(): Promise<void> {
    this.loading = true;
    this.error = false;

    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false });

    runInAction(() => {
      if (error) {
        this.error = true;
      } else {
        this.groups = data ?? [];
      }
      this.loading = false;
    });
  }
}

export { GroupStore };
