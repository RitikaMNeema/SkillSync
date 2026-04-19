export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  page: number;
  page_size: number;
  total: number;
  items?: T[];
}

export type UserRole = "member" | "recruiter";

export interface AuthUser {
  user_id: number;
  role: UserRole;
}

export interface JsonRecord {
  [key: string]: string | number | boolean | null | JsonRecord | JsonValue[];
}

export type JsonValue = string | number | boolean | null | JsonRecord | JsonValue[];
