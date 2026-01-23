export type Hole = {
  id: number;
  number: number;
  par: number;
  distance: number | null;
  hcp: number | null;
};

export type TeeSummary = {
  id: number;
  tee_name: string;
};

export type Course = {
  id: number;
  name: string;
  owner_id: string;
  holes: Hole[];
  tees?: TeeSummary[];
};

export type RoundHole = {
  number: number;
  par: number;
  distance: number | null;
  hcp: number | null;
  strokes: Record<string, number | null>;
  putts?: Record<string, number | null> | null;
  fairway?: Record<string, string | null> | null;
  gir?: Record<string, string | null> | null;
  handicap_strokes?: Record<string, number> | null;
};

export type Player = {
  id: number;
  external_id: string;
  email: string | null;
  username: string | null;
  name: string | null;
  handicap: number | null;
  gender?: "men" | "women" | null;
  rounds_count?: number;
  avg_strokes?: number | null;
};

export type PlayerStats = {
  rounds_count: number;
  avg_strokes: number | null;
};

export type Round = {
  id: number;
  course_id: number;
  course_name: string;
  tee_id?: number | null;
  tee?: TeeSummary | null;
  course_handicap_by_player?: Record<string, number>;
  tournament_id: number | null;
  tournament_completed_at?: string | null;
  tournament_paused_at?: string | null;
  tournament_pause_message?: string | null;
  owner_id: string;
  player_ids: string[];
  players?: Player[];
  started_at: string;
  completed_at: string | null;
  stats_enabled?: boolean;
  holes: RoundHole[];
  total_par: number;
  total_strokes: number | null;
  total_strokes_by_player: Record<string, number | null>;
};

export type RoundSummary = {
  id: number;
  course_id: number;
  course_name: string;
  tournament_id: number | null;
  started_at: string;
  completed_at: string | null;
  total_par: number;
  total_strokes: number | null;
  players_count: number;
};

export type TournamentSummary = {
  id: number;
  name: string;
  is_public: boolean;
  course_id: number;
  course_name: string;
  owner_id: string;
  owner_name?: string | null;
  created_at: string;
  completed_at?: string | null;
  groups_count: number;
};

export type TournamentGroup = {
  id: number;
  name: string;
  round_id: number | null;
  owner_id: string;
  owner_name?: string | null;
  players_count: number;
  started_at?: string | null;
  completed_at?: string | null;
};

export type TournamentLeaderboardEntry = {
  player_id: string;
  player_name: string;
  group_round_id: number;
  holes_completed: number;
  current_hole: number | null;
  strokes: number;
  par: number;
  score_to_par: number;
};

export type Tournament = {
  id: number;
  name: string;
  is_public: boolean;
  course_id: number;
  course_name: string;
  owner_id: string;
  owner_name?: string | null;
  created_at: string;
  completed_at?: string | null;
  paused_at?: string | null;
  pause_message?: string | null;
  my_group_round_id?: number | null;
  active_groups_count?: number;
  groups: TournamentGroup[];
  leaderboard: TournamentLeaderboardEntry[];
};

export type TournamentInvite = {
  id: number;
  tournament_id: number;
  tournament_name: string;
  requester_id: string;
  requester_name: string;
  created_at: string;
};
