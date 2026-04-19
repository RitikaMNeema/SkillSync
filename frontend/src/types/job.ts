export type WorkMode = "remote" | "hybrid" | "onsite";
export type JobStatus = "open" | "closed";

export interface Job {
  job_id: number;
  company_id?: number;
  recruiter_id?: number;
  title: string;
  description?: string | null;
  seniority_level?: string | null;
  employment_type?: string | null;
  location?: string | null;
  work_mode: WorkMode;
  skills_required?: string[] | null;
  salary_min?: number | null;
  salary_max?: number | null;
  posted_datetime?: string;
  status?: JobStatus;
  views_count?: number;
  applicants_count?: number;
  company_name?: string;
  industry?: string | null;
  saved_at?: string;
}

export interface JobListResponse {
  jobs: Job[];
  total: number;
  page: number;
  page_size: number;
}
