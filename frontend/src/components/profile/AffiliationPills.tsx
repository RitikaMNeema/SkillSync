import { Briefcase, GraduationCap } from "lucide-react";
import { useState } from "react";
import type { EducationEntry, ExperienceEntry } from "../../types/member";
import { clearbitLogoUrl } from "../../utils/clearbit";

function LogoThumb({ name, fallback }: { name: string; fallback: "company" | "school" }) {
  const [failed, setFailed] = useState(false);
  const url = clearbitLogoUrl(name);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-8 w-8 rounded object-contain bg-white"
      />
    );
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded bg-[#eef3f8] text-[#0a66c2]">
      {fallback === "company" ? <Briefcase className="h-4 w-4" /> : <GraduationCap className="h-4 w-4" />}
    </div>
  );
}

export interface AffiliationPillsProps {
  experience?: ExperienceEntry[] | null;
  education?: EducationEntry[] | null;
}

export function AffiliationPills({ experience, education }: AffiliationPillsProps) {
  const latestJob = (experience ?? []).find((e) => e && e.company);
  const latestSchool = (education ?? []).find((e) => e && e.school);

  if (!latestJob && !latestSchool) return null;

  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm">
      {latestJob?.company ? (
        <div className="flex items-center gap-2">
          <LogoThumb name={latestJob.company} fallback="company" />
          <span className="font-semibold text-[#000000E6] truncate">{latestJob.company}</span>
        </div>
      ) : null}
      {latestSchool?.school ? (
        <div className="flex items-center gap-2">
          <LogoThumb name={latestSchool.school} fallback="school" />
          <span className="font-semibold text-[#000000E6] truncate">{latestSchool.school}</span>
        </div>
      ) : null}
    </div>
  );
}
