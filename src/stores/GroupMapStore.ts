import { makeAutoObservable, runInAction } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';

class GroupMapStore {
  private navigate: NavigateFunction;
  public group: Group | null | undefined = undefined;
  public gpxText: string | null | undefined = undefined;
  public currentUserId: string | null = null;

  public constructor(navigate: NavigateFunction) {
    this.navigate = navigate;
    makeAutoObservable(this);
  }

  public load(groupId: string): () => void {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (cancelled) return;

      if (error || !data) {
        runInAction(() => { this.group = null; });
        this.navigate('/group', { replace: true });
        return;
      }

      const [{ data: userData }, { data: urlData, error: urlError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.storage.from((data as Group).gpx_bucket ?? 'gpx-files').createSignedUrl((data as Group).gpx_path, 3600),
      ]);

      if (cancelled) return;

      runInAction(() => {
        this.group = data as Group;
        this.currentUserId = userData?.user?.id ?? null;
      });

      if (urlError || !urlData?.signedUrl) {
        runInAction(() => { this.gpxText = null; });
        return;
      }

      try {
        const response = await fetch(urlData.signedUrl);
        if (!response.ok) throw new Error('GPX fetch failed');
        const text = await response.text();
        if (!cancelled) runInAction(() => { this.gpxText = text; });
      } catch {
        if (!cancelled) runInAction(() => { this.gpxText = null; });
      }
    })();

    return () => { cancelled = true; };
  }
}

export { GroupMapStore };
