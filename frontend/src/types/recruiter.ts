import type { EducationEntry, ExperienceEntry, LanguageEntry, ProfileStatusOption } from "./member";

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
  first_name?: string | null;
  last_name?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;
  headline?: string | null;
  summary?: string | null;
  birthday?: string | null;
  website?: string | null;
  profile_photo_url?: string | null;
  cover_photo_url?: string | null;
  open_to?: string | null;
  profile_status?: ProfileStatusOption | null;
  profile_language?: string | null;
  profile_slug?: string | null;
  experience?: ExperienceEntry[] | null;
  education?: EducationEntry[] | null;
  skills?: string[] | null;
  about?: string | null;
  languages?: LanguageEntry[] | null;
  followed_skills?: string[] | null;
  connections_count?: number | null;
  profile_views?: number | null;
  skill_mappings?: Record<string, string[]>;
}

export interface RecruiterSearchResponse {
  recruiters: RecruiterProfile[];
  total: number;
  page: number;
  page_size: number;
}
