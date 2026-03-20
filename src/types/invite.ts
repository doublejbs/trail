export interface GroupInvite {
  id: string;
  group_id: string;
  token: string;
  is_active: boolean;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  joined_at: string;
}
