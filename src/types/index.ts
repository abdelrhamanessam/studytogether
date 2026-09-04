export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  xp: number;
  level: number;
  coins: number;
  total_study_seconds: number;
  current_streak: number;
  longest_streak: number;
  last_study_date: string | null;
  equipped_background: { type: string; value: string } | null;
  equipped_frame: { color: string; style: string } | null;
  equipped_title: { text: string; color: string } | null;
  equipped_badge: { icon: string; color: string } | null;
  equipped_name_effect: { effect: string } | null;
  daily_goal_seconds: number;
  daily_goal_state: { type: string; multiplier: number; expires_at: string; boosted_today?: boolean } | null;
  is_private: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  user_id: string;
  name: string;
  color: string;
  total_lessons: number;
  total_xp: number;
  duration_type: "quick" | "semester" | "year";
  mission_size: "small" | "medium" | "large";
  created_at: string;
}

export interface DailyMission {
  id: string;
  user_id: string;
  date: string;
  title: string;
  size: "small" | "medium" | "large";
  xp_reward: number;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface Lesson {
  id: string;
  subject_id: string;
  user_id: string;
  name: string;
  unit_name: string;
  position: number;
  status: "not_started" | "in_progress" | "completed" | "revised";
  revision_count: number;
  parts_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface LessonPart {
  id: string;
  lesson_id: string;
  user_id: string;
  name: string;
  position: number;
  is_done: boolean;
  created_at: string;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: "background" | "badge" | "xp_boost" | "title" | "name_effect";
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  price: number;
  data: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface UserInventory {
  id: string;
  user_id: string;
  item_id: string;
  equipped: boolean;
  acquired_at: string;
  shop_items?: ShopItem;
}

export interface DailyShopEntry {
  id: string;
  shop_date: string;
  item_id: string;
  discount: number;
  shop_items?: ShopItem;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  description: string | null;
  owner_id: string;
  subject_id: string | null;
  study_method: string;
  study_duration: number | null;
  break_duration: number | null;
  cycles: number | null;
  target_duration: number | null;
  is_public: boolean;
  max_participants: number;
  created_at: string;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  status: "idle" | "focusing" | "break" | "paused" | "finished";
  session_started_at: string | null;
  accumulated_seconds: number;
  last_active_date: string | null;
  joined_at: string;
  profiles?: Profile;
}

export interface StudySession {
  id: string;
  user_id: string;
  room_id: string | null;
  group_id: string | null;
  subject_id: string | null;
  planned_duration: number | null;
  actual_duration: number;
  started_at: string;
  ended_at: string | null;
  status: "active" | "paused" | "completed" | "abandoned";
  completed: boolean;
  study_method: string;
}

export interface XpTransaction {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  study_session_id: string | null;
  created_at: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "streak" | "study_time" | "sessions" | "level" | "xp";
  requirement_type: string;
  requirement_value: number;
  reward_type: "title" | "badge" | "background" | "coins" | "xp_boost";
  reward_data: Record<string, unknown>;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
  notified: boolean;
  achievements?: Achievement;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export type StudyMethod = "pomodoro" | "long_pomodoro" | "deep_focus" | "custom" | "stopwatch" | "target";

export interface Group {
  id: string;
  code: string;
  name: string;
  description: string | null;
  owner_id: string;
  max_members: number;
  created_at: string;
  member_count?: number;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  study_method: string;
  status: string;
  session_started_at: string | null;
  accumulated_seconds: number;
  last_active_date: string | null;
  target_duration: number | null;
  profiles?: Profile;
  today_seconds?: number;
}

export interface StudyMethodConfig {
  label: string;
  studyDuration: number | null;
  breakDuration: number | null;
  cycles: number | null;
}

export const STUDY_METHODS: Record<StudyMethod, StudyMethodConfig> = {
  pomodoro: { label: "Classic Pomodoro", studyDuration: 25 * 60, breakDuration: 5 * 60, cycles: 4 },
  long_pomodoro: { label: "Long Pomodoro", studyDuration: 50 * 60, breakDuration: 10 * 60, cycles: 3 },
  deep_focus: { label: "Deep Focus", studyDuration: 90 * 60, breakDuration: 15 * 60, cycles: 2 },
  custom: { label: "Custom", studyDuration: null, breakDuration: null, cycles: null },
  stopwatch: { label: "Stopwatch", studyDuration: null, breakDuration: null, cycles: null },
  target: { label: "Study Target", studyDuration: null, breakDuration: null, cycles: null },
};
