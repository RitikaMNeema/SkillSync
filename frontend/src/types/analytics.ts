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

export interface MemberDashboard {
  profile_views_30d: number;
  search_appearances_30d: number;
  application_status_breakdown: Array<{
    status: ApplicationStatus;
    count: number;
  }>;
}

export interface RecruiterDashboardMetric {
  event_type: string;
  count: number;
}
