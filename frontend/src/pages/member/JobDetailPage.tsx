import { ArrowLeft, Bookmark, CalendarDays, ExternalLink, Eye, ShieldCheck, Users, WalletCards } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link, useParams } from "react-router-dom";
import { getAllApplicationsByMember } from "../../api/applications";
import { getJob, getSavedJobs, saveJob, searchJobs, unsaveJob, trackJobView } from "../../api/jobs";
import { ApplyModal } from "../../components/jobs/ApplyModal";
import { AppShellBreakout } from "../../components/layout/AppShellRegions";
import { RightSidebar } from "../../components/layout/Sidebar";
import { APP_SHELL_MAIN_COLUMN_CLASS, appShellInnerGridClass } from "../../constants/appShellLayout";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { Job } from "../../types/job";
import { formatSalary } from "../../utils/formatSalary";

function daysAgoLabel(postedDatetime?: string): string {
  if (!postedDatetime) return "Recently posted";
  const posted = new Date(postedDatetime).getTime();
  if (!Number.isFinite(posted)) return "Recently posted";
  const diffDays = Math.max(0, Math.floor((Date.now() - posted) / 86400000));
  if (diffDays === 0) return "Posted today";
  if (diffDays === 1) return "Posted 1 day ago";
  return `Posted ${diffDays} days ago`;
}

function descriptionLines(job: Job): string[] {
  return (job.description ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function toBullets(lines: string[], fallback: string[]): string[] {
  const cleaned = lines
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  if (!cleaned.length) return fallback;
  return cleaned;
}

/** Wizard stores benefits/visibility in the description; strip duplicate lines from section bullets when we render Benefits separately. */
function filterDuplicateMetaBullets(items: string[]): string[] {
  return items.filter((item) => {
    const t = item.trim();
    if (/^\s*Benefits\s*:/i.test(t)) return false;
    if (/^\s*Visible to job seekers\s*:/i.test(t)) return false;
    return true;
  });
}

function parseLabeledJobDescription(description: string | null | undefined): {
  about: string;
  responsibilities: string[];
  qualifications: string[];
  benefits: string[];
} {
  const text = (description ?? "").trim();
  if (!text) {
    return {
      about: "",
      responsibilities: [],
      qualifications: [],
      benefits: []
    };
  }

  const sections = [
    "About the job",
    "Responsibilities",
    "Qualifications",
    "Additional compensation",
    "Benefits",
    "Visible to job seekers"
  ];

  const markers = sections
    .map((label) => {
      const match = new RegExp(`(^|\\n)${label}\\s*\\n`, "i").exec(text);
      return match ? { label, index: match.index + (match[1] ? 1 : 0), length: match[0].trimStart().length } : null;
    })
    .filter((item): item is { label: string; index: number; length: number } => Boolean(item))
    .sort((a, b) => a.index - b.index);

  if (!markers.length) {
    return {
      about: text,
      responsibilities: [],
      qualifications: [],
      benefits: []
    };
  }

  const contentByLabel: Record<string, string> = {};
  markers.forEach((marker, idx) => {
    const start = marker.index + marker.length;
    const end = idx + 1 < markers.length ? markers[idx + 1].index : text.length;
    contentByLabel[marker.label] = text.slice(start, end).trim();
  });

  const about = (contentByLabel["About the job"] ?? "").trim();
  const responsibilities = filterDuplicateMetaBullets(toBullets((contentByLabel["Responsibilities"] ?? "").split("\n"), []));
  const qualifications = filterDuplicateMetaBullets(toBullets((contentByLabel["Qualifications"] ?? "").split("\n"), []));
  const benefitsSection = (contentByLabel["Benefits"] ?? "").trim();
  let benefits = benefitsSection ? splitBenefitsTokens(benefitsSection) : [];

  /** Recruiter job wizard stores `Benefits: a, b` on one line; section-header parser expects `Benefits\n`. */
  if (!benefits.length) {
    const inline = /\bBenefits\s*:\s*([^\n]+)/i.exec(text);
    if (inline?.[1]) benefits = splitBenefitsTokens(inline[1]);
  }

  if (!benefits.length) {
    const blockMatch =
      /\bBenefits\b\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:Additional compensation:|Visible to job seekers:|Responsibilities\b|Qualifications\b)\b|$)/i.exec(text);
    if (blockMatch?.[1]?.trim()) {
      benefits = toBullets(blockMatch[1].split("\n"), []);
    }
  }

  return { about, responsibilities, qualifications, benefits };
}

