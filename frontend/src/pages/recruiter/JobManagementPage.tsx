import {
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Eye,
  Lock,
  MapPin,
  MoreHorizontal,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { closeJob, createJob, deleteJob, getAllJobsByRecruiter, updateJob } from "../../api/jobs";
import { getAllApplicationsByJob } from "../../api/applications";
import { getMember } from "../../api/members";
import { getRecruiter } from "../../api/recruiters";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { LeadingIconInput } from "../../components/ui/LeadingIconInput";
import { Input, Textarea } from "../../components/ui/Input";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import { useAuthHydrated } from "../../hooks/useAuthHydrated";
import type { Application } from "../../types/application";
import type { Job } from "../../types/job";
import { cn } from "../../utils/cn";
import { formatRelativeDate } from "../../utils/formatDate";
import { getStatusColor } from "../../utils/getStatusColor";

interface JobFormValues {
  company_id: number;
  title: string;
  work_mode: "remote" | "hybrid" | "onsite";
  about_job: string;
  responsibilities: string;
  qualifications: string;
  seniority_level: string;
  employment_type: string;
  location: string;
  skills_required: string;
  salary_min: number;
  salary_max: number;
}

interface RecruiterApplicationRow {
  job: Job;
  application: Application;
}

/** Compare employment dropdown values to API strings like "full-time", "Full time", etc. */
function normalizeEmploymentLabel(value: string): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-")
    .replace(/-+/g, "-");
}

/** Chips + submit payloads: RHF/setValue/API may yield "", comma-separated text, or string[]. */
function skillsToList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  const raw = typeof value === "string" ? value : String(value);
  return raw
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function haystackMatchesSearchTokens(searchableLower: string, phrase: string): boolean {
  const q = String(phrase ?? "").trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((token) => searchableLower.includes(token));
}

