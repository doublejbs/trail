// src/stores/CourseUploadStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { parseGpxCoords, computeDistanceM, computeElevationGainM } from '../lib/gpx';
import { generateThumbnail } from '../lib/thumbnail';
import type { GpxCoord } from '../lib/gpx';

class CourseUploadStore {
  public name: string = '';
  public description: string = '';
  public tags: string[] = [];
  public isPublic: boolean = true;
  public file: File | null = null;
  public gpxError: string | null = null;
  public submitting: boolean = false;
  public error: string | null = null;

  private coords: GpxCoord[] | null = null;

  public constructor() {
    makeAutoObservable(this);
  }

  public setName(v: string): void { this.name = v; }
  public setDescription(v: string): void { this.description = v; }
  public setIsPublic(v: boolean): void { this.isPublic = v; }

  public addTag(tag: string): void {
    if (!this.tags.includes(tag)) this.tags.push(tag);
  }

  public removeTag(tag: string): void {
    this.tags = this.tags.filter((t) => t !== tag);
  }

  public async setFile(f: File | null): Promise<void> {
    this.file = f;
    this.gpxError = null;
    this.coords = null;
    if (!f) return;

    const text = await f.text();
    const parsed = parseGpxCoords(text);
    runInAction(() => {
      if (!parsed) {
        this.gpxError = '유효하지 않은 GPX 파일입니다';
      } else {
        this.coords = parsed;
      }
    });
  }

  public get isValid(): boolean {
    return this.name.trim() !== '' && this.file !== null && this.gpxError === null;
  }

  public getCoords(): GpxCoord[] | null {
    return this.coords;
  }

  public async submit(): Promise<string | null> {
    this.submitting = true;
    this.error = null;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      runInAction(() => {
        this.error = '인증 오류가 발생했습니다';
        this.submitting = false;
      });
      return null;
    }

    const userId = userData.user.id;
    const courseId = crypto.randomUUID();
    const gpxPath = `${userId}/${courseId}.gpx`;

    let distanceM: number | null = null;
    let elevationGainM: number | null = null;
    if (this.coords) {
      distanceM = computeDistanceM(this.coords);
      elevationGainM = computeElevationGainM(this.coords);
    }

    const { error: uploadError } = await supabase.storage
      .from('course-gpx')
      .upload(gpxPath, this.file!);

    if (uploadError) {
      runInAction(() => {
        this.error = uploadError.message;
        this.submitting = false;
      });
      return null;
    }

    let thumbnailPath: string | null = null;
    if (this.coords && this.coords.length >= 2) {
      const blob = await generateThumbnail(this.coords);
      if (blob) {
        const thumbPath = `${userId}/${courseId}_thumb.png`;
        const { error: thumbError } = await supabase.storage
          .from('course-gpx')
          .upload(thumbPath, blob, { contentType: 'image/png' });
        if (!thumbError) {
          thumbnailPath = thumbPath;
        }
      }
    }

    const { error: insertError } = await supabase
      .from('courses')
      .insert({
        id: courseId,
        created_by: userId,
        name: this.name.trim(),
        description: this.description.trim() || null,
        tags: this.tags.length > 0 ? this.tags : null,
        gpx_path: gpxPath,
        thumbnail_path: thumbnailPath,
        distance_m: distanceM,
        elevation_gain_m: elevationGainM,
        is_public: this.isPublic,
      });

    if (insertError) {
      runInAction(() => {
        this.error = insertError.message;
        this.submitting = false;
      });
      return null;
    }

    runInAction(() => { this.submitting = false; });
    return courseId;
  }
}

export { CourseUploadStore };