function splitBenefitsTokens(segment: string): string[] {
  const raw = segment.trim();
  if (!raw) return [];
  if (/[|,]/.test(raw)) return raw.split(/[,|]/).map((item) => item.trim()).filter(Boolean);
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  return lines.length ? lines : [raw];
}

function stripTrailingSalaryLine(about: string, salaryMin?: number | null, salaryMax?: number | null): string {
  const slug = (salaryMin || salaryMax) && formatSalary(salaryMin, salaryMax);
  if (!slug || slug === "Salary not listed") return about.trimEnd();
  const t = about.trimEnd();
  if (t === slug) return "";
  const lines = t.split(/\n/).map((l) => l.trimEnd());
  while (lines.length > 0) {
    const last = lines.at(-1)?.trim() ?? "";
    if (!last) {
      lines.pop();
      continue;
    }
    if (last.replace(/\s+/g, " ") === slug.replace(/\s+/g, " ")) {
      lines.pop();
      return lines.join("\n").trimEnd();
    }
    break;
  }
  return t;
}

function logoText(name?: string | null): string {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : "—";
}

function SidebarCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="rounded-[10px] border border-[#e0dfdc] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <h3 className="text-[1.23rem] font-semibold text-[#1d2226]">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </Card>
  );
}

function JobSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[#ebedf0] pt-6 first:border-t-0 first:pt-0">
      <h2 className="text-[1.42rem] font-semibold text-[#1d2226]">{title}</h2>
      <div className="mt-3 text-[0.98rem] leading-7 text-[#38434f]">{children}</div>
    </section>
  );
}

