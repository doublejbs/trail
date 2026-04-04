export interface Checkpoint {
  id: string;
  group_id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  sort_order: number;
  is_finish: boolean;
  created_at: string;
}

export interface CheckpointVisit {
  id: string;
  user_id: string;
  checkpoint_id: string;
  tracking_session_id: string;
  visited_at: string;
}
