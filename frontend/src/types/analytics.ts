import type { ApplicationStatus } from "./application";

export interface TopJobMetric {
  job_id: string;
  applications: number;
}

export interface ClickMetric {
  job_id: string;
  clicks: number;
}

export interface SavedJobMetric {
  period: string;
  count: number;
}

export interface FunnelMetric {
  viewed: number;
  saved: number;
  submitted: number;
}

export interface GeoMetric {
  city: string | null;
  state: string | null;
  count: number;
}

export interface ProfileViewerEntry {
  viewer_user_id: string | number;
  last_viewed_at: string;
}

export interface MemberDashboard {
  profile_views_30d: number;
  profile_views_daily_30d?: Array<{
    date: string;
    count: number;
  }>;
  search_appearances_30d: number;
  application_status_breakdown: Array<{
    status: ApplicationStatus;
    count: number;
  }>;
  /** Distinct viewers (last 30d), most recent first — excludes self-views; capped at 5. */
  profile_viewers_recent?: ProfileViewerEntry[];
}

export interface RecruiterDashboardMetric {
  event_type: string;
  count: number;
}

export interface RecruiterProfileDashboard {
  profile_views_30d: number;
  profile_views_daily_30d?: Array<{ date: string; count: number }>;
  search_appearances_30d: number;
  job_views_30d: number;
  job_saves_30d: number;
  applicants_30d: number;
  messages_sent_30d: number;
  application_status_breakdown: Array<{ status: string; count: number }>;
  /** Distinct viewers (last 30d), most recent first — capped at 5. */
  profile_viewers_recent?: ProfileViewerEntry[];
}