function extractBenefitsFromStoredDescription(description: string | null | undefined): string[] {
  const t = (description ?? "").trim();
  if (!t) return [];
  const inline = /\bBenefits\s*:\s*([^\n]+)/i.exec(t);
  if (inline?.[1]) return inline[1].split(/[,|]/).map((s) => s.trim()).filter(Boolean);
  const block = /\bBenefits\s*\n([^\n]+)/i.exec(t);
  if (block?.[1]) return block[1].split(/[,|]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function extractVisibleToSeekersFromStoredDescription(description: string | null | undefined): boolean {
  const t = (description ?? "").trim();
  const m = /\bVisible to job seekers\s*:\s*(yes|no)\b/i.exec(t);
  if (m) return m[1].toLowerCase() === "yes";
  return true;
}

function parseDescriptionSections(description: string | null | undefined): {
  about_job: string;
  responsibilities: string;
  qualifications: string;
} {
  const text = (description ?? "").trim();
  if (!text) return { about_job: "", responsibilities: "", qualifications: "" };

  const responsibilitiesMatch = /\bResponsibilities\b/i.exec(text);
  const qualificationsMatch = /\bQualifications\b/i.exec(text);

  if (!responsibilitiesMatch && !qualificationsMatch) {
    return { about_job: text, responsibilities: "", qualifications: "" };
  }

  const respIndex = responsibilitiesMatch?.index ?? -1;
  const qualIndex = qualificationsMatch?.index ?? -1;
  const firstSectionIndex = [respIndex, qualIndex].filter((idx) => idx >= 0).sort((a, b) => a - b)[0] ?? text.length;
  const about = text.slice(0, firstSectionIndex).replace(/^About the job\s*/i, "").trim();

  let responsibilities = "";
  if (respIndex >= 0) {
    const end = qualIndex > respIndex ? qualIndex : text.length;
    responsibilities = text.slice(respIndex, end).replace(/^Responsibilities\s*/i, "").trim();
  }

  let qualifications = "";
  if (qualIndex >= 0) {
    qualifications = text.slice(qualIndex).replace(/^Qualifications\s*/i, "").trim();
  }

  return {
    about_job: about,
    responsibilities,
    qualifications
  };
}

export function JobManagementPage() {
  const navigate = useNavigate();
  const recruiterId = authStore((state) => state.userId);
  const authHydrated = useAuthHydrated();
  const [searchParams] = useSearchParams();
  const focus = searchParams.get("focus");
  const backToListPath = `/recruiter/jobs${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  const [jobs, setJobs] = useState<Job[]>([]);
  const [reviewingCountByJob, setReviewingCountByJob] = useState<Record<number, number>>({});
  const [applicationRows, setApplicationRows] = useState<RecruiterApplicationRow[]>([]);
  const [memberNameById, setMemberNameById] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [recruiterCompanyId, setRecruiterCompanyId] = useState<number>(1);

  const [keyword, setKeyword] = useState("");
  const [locationKeyword, setLocationKeyword] = useState("");
  const [employmentFilter, setEmploymentFilter] = useState("all");
  const [workModeFilter, setWorkModeFilter] = useState<"all" | "remote" | "hybrid" | "onsite">("all");
  const [datePostedFilter, setDatePostedFilter] = useState<"all" | "24h" | "7d" | "30d">("all");
  const [activeTab, setActiveTab] = useState<"active" | "closed">("active");
  const [sortBy, setSortBy] = useState<"relevant" | "latest" | "views" | "applicants">("relevant");
  const [currentPage, setCurrentPage] = useState(1);

  const [currentStep, setCurrentStep] = useState(1);
  const [postedSuccess, setPostedSuccess] = useState(false);
  const [visibleToSeekers, setVisibleToSeekers] = useState(true);
  const [additionalCompensation, setAdditionalCompensation] = useState<string[]>([]);
  const [benefits, setBenefits] = useState<string[]>([]);
  const [benefitCustomDraft, setBenefitCustomDraft] = useState("");
  const [benefitCustomOpen, setBenefitCustomOpen] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [openMoreForJobId, setOpenMoreForJobId] = useState<number | null>(null);
  /** Set after successful create/update so the success screen can deep-link */
  const [postedJobId, setPostedJobId] = useState<number | null>(null);

  const { register, handleSubmit, reset, watch, setValue, getValues, formState } = useForm<JobFormValues>({
    defaultValues: {
      work_mode: "remote",
      company_id: 1,
      seniority_level: "mid-senior",
      title: "",
      employment_type: "",
      location: "",
      about_job: "",
      responsibilities: "",
      qualifications: "",
      skills_required: "",
      salary_min: 0,
      salary_max: 0
    }
  });
  const { isSubmitting } = formState;
  const watchedAbout = watch("about_job") ?? "";
  const watchedResponsibilities = watch("responsibilities") ?? "";
  const watchedQualifications = watch("qualifications") ?? "";
  const watchedSkills = watch("skills_required");

  useEffect(() => {
    if (!authHydrated || !recruiterId) return;
    void (async () => {
      try {
        const recruiter = await getRecruiter(recruiterId);
        const companyId = Number(recruiter.company_id);
        if (Number.isFinite(companyId) && companyId > 0) {
          setRecruiterCompanyId(companyId);
          setValue("company_id", companyId, { shouldDirty: false });
        }
      } catch {
        // keep fallback company id
      }
    })();
  }, [authHydrated, recruiterId, setValue]);

  useEffect(() => {
    if (!authHydrated || !recruiterId) return;
    void (async () => {
      try {
        const allJobs = await getAllJobsByRecruiter(recruiterId);
        setJobs(allJobs);
        const rows = await Promise.all(
          allJobs.map(async (job) => {
            try {
              const details = await getAllApplicationsByJob(job.job_id);
              return { job, applications: details.applications };
            } catch {
              return { job, applications: [] as Application[] };
            }
          })
        );
        const stats = rows.map((row) => [row.job.job_id, row.applications.filter((a) => a.status === "reviewing").length] as const);
        const flattenedRows = rows.flatMap((row) =>
          row.applications.map((application) => ({ job: row.job, application }))
        );
        const uniqueMemberIds = [...new Set(flattenedRows.map((row) => row.application.member_id))];
        const memberEntries = await Promise.all(
          uniqueMemberIds.map(async (memberId) => {
            try {
              const profile = await getMember(memberId);
              const fullName = `${profile.first_name} ${profile.last_name}`.trim();
              return [memberId, fullName || `Member #${memberId}`] as const;
            } catch {
              return [memberId, `Member #${memberId}`] as const;
            }
          })
        );
        setReviewingCountByJob(Object.fromEntries(stats));
        setApplicationRows(flattenedRows);
        setMemberNameById(Object.fromEntries(memberEntries));
      } catch {
        toast.error("Could not load job postings");
      } finally {
        setLoading(false);
      }
    })();
  }, [authHydrated, recruiterId]);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    setKeyword(q);
  }, [searchParams]);

  useEffect(() => {
    if (focus === "active") setActiveTab("active");
  }, [focus]);

  const filteredJobs = useMemo(() => {
    if (focus === "active") return jobs.filter((job) => (job.status ?? "open") === "open");
    if (focus === "applicants") return jobs.filter((job) => (job.applicants_count ?? 0) > 0);
    if (focus === "new") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return jobs.filter((job) => {
        if (!job.posted_datetime) return false;
        return new Date(job.posted_datetime) >= weekAgo;
      });
    }
    if (focus === "pending") return jobs.filter((job) => (reviewingCountByJob[job.job_id] ?? 0) > 0);
    return jobs;
  }, [focus, jobs, reviewingCountByJob]);

  const filterMeta = useMemo(() => {
    if (!focus) return null;
    if (focus === "active") return `${filteredJobs.length} active job${filteredJobs.length === 1 ? "" : "s"}`;
    if (focus === "applicants") {
      const totalApplicants = filteredJobs.reduce((sum, job) => sum + (job.applicants_count ?? 0), 0);
      return `${filteredJobs.length} job${filteredJobs.length === 1 ? "" : "s"} with applicants (${totalApplicants} total applicants)`;
    }
    if (focus === "new") {
      const uniqueTitles = new Set(filteredJobs.map((job) => (job.title ?? "").trim().toLowerCase())).size;
      return `${uniqueTitles} unique title${uniqueTitles === 1 ? "" : "s"} from ${filteredJobs.length} posting${filteredJobs.length === 1 ? "" : "s"} in last 7 days`;
    }
    const pendingCount = filteredJobs.reduce((sum, job) => sum + (reviewingCountByJob[job.job_id] ?? 0), 0);
    return `${filteredJobs.length} job${filteredJobs.length === 1 ? "" : "s"} with pending review (${pendingCount} reviewing applications)`;
  }, [focus, filteredJobs, reviewingCountByJob]);

  const filteredApplications = useMemo(() => {
    if (focus === "applicants") return applicationRows;
    if (focus === "pending") return applicationRows.filter((row) => row.application.status === "reviewing");
    return [];
  }, [focus, applicationRows]);

  const displayedJobs = useMemo(() => {
    if (focus !== "new") return filteredJobs.map((job) => ({ job, postingCount: 1 }));
    const grouped = new Map<string, { job: Job; postingCount: number }>();
    for (const job of filteredJobs) {
      const key = (job.title ?? "").trim().toLowerCase();
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { job, postingCount: 1 });
        continue;
      }
      const existingTime = existing.job.posted_datetime ? new Date(existing.job.posted_datetime).getTime() : 0;
      const incomingTime = job.posted_datetime ? new Date(job.posted_datetime).getTime() : 0;
      const baseJob = incomingTime >= existingTime ? job : existing.job;
      grouped.set(key, {
        job: {
          ...baseJob,
          applicants_count: (existing.job.applicants_count ?? 0) + (job.applicants_count ?? 0),
          views_count: (existing.job.views_count ?? 0) + (job.views_count ?? 0)
        },
        postingCount: existing.postingCount + 1
      });
    }
    return Array.from(grouped.values());
  }, [focus, filteredJobs]);

  const filteredDisplayedJobs = useMemo(
    () =>
      displayedJobs.filter(({ job }) => {
        const searchable = [
          job.title,
          job.location ?? "",
          job.employment_type ?? "",
          job.company_name ?? "",
          Array.isArray(job.skills_required) ? job.skills_required.join(" ") : "",
          job.description ?? ""
        ]
          .join(" ")
          .toLowerCase();
        const normalizedLocation = locationKeyword.trim().toLowerCase();
        const jobEmp = normalizeEmploymentLabel(job.employment_type ?? "");
        const filterEmp = employmentFilter === "all" ? "" : normalizeEmploymentLabel(employmentFilter);
        const matchesKeyword = haystackMatchesSearchTokens(searchable, keyword);
        const matchesLocationText = normalizedLocation ? (job.location ?? "").toLowerCase().includes(normalizedLocation) : true;
        const matchesEmployment = employmentFilter === "all" ? true : jobEmp === filterEmp || jobEmp.replace(/-/g, "") === filterEmp.replace(/-/g, "");
        const matchesWorkMode = workModeFilter === "all" ? true : job.work_mode === workModeFilter;
        const postedAtMs = job.posted_datetime ? new Date(job.posted_datetime).getTime() : NaN;
        const matchesDatePosted =
          datePostedFilter === "all"
            ? true
            : !Number.isFinite(postedAtMs)
              ? true
              : datePostedFilter === "24h"
                ? (Date.now() - postedAtMs) / (1000 * 60 * 60) <= 24
              : datePostedFilter === "7d"
                ? (Date.now() - postedAtMs) / (1000 * 60 * 60) <= 24 * 7
                : (Date.now() - postedAtMs) / (1000 * 60 * 60) <= 24 * 30;
        return matchesKeyword && matchesLocationText && matchesEmployment && matchesWorkMode && matchesDatePosted;
      }),
    [displayedJobs, keyword, locationKeyword, employmentFilter, workModeFilter, datePostedFilter]
  );

  const statusFilteredJobs = useMemo(
    () => filteredDisplayedJobs.filter(({ job }) => (job.status ?? "open") === (activeTab === "active" ? "open" : "closed")),
    [filteredDisplayedJobs, activeTab]
  );

  const sortedJobs = useMemo(() => {
    const rows = [...statusFilteredJobs];
    if (sortBy === "latest") {
      rows.sort((a, b) => (new Date(b.job.posted_datetime ?? 0).getTime() || 0) - (new Date(a.job.posted_datetime ?? 0).getTime() || 0));
    } else if (sortBy === "views") {
      rows.sort((a, b) => (b.job.views_count ?? 0) - (a.job.views_count ?? 0));
    } else if (sortBy === "applicants") {
      rows.sort((a, b) => (b.job.applicants_count ?? 0) - (a.job.applicants_count ?? 0));
    }
    return rows;
  }, [statusFilteredJobs, sortBy]);

  const jobsPerPage = 5;
  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / jobsPerPage));
  const paginatedJobs = useMemo(
    () => sortedJobs.slice((currentPage - 1) * jobsPerPage, currentPage * jobsPerPage),
    [sortedJobs, currentPage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, keyword, locationKeyword, employmentFilter, workModeFilter, datePostedFilter, sortBy]);

  const duplicateTitleMetaByJobId = useMemo(() => {
    const totals = new Map<string, number>();
    for (const { job } of displayedJobs) {
      const key = (job.title ?? "").trim().toLowerCase();
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    const meta: Record<number, { index: number; total: number }> = {};
    for (const { job } of displayedJobs) {
      const key = (job.title ?? "").trim().toLowerCase();
      const nextIndex = (seen.get(key) ?? 0) + 1;
      seen.set(key, nextIndex);
      meta[job.job_id] = { index: nextIndex, total: totals.get(key) ?? 1 };
    }
    return meta;
  }, [displayedJobs]);

  const skillChips = useMemo(() => skillsToList(watchedSkills).slice(0, 10), [watchedSkills]);

  function toggleChip(value: string, selected: string[], setter: (values: string[]) => void) {
    setter(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  function removeSkill(skill: string) {
    setValue(
      "skills_required",
      skillChips.filter((item) => item !== skill).join(", "),
      { shouldDirty: true }
    );
  }

  function addSkillsFromInput(input: string) {
    const incoming = skillsToList(input);
    if (!incoming.length) return;
    const merged = Array.from(new Set([...skillChips, ...incoming])).slice(0, 10);
    setValue("skills_required", merged.join(", "), { shouldDirty: true });
  }

  function validateStepOne() {
    const values = getValues();
    if (!values.title?.trim() || !values.employment_type?.trim() || !values.location?.trim()) {
      toast.error("Please complete required fields in Job details.");
      return false;
    }
    return true;
  }

  function validateStepThree() {
    if (!getValues("about_job")?.trim() || !getValues("responsibilities")?.trim() || !getValues("qualifications")?.trim()) {
      toast.error("Please complete About the job, Responsibilities, and Qualifications.");
      return false;
    }
    return true;
  }

  function resetWizardExtras() {
    setAdditionalCompensation([]);
    setBenefits([]);
    setBenefitCustomDraft("");
    setBenefitCustomOpen(false);
    setVisibleToSeekers(true);
    setPostedJobId(null);
  }

  function addCustomBenefit() {
    const text = benefitCustomDraft.trim();
    if (!text || benefits.includes(text)) {
      setBenefitCustomDraft("");
      setBenefitCustomOpen(false);
      return;
    }
    setBenefits((current) => [...current, text]);
    setBenefitCustomDraft("");
    setBenefitCustomOpen(false);
  }

  function openPostModal() {
    setEditingJob(null);
    resetWizardExtras();
    reset({
      work_mode: "remote",
      company_id: recruiterCompanyId,
      seniority_level: "mid-senior",
      title: "",
      employment_type: "",
      location: "",
      about_job: "",
      responsibilities: "",
      qualifications: "",
      skills_required: "",
      salary_min: 0,
      salary_max: 0
    });
    setCurrentStep(1);
    setPostedSuccess(false);
    setShowFullDescription(false);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditingJob(null);
    setCurrentStep(1);
    setPostedSuccess(false);
    setShowFullDescription(false);
    setOpenMoreForJobId(null);
    resetWizardExtras();
  }

  async function onSubmit(values: JobFormValues) {
    const recruiterUserId = Number(recruiterId);
    if (!Number.isFinite(recruiterUserId) || recruiterUserId <= 0) {
      toast.error("You must be signed in as a recruiter.");
      return;
    }
    const title = (values.title ?? "").trim();
    const employmentType = (values.employment_type ?? "").trim();
    const location = (values.location ?? "").trim();
    const aboutJob = (values.about_job ?? "").trim();
    const responsibilities = (values.responsibilities ?? "").trim();
    const qualifications = (values.qualifications ?? "").trim();
    let salaryMin = Number(values.salary_min);
    let salaryMax = Number(values.salary_max);
    if (!Number.isFinite(salaryMin)) salaryMin = 0;
    if (!Number.isFinite(salaryMax)) salaryMax = 0;
    if (!title || !employmentType || !location || !aboutJob || !responsibilities || !qualifications) {
      toast.error("Please fill title, employment type, location, and all three description fields.");
      return;
    }
    const workMode =
      values.work_mode === "remote" || values.work_mode === "hybrid" || values.work_mode === "onsite" ? values.work_mode : "remote";
    const seniority = (values.seniority_level ?? "").trim() || "mid-senior";
    if (salaryMin > 0 && salaryMax > 0 && salaryMin > salaryMax) {
      toast.error("Salary min cannot be greater than salary max.");
      return;
    }

    const loadingToast = toast.loading(editingJob ? "Updating job..." : "Posting job...");
    try {
      const enrichedDescriptionSections = [
        `About the job\n${aboutJob}`,
        `Responsibilities\n${responsibilities}`,
        `Qualifications\n${qualifications}`,
        additionalCompensation.length ? `Additional compensation: ${additionalCompensation.join(", ")}` : "",
        benefits.length ? `Benefits\n${benefits.join(", ")}` : "",
        `Visible to job seekers: ${visibleToSeekers ? "Yes" : "No"}`
      ].filter(Boolean);
      const payload = {
        title,
        description: enrichedDescriptionSections.join("\n\n"),
        work_mode: workMode,
        seniority_level: seniority,
        employment_type: employmentType,
        location,
        skills_required: skillsToList(values.skills_required).slice(0, 10),
        salary_min: salaryMin > 0 ? salaryMin : undefined,
        salary_max: salaryMax > 0 ? salaryMax : undefined
      };
      if (editingJob) {
        const updated = await updateJob({
          job_id: editingJob.job_id,
          ...payload
        });
        if (!updated?.job_id) {
          toast.error(editingJob ? "Could not update job" : "Could not create job", { id: loadingToast });
          return;
        }
        setPostedJobId(updated.job_id);
        setJobs((current) => current.map((job) => (job.job_id === editingJob.job_id ? { ...job, ...updated } : job)));
      } else {
        const companyId = Number(values.company_id || recruiterCompanyId);
        if (!Number.isFinite(companyId) || companyId <= 0) {
          toast.error("Company information is missing for this recruiter.", { id: loadingToast });
          return;
        }
        const created = await createJob({
          company_id: companyId,
          recruiter_id: recruiterUserId,
          ...payload
        });
        if (!created?.job_id) {
          toast.error("Could not create job", { id: loadingToast });
          return;
        }
        setPostedJobId(created.job_id);
        setJobs((current) => [created, ...current]);
      }
      setPostedSuccess(true);
      toast.success(editingJob ? "Job updated" : "Job posted", { id: loadingToast });
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : editingJob ? "Could not update job" : "Could not create job";
      toast.error(message, { id: loadingToast });
    }
  }

  function handleEditJob(job: Job) {
    setEditingJob(job);
    resetWizardExtras();
    const parsedSections = parseDescriptionSections(job.description ?? "");
    reset({
      company_id: job.company_id ?? 1,
      title: job.title,
      employment_type: job.employment_type ?? "",
      seniority_level: job.seniority_level ?? "mid-senior",
      location: job.location ?? "",
      work_mode: job.work_mode ?? "remote",
      salary_min: Number(job.salary_min ?? 0),
      salary_max: Number(job.salary_max ?? 0),
      skills_required: Array.isArray(job.skills_required) ? job.skills_required.join(", ") : "",
      about_job: parsedSections.about_job,
      responsibilities: parsedSections.responsibilities,
      qualifications: parsedSections.qualifications
    });
    setBenefits(extractBenefitsFromStoredDescription(job.description ?? ""));
    setVisibleToSeekers(extractVisibleToSeekersFromStoredDescription(job.description ?? ""));
    setPostedSuccess(false);
    setCurrentStep(1);
    setOpen(true);
  }

  async function handleDeleteJob(job: Job) {
    const confirmed = window.confirm(`Delete posting "${job.title}"?`);
    if (!confirmed) return;
    try {
      await deleteJob(job.job_id);
      setJobs((current) => current.filter((item) => item.job_id !== job.job_id));
      toast.success("Posting deleted");
    } catch {
      toast.error("Could not delete posting");
    }
  }

  async function handleCloseJob(job: Job) {
    const confirmed = window.confirm(`Close posting "${job.title}"? This will auto-reject all pending applications.`);
    if (!confirmed) return;
    try {
      await closeJob(job.job_id);
      setJobs((current) => current.map((item: Job) => (item.job_id === job.job_id ? { ...item, status: "closed" } : item)));
      toast.success("Posting closed");
    } catch {
      toast.error("Could not close posting");
    }
  }

  if (loading || !authHydrated) {
    return (
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1f1f1f]">Jobs</h1>
          {focus ? (
            <p className="mt-1 text-sm text-text-secondary">
              {filterMeta ? filterMeta : "Showing recruiter jobs."} {focus !== "active" ? <Link to="/recruiter/jobs">Clear filter</Link> : null}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={openPostModal} className="h-10 rounded-full border-[#0A66C2] bg-[#0A66C2] px-5 text-sm hover:bg-[#004182]">
            Post a job
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-[#dde3ea] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <div className="mb-4 flex flex-wrap items-center gap-4 border-b border-[#e8edf3] pb-3">
          <button
            type="button"
            className={`inline-flex items-center gap-2 border-b-2 pb-2 text-sm font-semibold ${activeTab === "active" ? "border-[#0A66C2] text-[#0A66C2]" : "border-transparent text-[#59636e]"}`}
            onClick={() => setActiveTab("active")}
          >
            Active
            <span className="rounded-full bg-[#e8f3ff] px-2 py-0.5 text-xs text-[#0A66C2]">
              {jobs.filter((job) => (job.status ?? "open") === "open").length}
            </span>
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-2 border-b-2 pb-2 text-sm font-semibold ${activeTab === "closed" ? "border-[#0A66C2] text-[#0A66C2]" : "border-transparent text-[#59636e]"}`}
            onClick={() => setActiveTab("closed")}
          >
            Closed
            <span className="rounded-full bg-[#f1f3f5] px-2 py-0.5 text-xs text-[#59636e]">
              {jobs.filter((job) => (job.status ?? "open") === "closed").length}
            </span>
          </button>
        </div>

        <div className="grid min-w-0 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
          <LeadingIconInput
            Icon={Search}
            autoComplete="off"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            aria-label="Search job title, keyword, or company"
            placeholder="Search jobs"
          />
          <LeadingIconInput
            Icon={MapPin}
            autoComplete="off"
            value={locationKeyword}
            onChange={(event) => setLocationKeyword(event.target.value)}
            aria-label="City, state, or zip code"
            placeholder="Location"
          />
          <Button
            type="button"
            className="!h-[46px] shrink-0 rounded-full border-[#0A66C2] bg-[#0A66C2] px-6 text-sm hover:bg-[#004182]"
            onClick={() => setCurrentPage(1)}
          >
            Search
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="h-fit rounded-2xl border border-[#dde3ea] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#1f1f1f]">Filters</h3>
            <button
              type="button"
              className="text-sm font-semibold text-[#0A66C2]"
              onClick={() => {
                setKeyword("");
                setLocationKeyword("");
                setEmploymentFilter("all");
                setWorkModeFilter("all");
                setDatePostedFilter("all");
              }}
            >
              Reset all
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#39424e]">Experience level</label>
              <select className="linkedin-input w-full" value={employmentFilter} onChange={(event) => setEmploymentFilter(event.target.value)}>
                <option value="all">All experience levels</option>
                <option value="full-time">Full-time</option>
                <option value="part-time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#39424e]">Work mode</label>
              <select className="linkedin-input w-full" value={workModeFilter} onChange={(event) => setWorkModeFilter(event.target.value as "all" | "remote" | "hybrid" | "onsite")}>
                <option value="all">All work modes</option>
                <option value="onsite">On-site</option>
                <option value="hybrid">Hybrid</option>
                <option value="remote">Remote</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#39424e]">Date posted</label>
              <select className="linkedin-input w-full" value={datePostedFilter} onChange={(event) => setDatePostedFilter(event.target.value as "all" | "24h" | "7d" | "30d")}>
                <option value="all">Any time</option>
                <option value="24h">Past 24 hours</option>
                <option value="7d">Past week</option>
                <option value="30d">Past month</option>
              </select>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm text-[#4b5563]">{sortedJobs.length} {activeTab} jobs</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-[#4b5563]"
              onClick={() => setSortBy((current) => (current === "relevant" ? "latest" : current === "latest" ? "applicants" : current === "applicants" ? "views" : "relevant"))}
            >
              Sort by: {sortBy === "relevant" ? "Most relevant" : sortBy === "latest" ? "Most recent" : sortBy === "applicants" ? "Most applicants" : "Most views"}
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {!jobs.length ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-200 bg-[#FCFCFD] px-4 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                <BriefcaseBusiness className="h-8 w-8 text-gray-500" />
              </div>
              <p className="text-lg font-semibold text-gray-900">You haven&apos;t posted any jobs yet</p>
              <p className="text-sm text-gray-500">Reach the right candidates by posting a job.</p>
              <Button onClick={openPostModal} className="border-[#0A66C2] bg-[#0A66C2] hover:bg-[#004182]">
                Post your first job
              </Button>
            </div>
          ) : paginatedJobs.length ? (
            <div className="space-y-3">
              {paginatedJobs.map(({ job }) => (
                <article key={job.job_id} className="rounded-2xl border border-[#dde3ea] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#eef3f8] text-lg font-bold text-[#0A66C2]">
                      {(job.company_name ?? job.title ?? "J").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Link
                            to={`/recruiter/jobs/${job.job_id}/applicants`}
                            state={{ from: backToListPath, fromLabel: "Back to Jobs" }}
                            className="text-xl font-semibold text-[#1f1f1f] hover:text-[#0A66C2] hover:underline"
                          >
                            {job.title}
                          </Link>
                          <p className="text-sm text-[#4b5563]">{job.company_name ?? "Company"}</p>
                          <p className="inline-flex items-center gap-1 text-sm text-[#6b7280]">
                            <MapPin className="h-3.5 w-3.5" />
                            {job.location ?? "Location not provided"} ({job.work_mode ?? "onsite"})
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${(job.status ?? "open") === "open" ? "bg-[#e7f8ef] text-[#0f8f58]" : "bg-[#fee2e2] text-[#b91c1c]"}`}>
                            {(job.status ?? "open") === "open" ? "Active" : "Closed"}
                          </span>
                          <button
                            type="button"
                            className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
                            onClick={() => setOpenMoreForJobId((current) => (current === job.job_id ? null : job.job_id))}
                          >
                            <MoreHorizontal className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded bg-[#eef3ff] px-2 py-1 text-[#225fbe]">{job.employment_type ?? "Full-time"}</span>
                        <span className="rounded bg-[#eef3ff] px-2 py-1 text-[#225fbe]">{job.work_mode === "onsite" ? "On-site" : job.work_mode === "hybrid" ? "Hybrid" : "Remote"}</span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-4 text-sm text-[#6b7280]">
                          <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" />{job.views_count ?? 0} views</span>
                          <span className="inline-flex items-center gap-1 font-semibold text-[#225fbe]"><Users className="h-4 w-4" />{job.applicants_count ?? 0} applicants</span>
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-4 w-4" />Posted {formatRelativeDate(job.posted_datetime)}</span>
                        </div>
                        <Link
                          to={`/recruiter/jobs/${job.job_id}/applicants`}
                          state={{ from: backToListPath, fromLabel: "Back to Jobs" }}
                          className="inline-flex h-9 items-center rounded-full border border-[#0A66C2] px-4 text-sm font-semibold text-[#0A66C2] hover:bg-[#eef3f8]"
                        >
                          View applicants
                        </Link>
                      </div>
                    </div>
                  </div>
                  {openMoreForJobId === job.job_id ? (
                    <div className="relative mt-2">
                      <div className="absolute right-0 top-0 z-20 min-w-[160px] rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => {
                            setOpenMoreForJobId(null);
                            handleEditJob(job);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                        {(job.status ?? "open") === "open" ? (
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50"
                            onClick={() => {
                              setOpenMoreForJobId(null);
                              void handleCloseJob(job);
                            }}
                          >
                            <Lock className="h-4 w-4" />
                            Close
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                          onClick={() => {
                            setOpenMoreForJobId(null);
                            void handleDeleteJob(job);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
              No {activeTab} job posts match your filters.
            </div>
          )}

          <div className="flex items-center justify-center gap-2 pt-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${pageNum === currentPage ? "bg-[#0A66C2] text-white" : "text-[#4b5563] hover:bg-[#edf2f7]"}`}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </button>
            ))}
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-md">
          <div
            className={cn(
              "flex max-h-[90vh] min-h-0 w-full flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-modal",
              currentStep === 3 ? "max-w-[min(1120px,calc(100vw-2rem))]" : "max-w-[680px]"
            )}
          >
            <div className="flex shrink-0 items-center justify-between border-b px-8 py-6">
              <h2 className="text-[28px] font-semibold text-gray-900">{editingJob ? "Update job post" : "Create a job post"}</h2>
              <Button type="button" variant="icon" onClick={closeModal} aria-label="Close job post form">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {postedSuccess ? (
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-8 py-8">
                <div className="space-y-3 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700">
                    <Check className="h-8 w-8" />
                  </div>
                  <div className="flex justify-center">
                    <Sparkles className="h-4 w-4 text-[#0A66C2]" />
                  </div>
                  <h3 className="text-2xl font-semibold text-gray-900">Your job post is live!</h3>
                  <p className="text-sm text-gray-500">Your job post has been published and is now visible to qualified candidates.</p>
                </div>
                <div className="rounded-2xl border border-gray-200">
                  <p className="border-b px-4 py-3 text-sm font-semibold text-gray-900">What&apos;s next?</p>
                  {[
                    ["Manage your job post", "Edit details, pause, or close your post anytime."],
                    ["View applicants", "Review and manage candidates who apply."],
                    ["Share your job", "Increase reach by sharing your job post."]
                  ].map(([title, subtitle]) => (
                    <div key={title} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{title}</p>
                        <p className="text-xs text-gray-500">{subtitle}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  ))}
                </div>
                <Button
                  fullWidth
                  className="h-11 border-[#0A66C2] bg-[#0A66C2] text-sm hover:bg-[#004182]"
                  onClick={() => {
                    const id = postedJobId ?? editingJob?.job_id;
                    if (id != null) {
                      navigate(`/recruiter/jobs/${id}/applicants`, {
                        state: { from: backToListPath, fromLabel: "Back to Jobs" }
                      });
                    }
                    closeModal();
                  }}
                >
                  Go to job post
                </Button>
                <button type="button" className="mx-auto block text-sm font-semibold text-[#0A66C2]" onClick={closeModal}>
                  View all job posts
                </button>
              </div>
            ) : (
              <form
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
                onSubmit={handleSubmit((values) => void onSubmit(values))}
              >
                <input type="hidden" {...register("company_id", { valueAsNumber: true })} />
                <input type="hidden" {...register("skills_required")} />
                <div className="shrink-0 border-b border-gray-100 px-8 pb-4 pt-6">
                  <div className="flex items-start justify-between gap-2">
                  {["Job details", "Compensation", "Description", "Review"].map((label, index) => {
                    const step = index + 1;
                    const isActive = currentStep === step;
                    const isDone = currentStep > step;
                    return (
                      <div key={label} className="flex min-w-0 flex-1 items-start gap-0">
                        <div className="flex shrink-0 flex-col items-center">
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                              isDone || isActive ? "bg-[#0A66C2] text-white" : "bg-gray-200 text-gray-600"
                            )}
                          >
                            {isDone ? <Check className="h-4 w-4" /> : step}
                          </div>
                          <span className={cn("mt-2 text-center text-xs leading-tight", isActive ? "font-semibold text-gray-900" : "text-gray-500")}>
                            {label}
                          </span>
                        </div>
                        {step < 4 ? (
                          <div
                            className={cn(
                              "mx-1 mt-4 h-0.5 min-w-[12px] flex-1",
                              currentStep > step ? "bg-[#0A66C2]" : "bg-[#E0E0E0]"
                            )}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
                {currentStep === 1 ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Job details</h3>
                      <p className="text-sm text-gray-500">Let&apos;s start with the basics.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">* Job title</label>
                        <Input {...register("title")} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">* Employment type</label>
                        <select className="linkedin-input w-full" {...register("employment_type")}>
                          <option value="">Select employment type</option>
                          <option value="full-time">Full-time</option>
                          <option value="part-time">Part-time</option>
                          <option value="contract">Contract</option>
                          <option value="internship">Internship</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">* Location</label>
                        <Input {...register("location")} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">* Experience level</label>
                        <select className="linkedin-input w-full" {...register("seniority_level")}>
                          <option value="internship">Internship</option>
                          <option value="entry">Entry</option>
                          <option value="associate">Associate</option>
                          <option value="mid-senior">Mid-Senior</option>
                          <option value="director">Director</option>
                          <option value="executive">Executive</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-semibold text-gray-700">* Workplace type</label>
                        <select className="linkedin-input w-full" {...register("work_mode")}>
                          <option value="onsite">On-site</option>
                          <option value="remote">Remote</option>
                          <option value="hybrid">Hybrid</option>
                        </select>
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#EAF4FF] p-3 text-sm text-[#0A66C2]">
                      <p className="inline-flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Not sure about some details? You can add or edit them later before publishing.
                      </p>
                    </div>
                    <p className="text-xs text-gray-400">* Indicates required fields</p>
                  </div>
                ) : null}

                {currentStep === 2 ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Compensation</h3>
                      <p className="text-sm text-gray-500">Help attract candidates by sharing compensation details.</p>
                    </div>
                    <label className="block text-xs font-semibold text-gray-700">Salary range (USD per year)</label>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        type="number"
                        {...register("salary_min", { valueAsNumber: true })}
                        aria-label="Minimum salary (USD per year)"
                      />
                      <Input
                        type="number"
                        {...register("salary_max", { valueAsNumber: true })}
                        aria-label="Maximum salary (USD per year)"
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={visibleToSeekers} onChange={(event) => setVisibleToSeekers(event.target.checked)} />
                      Visible to job seekers
                    </label>
                    <div>
                      <p className="mb-2 text-xs font-semibold text-gray-700">Additional compensation</p>
                      <div className="flex flex-wrap gap-2">
                        {["Base salary", "Commission", "Tips", "Bonus", "Profit sharing", "Equity"].map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={`rounded-full border px-3 py-1 text-xs ${
                              additionalCompensation.includes(option)
                                ? "border-[#0A66C2] bg-[#EAF4FF] text-[#0A66C2]"
                                : "border-gray-300 text-gray-600"
                            }`}
                            onClick={() => toggleChip(option, additionalCompensation, setAdditionalCompensation)}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {currentStep === 3 ? (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">Description</h3>
                      <p className="mt-1 text-sm text-gray-500">Fill all three sections to structure the posting clearly.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
                      <div className="flex min-h-0 flex-col">
                        <label className="mb-1.5 block text-xs font-semibold text-gray-800">* About the job</label>
                        <Textarea
                          {...register("about_job", { maxLength: 5000 })}
                          className="min-h-[220px] flex-1 rounded-xl border-gray-200 bg-white text-sm"
                        />
                        <p className="mt-1.5 text-right text-xs text-gray-400">
                          {Math.min(watchedAbout.length, 5000)}/5000
                        </p>
                      </div>
                      <div className="flex min-h-0 flex-col">
                        <label className="mb-1.5 block text-xs font-semibold text-gray-800">* Responsibilities</label>
                        <Textarea
                          {...register("responsibilities", { maxLength: 5000 })}
                          className="min-h-[220px] flex-1 rounded-xl border-gray-200 bg-white text-sm"
                        />
                        <p className="mt-1.5 text-right text-xs text-gray-400">
                          {Math.min(watchedResponsibilities.length, 5000)}/5000
                        </p>
                      </div>
                      <div className="flex min-h-0 flex-col">
                        <label className="mb-1.5 block text-xs font-semibold text-gray-800">* Qualifications</label>
                        <Textarea
                          {...register("qualifications", { maxLength: 5000 })}
                          className="min-h-[220px] flex-1 rounded-xl border-gray-200 bg-white text-sm"
                        />
                        <p className="mt-1.5 text-right text-xs text-gray-400">
                          {Math.min(watchedQualifications.length, 5000)}/5000
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-800">Skills (optional)</label>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-[15px] top-1/2 z-[1] h-[17px] w-[17px] -translate-y-1/2 text-gray-500" />
                        <Input
                          className="rounded-xl !pl-[3rem]"
                          aria-label="Skill; press comma or Enter to add"
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === ",") {
                              event.preventDefault();
                              addSkillsFromInput(event.currentTarget.value);
                              event.currentTarget.value = "";
                            }
                          }}
                          onBlur={(event) => {
                            addSkillsFromInput(event.currentTarget.value);
                            event.currentTarget.value = "";
                          }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-gray-500">Add up to 10 skills, separated by commas</p>
                      {skillChips.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {skillChips.map((skill) => (
                            <button
                              key={skill}
                              type="button"
                              className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
                              onClick={() => removeSkill(skill)}
                            >
                              {skill} ×
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-800">Benefits (optional)</label>
                      <div className="flex flex-wrap items-center gap-2">
                        {["Medical insurance", "401(k)", "Paid time off", "Dental", "Vision", "Remote work"].map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              benefits.includes(option)
                                ? "border-[#0A66C2] bg-[#EAF4FF] text-[#0A66C2]"
                                : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                            }`}
                            onClick={() => toggleChip(option, benefits, setBenefits)}
                          >
                            {option}
                          </button>
                        ))}
                        {benefitCustomOpen ? (
                          <input
                            autoFocus
                            type="text"
                            value={benefitCustomDraft}
                            aria-label="Custom benefit name"
                            className="linkedin-input min-w-[140px] flex-1 rounded-full px-3 py-1.5 text-xs"
                            onChange={(event) => setBenefitCustomDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addCustomBenefit();
                              }
                              if (event.key === "Escape") {
                                setBenefitCustomDraft("");
                                setBenefitCustomOpen(false);
                              }
                            }}
                            onBlur={() => {
                              if (benefitCustomDraft.trim()) addCustomBenefit();
                              else setBenefitCustomOpen(false);
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="rounded-full border border-dashed border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#0A66C2] hover:border-[#0A66C2] hover:bg-[#EAF4FF]"
                            onClick={() => setBenefitCustomOpen(true)}
                          >
                            + Add
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {currentStep === 4 ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Review your job post</h3>
                      <p className="text-sm text-gray-500">Make sure everything looks good before publishing.</p>
                    </div>
                    <div className="space-y-3 rounded-2xl border border-gray-200 p-4">
                      <section className="space-y-1 border-b pb-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-900">Job details</h4>
                          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-[#0A66C2]" onClick={() => setCurrentStep(1)}>
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                        </div>
                        <p className="text-sm text-gray-600">Job title: {getValues("title") || "-"}</p>
                        <p className="text-sm text-gray-600">Employment type: {getValues("employment_type") || "-"}</p>
                        <p className="text-sm text-gray-600">Location: {getValues("location") || "-"}</p>
                        <p className="text-sm text-gray-600">Experience level: {getValues("seniority_level") || "-"}</p>
                        <p className="text-sm text-gray-600">Workplace type: {getValues("work_mode") || "-"}</p>
                      </section>
                      <section className="space-y-1 border-b pb-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-900">Compensation</h4>
                          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-[#0A66C2]" onClick={() => setCurrentStep(2)}>
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                        </div>
                        <p className="text-sm text-gray-600">Salary range: USD {getValues("salary_min") || 0} - USD {getValues("salary_max") || 0}</p>
                        <p className="text-sm text-gray-600">Visible to job seekers: {visibleToSeekers ? "Yes" : "No"}</p>
                        <p className="text-sm text-gray-600">Additional compensation: {additionalCompensation.length ? additionalCompensation.join(", ") : "-"}</p>
                      </section>
                      <section className="space-y-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-900">Description</h4>
                          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-[#0A66C2]" onClick={() => setCurrentStep(3)}>
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                        </div>
                        <p className="text-sm text-gray-600">
                          About the job:{" "}
                          {showFullDescription || watchedAbout.length < 180
                            ? watchedAbout || "-"
                            : `${watchedAbout.slice(0, 180)}...`}
                        </p>
                        <p className="text-sm text-gray-600">
                          Responsibilities:{" "}
                          {showFullDescription || watchedResponsibilities.length < 180
                            ? watchedResponsibilities || "-"
                            : `${watchedResponsibilities.slice(0, 180)}...`}
                        </p>
                        <p className="text-sm text-gray-600">
                          Qualifications:{" "}
                          {showFullDescription || watchedQualifications.length < 180
                            ? watchedQualifications || "-"
                            : `${watchedQualifications.slice(0, 180)}...`}
                        </p>
                        {watchedAbout.length >= 180 || watchedResponsibilities.length >= 180 || watchedQualifications.length >= 180 ? (
                          <button type="button" className="text-xs font-semibold text-[#0A66C2]" onClick={() => setShowFullDescription((value) => !value)}>
                            {showFullDescription ? "Show less" : "Show more"}
                          </button>
                        ) : null}
                        <p className="text-sm text-gray-600">Skills: {skillChips.length ? skillChips.join(", ") : "-"}</p>
                        <p className="text-sm text-gray-600">Benefits: {benefits.length ? benefits.join(", ") : "-"}</p>
                      </section>
                    </div>
                    <div className="rounded-xl bg-[#EDFDF3] p-3 text-sm text-green-700">
                      <p className="inline-flex items-center gap-2">
                        <Check className="h-4 w-4" />
                        Looks good! You&apos;re all set to post your job.
                      </p>
                    </div>
                  </div>
                ) : null}
                </div>

                <div className="shrink-0 border-t border-gray-200 bg-white px-8 py-4 shadow-[0_-8px_24px_-10px_rgba(15,23,42,0.12)]">
                  {currentStep === 1 ? (
                    <div className="flex items-center justify-between">
                      <Button type="button" variant="ghost" onClick={closeModal}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="border-[#0A66C2] bg-[#0A66C2] hover:bg-[#004182]"
                        onClick={() => {
                          if (validateStepOne()) setCurrentStep(2);
                        }}
                      >
                        Continue
                      </Button>
                    </div>
                  ) : null}
                  {currentStep === 2 ? (
                    <div className="flex justify-between">
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="secondary" onClick={() => setCurrentStep(1)}>
                          Back
                        </Button>
                        <Button type="button" variant="ghost" onClick={closeModal}>
                          Close
                        </Button>
                      </div>
                      <Button type="button" className="border-[#0A66C2] bg-[#0A66C2] hover:bg-[#004182]" onClick={() => setCurrentStep(3)}>
                        Continue
                      </Button>
                    </div>
                  ) : null}
                  {currentStep === 3 ? (
                    <div className="flex items-center justify-between">
                      <Button type="button" variant="secondary" className="min-w-[96px]" onClick={() => setCurrentStep(2)}>
                        Back
                      </Button>
                      <Button
                        type="button"
                        className="min-w-[120px] border-[#0A66C2] bg-[#0A66C2] hover:bg-[#004182]"
                        onClick={() => {
                          if (validateStepThree()) setCurrentStep(4);
                        }}
                      >
                        Continue
                      </Button>
                    </div>
                  ) : null}
                  {currentStep === 4 ? (
                    <div className="flex justify-between">
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="secondary" onClick={() => setCurrentStep(3)}>
                          Back
                        </Button>
                        <Button type="button" variant="ghost" onClick={closeModal}>
                          Close
                        </Button>
                      </div>
                      <Button type="submit" disabled={isSubmitting} className="border-[#0A66C2] bg-[#0A66C2] hover:bg-[#004182]">
                        {isSubmitting ? "Submitting…" : editingJob ? "Save job" : "Post job"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