function JobHeader({
  job,
  applied,
  saved,
  savePending,
  onApply,
  onSave
}: {
  job: Job;
  applied: boolean;
  saved: boolean;
  savePending: boolean;
  onApply: () => void;
  onSave: () => void;
}) {
  return (
    <Card className="rounded-[12px] border border-[#e0dfdc] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
      {job.status === "closed" ? (
        <div className="mb-5 rounded-[8px] bg-[#fef3c7] px-4 py-3 text-sm text-[#92400e]">This job is no longer accepting applications</div>
      ) : null}
      <div className="flex items-start gap-4">
        <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[10px] bg-[#eef3f8] text-xl font-semibold text-[#0a66c2]">
          {logoText(job.company_name)}
        </div>
        <div className="min-w-0">
          <h1 className="text-[2.05rem] font-semibold leading-tight tracking-[-0.02em] text-[#1d2226]">{job.title}</h1>
          <Link to={`/search?q=${encodeURIComponent(job.company_name ?? "")}`} className="mt-1 inline-block text-[1.02rem] font-semibold text-[#0a66c2] hover:underline">
            {job.company_name ?? "Unknown company"}
          </Link>
          <p className="mt-1 text-[0.95rem] text-[#59636e]">
            {job.location || "Location not listed"} ({job.work_mode}) · {daysAgoLabel(job.posted_datetime)} · {job.applicants_count ?? 0} applicants
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {job.employment_type ? (
              <Badge className="rounded-full bg-[#eef3f8] px-3 py-1 text-[#1d2226]">{job.employment_type}</Badge>
            ) : null}
            {(job.salary_min || job.salary_max) ? (
              <Badge className="rounded-full bg-[#e8f3ec] px-3 py-1 text-[#137333]">{formatSalary(job.salary_min, job.salary_max)}</Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#ebedf0] pt-5">
        <Button className="rounded-full bg-[#0a66c2] px-7 hover:bg-[#004182]" disabled={job.status === "closed" || applied} onClick={onApply}>
          {applied ? "Applied" : "Apply"}
          <ExternalLink className="h-4 w-4" />
        </Button>
        <Button variant="secondary" className="rounded-full border-[#0a66c2] px-6 text-[#0a66c2] hover:bg-[#eef3f8]" disabled={savePending} onClick={onSave}>
          <Bookmark className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
          {saved ? "Saved" : "Save"}
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[#ebedf0] pt-4">
        <div className="flex items-center gap-2 text-[#59636e]">
          <Eye className="h-4 w-4" />
          <span className="text-sm">
            <span className="font-semibold text-[#1d2226]">{job.views_count ?? 0}</span> Views
          </span>
        </div>
        <div className="flex items-center gap-2 text-[#59636e]">
          <Users className="h-4 w-4" />
          <span className="text-sm">
            <span className="font-semibold text-[#1d2226]">{job.applicants_count ?? 0}</span> Applicants
          </span>
        </div>
      </div>
    </Card>
  );
}

export function JobDetailPage() {
  const { job_id } = useParams();
  const userId = authStore((state) => state.userId);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [similarJobs, setSimilarJobs] = useState<Job[]>([]);

  useEffect(() => {
    if (!job_id) {
      setJob(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void getJob(Number(job_id))
      .then((data) => {
        setJob(data);
        void trackJobView(data.job_id, userId ?? undefined).catch(() => undefined);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load job");
        setJob(null);
      })
      .finally(() => setLoading(false));
  }, [job_id, userId]);

  useEffect(() => {
    if (!userId || !job_id) return;
    void getSavedJobs(userId)
      .then((data) => {
        setSaved(data.jobs.some((j: Job) => j.job_id === Number(job_id)));
      })
      .catch(() => undefined);
  }, [userId, job_id]);

  useEffect(() => {
    if (!userId || !job_id) {
      setApplied(false);
      return;
    }
    const jid = Number(job_id);
    void getAllApplicationsByMember(userId)
      .then((data) => {
        const hasActive = data.applications.some((a) => a.job_id === jid && a.status !== "withdrawn");
        setApplied(hasActive);
      })
      .catch(() => setApplied(false));
  }, [userId, job_id]);

  useEffect(() => {
    if (!job) {
      setSimilarJobs([]);
      return;
    }
    void (async () => {
      try {
        // Try progressively broader queries so the sidebar always gets useful links.
        const firstPass = await searchJobs({
          keyword: job.title,
          location: job.location ?? undefined,
          page: 1
        });
        let related = (firstPass.jobs ?? []).filter((item) => item.job_id !== job.job_id);
        if (related.length < 3) {
          const secondPass = await searchJobs({
            keyword: job.title.split(" ")[0] ?? "",
            page: 1
          });
          const merged = [...related, ...(secondPass.jobs ?? [])];
          related = merged.filter((item, index, all) => {
            if (item.job_id === job.job_id) return false;
            return all.findIndex((candidate) => candidate.job_id === item.job_id) === index;
          });
        }
        if (related.length < 3) {
          const fallback = await searchJobs({ page: 1 });
          const merged = [...related, ...(fallback.jobs ?? [])];
          related = merged.filter((item, index, all) => {
            if (item.job_id === job.job_id) return false;
            return all.findIndex((candidate) => candidate.job_id === item.job_id) === index;
          });
        }
        setSimilarJobs(related.slice(0, 3));
      } catch {
        setSimilarJobs([]);
      }
    })();
  }, [job]);

  async function handleSaveToggle() {
    if (!userId || !job || savePending) return;
    setSavePending(true);
    try {
      if (saved) {
        await unsaveJob(userId, job.job_id);
        setSaved(false);
        toast.success("Removed from saved jobs");
      } else {
        await saveJob(userId, job.job_id);
        setSaved(true);
        toast.success("Job saved");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update saved jobs");
    } finally {
      setSavePending(false);
    }
  }

  if (loading || !job) {
    return (
      <div className={appShellInnerGridClass("gap-8 lg:grid-cols-[minmax(0,70%)_minmax(0,30%)]")}>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const parsed = parseLabeledJobDescription(job.description);
  const fallbackLines = descriptionLines(job);
  const responsibilities = parsed.responsibilities.length ? parsed.responsibilities : [];
  const qualifications = parsed.qualifications.length
    ? parsed.qualifications
    : toBullets(job.skills_required ?? [], []);
  const benefits = parsed.benefits;

  let aboutTextDisplay = stripTrailingSalaryLine(parsed.about || fallbackLines.join("\n\n"), job.salary_min, job.salary_max);

  const compensationLabel = job.salary_min || job.salary_max ? formatSalary(job.salary_min, job.salary_max) : "Compensation not disclosed";

  return (
    <>
      <AppShellBreakout className="bg-[#f3f2ef] py-4">
        <div className={APP_SHELL_MAIN_COLUMN_CLASS}>
        <Link to="/jobs" className="mb-4 inline-flex items-center gap-2 text-lg font-semibold text-[#0a66c2] hover:underline">
          <ArrowLeft className="h-5 w-5" />
          Back to search
        </Link>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,70%)_minmax(0,30%)]">
          <div className="space-y-7">
            <JobHeader
              job={job}
              applied={applied}
              saved={saved}
              savePending={savePending}
              onApply={() => setApplyOpen(true)}
              onSave={() => void handleSaveToggle()}
            />
            <Card className="rounded-[12px] border border-[#e0dfdc] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              <div className="space-y-8">
                <JobSection title="About the job">
                  {aboutTextDisplay ? (
                    <p className="whitespace-pre-wrap">{aboutTextDisplay}</p>
                  ) : (
                    <p>No description provided.</p>
                  )}
                </JobSection>
                <JobSection title="Responsibilities">
                  {responsibilities.length ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {responsibilities.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[#59636e]">Not provided.</p>
                  )}
                </JobSection>
                <JobSection title="Qualifications">
                  {qualifications.length ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {qualifications.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[#59636e]">Not provided.</p>
                  )}
                </JobSection>
                <JobSection title="Benefits">
                  {benefits.length ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {benefits.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[#59636e]">Not provided.</p>
                  )}
                </JobSection>
              </div>
            </Card>
          </div>
          <RightSidebar>
            <div className="space-y-6">
              <SidebarCard title="About the company">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-[#eef3f8] font-semibold text-[#0a66c2]">
                    {logoText(job.company_name)}
                  </div>
                  <div>
                    <p className="font-semibold text-[#1d2226]">{job.company_name}</p>
                    {job.industry ? <p className="text-sm text-[#59636e]">{job.industry}</p> : null}
                  </div>
                </div>
              </SidebarCard>

              <SidebarCard title="Compensation">
                <p className="text-sm font-semibold text-[#59636e]">Estimate pay range</p>
                <p className="text-[2rem] font-bold leading-tight text-[#057642]">{compensationLabel}</p>
                <div className="border-t border-[#ebedf0] pt-3">
                  <p className="mb-2 text-sm font-semibold text-[#59636e]">Benefits include</p>
                  {benefits.length ? (
                    <div className="flex flex-wrap gap-3 text-sm text-[#38434f]">
                      {benefits.slice(0, 3).map((item, idx) => (
                        <span key={item} className="inline-flex items-center gap-1">
                          {idx === 0 ? <ShieldCheck className="h-4 w-4 text-[#6b7280]" /> : idx === 1 ? <WalletCards className="h-4 w-4 text-[#6b7280]" /> : <CalendarDays className="h-4 w-4 text-[#6b7280]" />}
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#59636e]">Not specified.</p>
                  )}
                </div>
              </SidebarCard>

              <SidebarCard title="Similar jobs">
                {similarJobs.length ? similarJobs.map((similar) => (
                  <Link
                    key={similar.job_id}
                    to={`/jobs/${similar.job_id}`}
                    className="flex items-start gap-3 border-t border-[#ebedf0] pt-3 first:border-t-0 first:pt-0 hover:no-underline"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#eef3f8] text-xs font-semibold text-[#0a66c2]">
                      {logoText(similar.company_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-semibold text-[#1d2226]">{similar.title}</p>
                      <p className="text-xs text-[#59636e]">{similar.company_name}</p>
                      <p className="text-xs text-[#59636e]">
                        {similar.location || "Location not listed"} ({similar.work_mode})
                      </p>
                    </div>
                  </Link>
                )) : (
                  <p className="text-sm text-[#59636e]">No similar jobs found.</p>
                )}
              </SidebarCard>
            </div>
          </RightSidebar>
        </div>
        </div>
      </AppShellBreakout>
      <ApplyModal
        job={job}
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        onSubmitted={() => setApplied(true)}
      />
    </>
  );
}
