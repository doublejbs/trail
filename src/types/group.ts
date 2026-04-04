export interface Group {
  id: string;
  name: string;
  created_by: string;
  gpx_path: string;
  gpx_bucket: string;
  thumbnail_path: string | null;
  created_at: string;
  max_members: number | null;
  period_started_at: string | null;
  period_ended_at: string | null;
  distance_m: number | null;
  elevation_gain_m: number | null;
  difficulty: string | null;
  member_count?: number;
  members?: GroupMemberPreview[];
}

export interface GroupMemberPreview {
  user_id: string;
  avatar_url: string | null;
}

