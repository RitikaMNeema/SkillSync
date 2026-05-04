export type ApplicationStatus =
  | "submitted"
  | "reviewing"
  | "interview"
  | "offer"
  | "hired"
  | "rejected"
  | "withdrawn";

export interface ApplicationNote {
  id: number;
  application_id: number;
  recruiter_id: number;
  note_text: string;
  created_at: string;
}

export interface Application {
  application_id: number;
  job_id: number;
  member_id: number;
  resume_url: string | null;
  cover_letter: string | null;
  application_datetime: string;
  status: ApplicationStatus;
  answers?: Record<string, string> | null;
  job_title?: string;
  job_status?: string;
  job_recruiter_id?: number;
  company_name?: string;
  notes?: ApplicationNote[];
}

export interface ApplicationListResponse {
  applications: Application[];
  total: number;
  page: number;
  page_size: number;
}
