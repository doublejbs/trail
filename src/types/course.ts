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
  is_public: boolean;
  created_at: string;
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
