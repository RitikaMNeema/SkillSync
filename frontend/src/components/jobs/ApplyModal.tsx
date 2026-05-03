import { CheckCircle2, Mail, MapPin, Phone, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { submitApplication } from "../../api/applications";
import { deleteResume, getMember, getResume, getResumeMeta, uploadResumeFile } from "../../api/members";
import { authStore } from "../../context/AuthContext";
import type { ResumeMeta } from "../../api/members";
import type { MemberProfile } from "../../types/member";
import type { Job } from "../../types/job";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

type FormErrors = Partial<Record<"resume" | "phone" | "location" | "portfolio" | "consent", string>>;

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

function isValidPhoneNumber(value: string): boolean {
  const digitsOnly = value.replace(/\D/g, "");
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
}

function isValidWebsite(value: string): boolean {
  try {
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(normalized);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function normalizeWebsite(value: string): string {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ApplyModal({
  job,
  open,
  onClose,
  onSubmitted
}: {
  job: Job;
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const userId = authStore((state) => state.userId);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [resumeUrl, setResumeUrl] = useState("");
  const [resumeMeta, setResumeMeta] = useState<ResumeMeta | null>(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeRemoving, setResumeRemoving] = useState(false);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null);
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [consentChecked, setConsentChecked] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(false);

  const hasResume = Boolean(resumeMeta || resumeUrl);
  const locationLine = location || [member?.location_city, member?.location_state, member?.location_country].filter(Boolean).join(", ");

  const topEducation = useMemo(() => (member?.education ?? []).slice(0, 2), [member?.education]);
  const topExperience = useMemo(() => (member?.experience ?? []).slice(0, 3), [member?.experience]);

  useEffect(() => {
    if (!open || !userId) return;
    setHydrating(true);
    void Promise.all([
      getMember(userId).catch(() => null),
      getResumeMeta(userId).catch(() => null),
      getResume(userId).catch(() => null)
    ])
      .then(([profile, meta, resume]) => {
        if (profile) {
          setMember(profile);
          setPhone(profile.phone ?? "");
          setPortfolioUrl(profile.website ?? "");
          const profileLocation = [profile.location_city, profile.location_state, profile.location_country].filter(Boolean).join(", ");
          setLocation(profileLocation);
        }
        setResumeMeta(meta);
        setResumeUrl(resume?.resume_url ?? "");
      })
      .finally(() => setHydrating(false));
  }, [open, userId]);

  if (!open) return null;

  function validateForm(): boolean {
    const nextErrors: FormErrors = {};
    if (!hasResume) nextErrors.resume = "Resume upload is required.";
    if (!phone.trim()) nextErrors.phone = "Phone number is required.";
    else if (!isValidPhoneNumber(phone)) nextErrors.phone = "Enter a valid phone number.";
    if (!location.trim()) nextErrors.location = "Location is required.";
    if (portfolioUrl.trim() && !isValidWebsite(portfolioUrl.trim())) nextErrors.portfolio = "Enter a valid website URL.";
    if (!consentChecked) nextErrors.consent = "You must authorize contact to submit this application.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleResumeFilePick(file: File) {
    if (!userId) return;
    if (!ALLOWED_FILE_TYPES.has(file.type)) {
      setErrors((current) => ({ ...current, resume: "Only PDF, DOC, or DOCX files are allowed." }));
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrors((current) => ({ ...current, resume: "File must be 5MB or smaller." }));
      return;
    }
    setErrors((current) => ({ ...current, resume: undefined }));
    const loadingToast = toast.loading("Uploading resume...");
    setResumeUploading(true);
    try {
      const uploadedMeta = await uploadResumeFile(userId, file);
      setResumeMeta(uploadedMeta);
      const resume = await getResume(userId).catch(() => null);
      setResumeUrl(resume?.resume_url ?? "");
      toast.success("Resume uploaded", { id: loadingToast });
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to upload resume"), { id: loadingToast });
    } finally {
      setResumeUploading(false);
    }
  }

  async function handleRemoveResume() {
    if (!userId) return;
    setResumeRemoving(true);
    const loadingToast = toast.loading("Removing resume...");
    try {
      await deleteResume(userId);
      setResumeMeta(null);
      setResumeUrl("");
      setErrors((current) => ({ ...current, resume: "Resume upload is required." }));
      toast.success("Resume removed", { id: loadingToast });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not remove resume"), { id: loadingToast });
    } finally {
      setResumeRemoving(false);
    }
  }

  async function handleSubmit() {
    if (!userId || submitting) return;
    if (!validateForm()) return;
    const loading = toast.loading("Submitting application...");
    setSubmitting(true);
    try {
      await submitApplication({
        job_id: job.job_id,
        member_id: userId,
        resume_url: resumeUrl || null,
        cover_letter: coverLetterFile ? `Uploaded file: ${coverLetterFile.name}` : null,
        answers: {
          phone: phone.trim(),
          location: location.trim(),
          portfolio_url: portfolioUrl.trim() ? normalizeWebsite(portfolioUrl.trim()) : "",
          notice_period: noticePeriod,
          contact_authorized: consentChecked ? "true" : "false",
          cover_letter_file: coverLetterFile?.name ?? ""
        }
      });
      toast.success("Application submitted", { id: loading });
      onSubmitted();
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to submit"), { id: loading });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-overlay px-3 py-4 backdrop-blur-sm md:px-5 md:py-6">
      <div className="mx-auto w-full max-w-[1240px] overflow-hidden rounded-card bg-white shadow-modal">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-4">
          <div className="space-y-2">
            <h3 className="text-[30px] font-semibold leading-tight text-[#1f1f1f]">Apply for this job</h3>
            <div className="flex items-center gap-2 text-sm leading-5">
              <span className="font-semibold text-[#1f1f1f]">{job.title}</span>
              <span className="text-text-secondary">-</span>
              <span className="text-text-secondary">{job.company_name || "Company"}</span>
            </div>
            <div className="flex flex-wrap gap-4 text-[12px] text-text-secondary">
              <span>{job.employment_type || "Employment type not specified"}</span>
              <span>{job.location || "Location not specified"} {job.work_mode ? `(${job.work_mode})` : ""}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
              <ShieldCheck className="h-4 w-4 text-[#0a66c2]" />
              Your application is secure
            </span>
            <Button variant="icon" onClick={onClose} aria-label="Close apply modal">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="border-r border-[#e5e7eb] px-6 py-4">
            <section className="border-b pb-4">
              <h4 className="text-base font-semibold text-[#1f1f1f]">Resume *</h4>
              <p className="mt-1 text-xs text-text-secondary">Add your resume to show your experience and skills.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#cfd6de] bg-[#fafbfd] p-4 text-center hover:bg-[#f3f7fb]">
                  <Upload className="mb-2 h-5 w-5 text-[#0a66c2]" />
                  <span className="text-sm font-semibold text-[#0a66c2]">{resumeUploading ? "Uploading..." : "Upload resume"}</span>
                  <span className="mt-1 text-xs text-text-secondary">PDF, DOC, DOCX (Max 5MB)</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void handleResumeFilePick(file);
                      event.currentTarget.value = "";
                    }}
                    disabled={resumeUploading}
                  />
                </label>
                <div className="min-h-[112px] rounded-lg border border-[#d9dee3] bg-white p-4">
                  {hasResume ? (
                    <div className="flex h-full items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f7a43]">
                          <CheckCircle2 className="h-4 w-4" />
                          Resume uploaded
                        </p>
                        <p className="mt-2 truncate text-sm text-[#1f1f1f]">{resumeMeta?.resume_file_name || "Saved resume"}</p>
                        <p className="mt-1 text-xs text-text-secondary">
                          {resumeMeta?.resume_content_type?.toUpperCase().replace("APPLICATION/", "") || "Ready to submit"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded p-1 text-text-secondary hover:bg-[#f4f4f5] hover:text-[#b91c1c]"
                        onClick={() => void handleRemoveResume()}
                        disabled={resumeRemoving}
                        aria-label="Remove resume"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-text-secondary">No resume uploaded yet.</p>
                  )}
                </div>
              </div>
              {errors.resume ? <p className="mt-2 text-xs text-[#b91c1c]">{errors.resume}</p> : null}
            </section>

            <section className="border-b py-4">
              <h4 className="text-base font-semibold text-[#1f1f1f]">Cover letter (optional)</h4>
              <p className="mt-1 text-xs text-text-secondary">Upload a file to tell the hiring team why you are a good fit.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#cfd6de] bg-[#fafbfd] p-4 text-center hover:bg-[#f3f7fb]">
                  <Upload className="mb-2 h-5 w-5 text-[#0a66c2]" />
                  <span className="text-sm font-semibold text-[#0a66c2]">Upload cover letter</span>
                  <span className="mt-1 text-xs text-text-secondary">PDF, DOC, DOCX (Max 5MB)</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (!file) {
                        event.currentTarget.value = "";
                        return;
                      }
                      if (file.size > MAX_FILE_SIZE_BYTES) {
                        toast.error("Cover letter must be 5MB or smaller.");
                        event.currentTarget.value = "";
                        return;
                      }
                      if (!ALLOWED_FILE_TYPES.has(file.type)) {
                        toast.error("Only PDF, DOC, or DOCX files are allowed.");
                        event.currentTarget.value = "";
                        return;
                      }
                      setCoverLetterFile(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <div className="min-h-[112px] rounded-lg border border-[#d9dee3] bg-white p-4">
                  {coverLetterFile ? (
                    <div className="flex h-full items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f7a43]">
                          <CheckCircle2 className="h-4 w-4" />
                          Cover letter uploaded
                        </p>
                        <p className="mt-2 truncate text-sm text-[#1f1f1f]">{coverLetterFile.name}</p>
                        <p className="mt-1 text-xs text-text-secondary">{Math.max(1, Math.round(coverLetterFile.size / 1024))} KB</p>
                      </div>
                      <button
                        type="button"
                        className="rounded p-1 text-text-secondary hover:bg-[#f4f4f5] hover:text-[#b91c1c]"
                        onClick={() => setCoverLetterFile(null)}
                        aria-label="Remove cover letter file"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-text-secondary">No cover letter uploaded.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="border-b py-4">
              <h4 className="text-base font-semibold text-[#1f1f1f]">Additional information</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="application-phone" className="mb-1 block text-sm font-semibold">
                    Phone number *
                  </label>
                  <Input
                    id="application-phone"
                    value={phone}
                    onChange={(event) => {
                      setPhone(event.target.value);
                      if (errors.phone) setErrors((current) => ({ ...current, phone: undefined }));
                    }}
                    aria-invalid={Boolean(errors.phone)}
                    className={errors.phone ? "border-[#b91c1c] focus-visible:ring-[#b91c1c]" : ""}
                  />
                  {errors.phone ? <p className="mt-1 text-xs text-[#b91c1c]">{errors.phone}</p> : null}
                </div>
                <div>
                  <label htmlFor="application-location" className="mb-1 block text-sm font-semibold">
                    Location *
                  </label>
                  <Input
                    id="application-location"
                    value={location}
                    onChange={(event) => {
                      setLocation(event.target.value);
                      if (errors.location) setErrors((current) => ({ ...current, location: undefined }));
                    }}
                    aria-invalid={Boolean(errors.location)}
                    className={errors.location ? "border-[#b91c1c] focus-visible:ring-[#b91c1c]" : ""}
                  />
                  {errors.location ? <p className="mt-1 text-xs text-[#b91c1c]">{errors.location}</p> : null}
                </div>
                <div>
                  <label htmlFor="application-portfolio" className="mb-1 block text-sm font-semibold">
                    Portfolio or website (optional)
                  </label>
                  <Input
                    id="application-portfolio"
                    value={portfolioUrl}
                    onChange={(event) => {
                      setPortfolioUrl(event.target.value);
                      if (errors.portfolio) setErrors((current) => ({ ...current, portfolio: undefined }));
                    }}
                    aria-invalid={Boolean(errors.portfolio)}
                    className={errors.portfolio ? "border-[#b91c1c] focus-visible:ring-[#b91c1c]" : ""}
                  />
                  {errors.portfolio ? <p className="mt-1 text-xs text-[#b91c1c]">{errors.portfolio}</p> : null}
                </div>
                <div>
                  <label htmlFor="application-notice-period" className="mb-1 block text-sm font-semibold">
                    Notice period (optional)
                  </label>
                  <select
                    id="application-notice-period"
                    value={noticePeriod}
                    onChange={(event) => setNoticePeriod(event.target.value)}
                    className="linkedin-input w-full"
                  >
                    <option value="">Select notice period</option>
                    <option value="immediately">Immediately</option>
                    <option value="2_weeks">2 weeks</option>
                    <option value="1_month">1 month</option>
                    <option value="2_months">2 months</option>
                    <option value="3_months_plus">3+ months</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="py-3.5">
              <label className="inline-flex items-start gap-2 text-sm text-[#1f1f1f]">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-[#94a3b8]"
                  checked={consentChecked}
                  onChange={(event) => {
                    setConsentChecked(event.target.checked);
                    if (errors.consent) setErrors((current) => ({ ...current, consent: undefined }));
                  }}
                />
                <span>I authorize {job.company_name || "this company"} to contact me about this application and future opportunities.</span>
              </label>
              {errors.consent ? <p className="mt-1 text-xs text-[#b91c1c]">{errors.consent}</p> : null}
              <p className="mt-2 text-xs text-text-secondary">You can update your preferences anytime in your account settings.</p>
            </section>

            <div className="flex items-center justify-between border-t pt-3.5">
              <span className="inline-flex items-center gap-2 text-xs text-text-secondary">
                <ShieldCheck className="h-4 w-4 text-[#0a66c2]" />
                We will never post anything without your permission.
              </span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={onClose} disabled={submitting || resumeUploading || resumeRemoving}>
                  Cancel
                </Button>
                <Button className="min-w-[180px] justify-center" onClick={() => void handleSubmit()} disabled={submitting || hydrating || resumeUploading || resumeRemoving}>
                  Submit application
                </Button>
              </div>
            </div>
          </div>

          <aside className="bg-[#fbfcfd] px-5 py-4">
            <section className="rounded-lg border border-[#e5e7eb] bg-white p-4">
              <h4 className="text-lg font-semibold text-[#1f1f1f]">LinkedIn information</h4>
              <p className="mt-1 text-xs text-text-secondary">We use this information to help speed up your application.</p>
            </section>

            <section className="mt-3 rounded-lg border border-[#e5e7eb] bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <h5 className="text-sm font-semibold text-[#1f1f1f]">Contact information</h5>
              </div>
              <div className="space-y-1.5 text-sm text-text-secondary">
                <p className="inline-flex items-center gap-2"><Mail className="h-4 w-4" />{member?.email || "Email not set"}</p>
                <p className="inline-flex items-center gap-2"><Phone className="h-4 w-4" />{phone || "Phone not set"}</p>
                <p className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" />{locationLine || "Location not set"}</p>
              </div>
            </section>

            <section className="mt-3 rounded-lg border border-[#e5e7eb] bg-white p-4">
              <h5 className="mb-2 text-sm font-semibold text-[#1f1f1f]">Education</h5>
              {topEducation.length ? (
                <div className="space-y-3">
                  {topEducation.map((edu, index) => (
                    <div key={`${edu.school ?? "school"}-${index}`} className="text-sm">
                      <p className="font-medium text-[#1f1f1f]">{edu.degree || edu.field || "Education"}</p>
                      <p className="text-text-secondary">{edu.school || "School not listed"}</p>
                      <p className="text-xs text-text-tertiary">{[edu.start_year, edu.end_year].filter(Boolean).join(" - ") || "Dates not listed"}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">No education information added yet.</p>
              )}
            </section>

            <section className="mt-3 rounded-lg border border-[#e5e7eb] bg-white p-4">
              <h5 className="mb-2 text-sm font-semibold text-[#1f1f1f]">Work experience</h5>
              {topExperience.length ? (
                <div className="space-y-3">
                  {topExperience.map((exp, index) => (
                    <div key={`${exp.company ?? "company"}-${index}`} className="text-sm">
                      <p className="font-medium text-[#1f1f1f]">{exp.title || "Role not listed"}</p>
                      <p className="text-text-secondary">{exp.company || "Company not listed"}</p>
                      <p className="text-xs text-text-tertiary">{[exp.start, exp.end].filter(Boolean).join(" - ") || "Dates not listed"}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">No experience information added yet.</p>
              )}
            </section>

          </aside>
        </div>
      </div>
    </div>
  );
}
