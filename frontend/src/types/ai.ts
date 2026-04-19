export interface AICandidate {
  id: string;
  name: string;
  headline: string;
  score: number;
  topSkills: string[];
  missingSkills: string[];
  reasoning: string;
  outreachDraft: string;
  state: "pending" | "approved" | "edited" | "rejected";
}

export interface AIProgressStep {
  key: string;
  label: string;
  description: string;
  status: "pending" | "active" | "done";
}
