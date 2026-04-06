import { makeAutoObservable, runInAction } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { GroupCreateStore } from '../GroupCreateStore';
import type { Course } from '../../types/course';

class CourseDetailUIStore {
  public gpxText: string | null | undefined = undefined;
  public showCreateSheet = false;
  public sheetVisible = false;
  public groupName = '';
  public groupCreateStore: GroupCreateStore;

  private navigate: NavigateFunction;

  public constructor(navigate: NavigateFunction) {
    this.navigate = navigate;
    this.groupCreateStore = new GroupCreateStore(navigate);
    makeAutoObservable(this);
  }

  public get canSubmit(): boolean {
    return this.groupName.trim().length > 0 && !this.groupCreateStore.submitting;
  }

  public setGroupName(v: string): void {
    this.groupName = v;
  }

  public openSheet(): void {
    this.showCreateSheet = true;
  }

  public setSheetVisible(v: boolean): void {
    this.sheetVisible = v;
  }

  public closeSheet(): void {
    this.sheetVisible = false;
  }

  public hideSheet(): void {
    this.showCreateSheet = false;
    this.groupName = '';
  }

  public async createGroup(course: Course): Promise<void> {
    if (!this.canSubmit) return;
    const groupId = await this.groupCreateStore.createFromCourse(course, this.groupName);
    if (groupId) {
      this.navigate(`/group/${groupId}`);
    }
  }

  public async loadGpxText(gpxPath: string): Promise<void> {
    try {
      const { data, error } = await supabase.storage
        .from('course-gpx')
        .createSignedUrl(gpxPath, 3600);

      if (error || !data?.signedUrl) {
        runInAction(() => { this.gpxText = null; });
        return;
      }

      const res = await fetch(data.signedUrl);
      if (!res.ok) {
        runInAction(() => { this.gpxText = null; });
        return;
      }
      const text = await res.text();
      runInAction(() => { this.gpxText = text; });
    } catch {
      runInAction(() => { this.gpxText = null; });
    }
  }
}

export { CourseDetailUIStore };
