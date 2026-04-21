import type { JsonValue } from "./common";

export interface ExperienceEntry {
  title?: string | null;
  employment_type?: string | null;
  company?: string | null;
  is_current?: boolean;
  start_month?: string | null;
  start_year?: number | null;
  end_month?: string | null;
  end_year?: number | null;
  start?: string | null;
  end?: string | null;
  location?: string | null;
  location_type?: string | null;
  description?: string | null;
}

export interface EducationEntry {
  school?: string | null;
  degree?: string | null;
  field?: string | null;
  field_of_study?: string | null;
  start_month?: string | null;
  start_year?: number | null;
  end_month?: string | null;
  end_year?: number | null;
  year?: number | string | null;
  grade?: string | null;
  activities?: string | null;
}

export interface MemberProfile {
  member_id: number;
  email?: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  headline: string | null;
  summary: string | null;
  experience: ExperienceEntry[] | null;
  education: EducationEntry[] | null;
  skills: string[] | null;
  profile_photo_url: string | null;
  resume_url?: string | null;
  connections_count?: number;
  profile_views?: number;
  is_deleted?: number;
  unstructured?: {
    member_id?: number;
    about?: string;
    freeform_experience?: JsonValue;
  };
}

export interface MemberSearchItem {
  member_id: number;
  first_name: string;
  last_name: string;
  headline: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  skills: string[] | null;
  connections_count: number;
}

export interface MemberSearchResponse {
  members: MemberSearchItem[];
  total: number;
  page: number;
  page_size: number;
}
