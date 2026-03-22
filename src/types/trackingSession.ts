export interface TrackingSession {
  id: string;
  user_id: string;
  group_id: string;
  elapsed_seconds: number;
  distance_meters: number;
  points: { lat: number; lng: number; ts: number }[];
  created_at: string;
}
