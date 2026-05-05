import type { JsonValue } from "./common";

export type OpenToOption = "job" | "hiring" | "services" | "volunteer";
export type ProfileStatusOption = "none" | "open_to_work" | "hiring";

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
  skill_ids?: string[] | null;
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
  skill_ids?: string[] | null;
}

export interface LanguageEntry {
  name: string;
  proficiency: string;
}

export interface MemberProfile {
  member_id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email?: string | null;
  birthday?: string | null;
  website?: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  headline: string | null;
  summary: string | null;
  experience: ExperienceEntry[] | null;
  education: EducationEntry[] | null;
  skills: string[] | null;
  profile_photo_url: string | null;
  profile_photo_file_id?: string | null;
  cover_photo_url?: string | null;
  cover_photo_file_id?: string | null;
  resume_url?: string | null;
  resume_file_id?: string | null;
  resume_file_name?: string | null;
  resume_content_type?: string | null;
  resume_uploaded_at?: string | null;
  /** Extracted plain text of the resume (primary input for AI Resume Parser skill). Falls back to summary when absent. */
  resume_text?: string | null;
  open_to?: OpenToOption | null;
  profile_status?: ProfileStatusOption | null;
  profile_language?: string | null;
  profile_slug?: string | null;
  connections_count?: number;
  profile_views?: number;
  is_deleted?: number;
  skill_mappings?: Record<string, string[]>;
  unstructured?: {
    member_id?: number;
    about?: string;
    freeform_experience?: JsonValue;
    languages?: LanguageEntry[];
    /** Display / job-recommendation follow for top skills (by exact skill name). */
    followed_skills?: string[];
  };
}

/**
 * Flat fields accepted by `/members/update` and `updateUnifiedProfile` in addition to
 * {@link MemberProfile} (some also live under {@link MemberProfile.unstructured} when read).
 */
export type MemberProfileUpdateInput = Partial<MemberProfile> & {
  member_id: number;
  about?: string | null;
  languages?: LanguageEntry[] | null;
  followed_skills?: string[] | null;
  freeform_experience?: unknown;
};

export interface MemberSearchItem {
  member_id: number;
  first_name: string;
  last_name: string;
  headline: string | null;
  profile_photo_url?: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  skills: string[] | null;
  connections_count: number;
  connection_degree?: "1st" | "2nd" | "3rd+" | null;
  is_verified?: boolean | null;
}

export interface MemberSearchResponse {
  members: MemberSearchItem[];
  total: number;
  page: number;
  page_size: number;
}
