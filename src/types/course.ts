export interface Course {
  id: string;
  created_by: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  gpx_path: string;
  thumbnail_path: string | null;
  distance_m: number | null;
  elevation_gain_m: number | null;
  region: string | null;
  start_lat: number | null;
  start_lng: number | null;
  is_public: boolean;
  created_at: string;
  like_count?: number;
}

export interface CourseLike {
  course_id: string;
  user_id: string;
}

export interface CourseComment {
  id: string;
  course_id: string;
  user_id: string;
  body: string;
  created_at: string;
}
