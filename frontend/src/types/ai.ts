export type AIProgressStep = {
  key: string;
  label: string;
  description?: string;
  status: "pending" | "active" | "done" | "failed";
};

export type AICandidateState = "pending" | "approved" | "edited" | "rejected";

export type AICandidate = {
  id: string;
  name: string;
  headline?: string;
  location?: string;
  skills: string[];
  topSkills: string[];
  missingSkills: string[];
  score: number;
  reasoning?: string;
  recommendation?: string;
  outreachDraft: string;
  fitBand?: "high_fit" | "medium_fit" | "low_fit";
  state: AICandidateState;
};