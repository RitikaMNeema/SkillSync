export interface RecruiterProfile {
  recruiter_id: number;
  company_id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string | null;
  access_level: string | null;
  company_name: string;
  industry: string | null;
  size: string | null;
  /** HQ / office location from `companies.location` */
  company_location?: string | null;
}

export interface RecruiterSearchResponse {
  recruiters: RecruiterProfile[];
  total: number;
  page: number;
  page_size: number;
}
