export type Hole = { id: number; number: number; par: number };

export type Course = {
  id: number;
  name: string;
  holes: Hole[];
};

export type RoundHole = {
  number: number;
  par: number;
  strokes: Record<string, number | null>;
};

export type Player = {
  id: number;
  external_id: string;
  email: string | null;
  username: string | null;
  name: string | null;
  handicap: number | null;
};

export type Round = {
  id: number;
  course_id: number;
  course_name: string;
  owner_id: string;
  player_ids: string[];
  players?: Player[];
  started_at: string;
  completed_at: string | null;
  holes: RoundHole[];
  total_par: number;
  total_strokes: number | null;
  total_strokes_by_player: Record<string, number | null>;
};

export type RoundSummary = {
  id: number;
  course_id: number;
  course_name: string;
  started_at: string;
  completed_at: string | null;
  total_par: number;
  total_strokes: number | null;
  players_count: number;
};
