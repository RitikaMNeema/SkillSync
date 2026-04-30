import { Bookmark, BriefcaseBusiness, ExternalLink, Eye, Share2, Users } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link, useParams } from "react-router-dom";
import { getJob, getSavedJobs, saveJob, searchJobs, unsaveJob, trackJobView } from "../../api/jobs";
import { ApplyModal } from "../../components/jobs/ApplyModal";
import { RightSidebar } from "../../components/layout/Sidebar";
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
  const responsibilities = toBullets((contentByLabel["Responsibilities"] ?? "").split("\n"), []);
  const qualifications = toBullets((contentByLabel["Qualifications"] ?? "").split("\n"), []);
  const benefitsSection = (contentByLabel["Benefits"] ?? "").trim();
  const benefits = benefitsSection
    ? benefitsSection.split(",").map((item) => item.trim()).filter(Boolean)
    : [];

  return { about, responsibilities, qualifications, benefits };
}

function logoText(name?: string | null): string {
  return (name ?? "Co").slice(0, 2).toUpperCase();
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
            <Badge className="rounded-full bg-[#e8f3ec] px-3 py-1 text-[#137333]">Be among the first 25 applicants</Badge>
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
        <Button variant="secondary" className="rounded-full border-[#b0b7be] px-6 text-[#38434f] hover:bg-[#f5f7f9]">
          <Share2 className="h-4 w-4" />
          Share
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
      <div className="mx-auto grid max-w-[1128px] gap-8 lg:grid-cols-[minmax(0,70%)_minmax(0,30%)]">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const parsed = parseLabeledJobDescription(job.description);
  const fallbackLines = descriptionLines(job);
  const aboutText = parsed.about || fallbackLines.join("\n\n");
  const responsibilities = parsed.responsibilities.length
    ? parsed.responsibilities
    : ["Collaborate with cross-functional teams to deliver high-quality outcomes."];
  const qualifications = parsed.qualifications.length
    ? parsed.qualifications
    : toBullets(job.skills_required ?? [], ["Strong communication and problem-solving skills."]);
  const benefits = parsed.benefits.length ? parsed.benefits : ["Dental", "Vision", "Medical insurance"];

  return (
    <>
      <div className="mx-auto max-w-[1128px] bg-[#f3f2ef] px-4 py-4 md:px-6">
        <Link to="/jobs" className="mb-4 inline-block text-sm font-semibold text-[#0a66c2] hover:underline">
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
                  {aboutText ? (
                    <p className="whitespace-pre-wrap">{aboutText}</p>
                  ) : (
                    <p>No description provided.</p>
                  )}
                  <p className="mt-3 text-sm font-semibold text-[#1d2226]">{formatSalary(job.salary_min, job.salary_max)}</p>
                </JobSection>
                <JobSection title="Responsibilities">
                  <ul className="list-disc space-y-1 pl-5">
                    {responsibilities.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </JobSection>
                <JobSection title="Qualifications">
                  <ul className="list-disc space-y-1 pl-5">
                    {qualifications.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </JobSection>
                <JobSection title="Benefits">
                  <ul className="list-disc space-y-1 pl-5">
                    {benefits.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
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
                    <p className="text-sm text-[#59636e]">{job.industry || "Technology, Information and Internet"}</p>
                    <p className="text-sm text-[#59636e]">10,001+ employees</p>
                  </div>
                </div>
                <Button variant="secondary" className="w-full rounded-full border-[#0a66c2] text-[#0a66c2] hover:bg-[#eef3f8]">
                  Follow
                </Button>
                <a href="#" className="block text-center text-sm font-semibold text-[#0a66c2] hover:underline">
                  View company page
                </a>
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
                      <Badge className="mt-1 rounded bg-[#eef3f8] px-2 py-0.5 text-[11px] text-[#0a66c2]">Easy Apply</Badge>
                    </div>
                  </Link>
                )) : (
                  <p className="text-sm text-[#59636e]">No similar jobs found.</p>
                )}
              </SidebarCard>

              <SidebarCard title="Job insights">
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <BriefcaseBusiness className="mt-0.5 h-4 w-4 text-[#59636e]" />
                    <p className="text-sm text-[#38434f]">Tailor your resume to this role’s key skills and keywords.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Users className="mt-0.5 h-4 w-4 text-[#59636e]" />
                    <p className="text-sm text-[#38434f]">Highlight relevant projects and measurable impact in your experience.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Eye className="mt-0.5 h-4 w-4 text-[#59636e]" />
                    <p className="text-sm text-[#38434f]">Apply early for better visibility with recruiters.</p>
                  </div>
                </div>
              </SidebarCard>
            </div>
          </RightSidebar>
        </div>
      </div>
      <ApplyModal
        job={job}
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        onSubmitted={() => setApplied(true)}
      />
    </>
  );
}
