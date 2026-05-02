import { useCallback, useId, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { checkEmailExists, login, logout, register as registerAuth } from "../../api/auth";
import { createMember } from "../../api/members";
import { createRecruiter } from "../../api/recruiters";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { OnboardingLayout } from "../../components/auth/OnboardingLayout";
import {
  headlineStepSchema,
  joinStepSchema,
  locationWithOptionalPhoneStepSchema,
  memberExperienceStepSchema,
  nameStepSchema,
  organizationStepSchema
} from "./registerWizardSchemas";
import {
  getApiErrorMessage,
  getHttpStatus,
  isNetworkApiError
} from "../../utils/getApiErrorMessage";
import {
  getPasswordRuleStatus,
  passwordRuleCopy,
  PASSWORD_MIN_LENGTH
} from "../../utils/authValidation";
import { authStore } from "../../context/AuthContext";
import type { UserRole } from "../../types/common";

type WizardData = {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isStudent: boolean;
  jobTitle: string;
  company: string;
  school: string;
  fieldOfStudy: string;
  startYear: string;
  ageConfirmed: boolean;
  location: string;
  headline: string;
  companyName: string;
  companyIndustry: string;
  companySize: string;
  phone: string;
};

function initialWizardData(): WizardData {
  const y = new Date().getFullYear();
  return {
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    role: "member",
    isStudent: false,
    jobTitle: "",
    company: "",
    school: "",
    fieldOfStudy: "",
    startYear: String(y),
    ageConfirmed: false,
    location: "",
    headline: "",
    companyName: "",
    companyIndustry: "",
    companySize: "",
    phone: ""
  };
}

function stepCount(role: UserRole): number {
  return role === "recruiter" ? 6 : 7;
}

type StepKind =
  | "join"
  | "name"
  | "role"
  | "experience"
  | "organization"
  | "location"
  | "headline"
  | "review";

function stepKind(role: UserRole, stepIndex: number): StepKind | null {
  if (stepIndex === 0) return "join";
  if (stepIndex === 1) return "name";
  if (stepIndex === 2) return "role";
  if (role === "member") {
    if (stepIndex === 3) return "experience";
    if (stepIndex === 4) return "location";
    if (stepIndex === 5) return "headline";
    if (stepIndex === 6) return "review";
  } else {
    if (stepIndex === 3) return "organization";
    if (stepIndex === 4) return "location";
    if (stepIndex === 5) return "review";
  }
  return null;
}

function validateStep(kind: StepKind, d: WizardData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (kind === "join") {
    const r = joinStepSchema.safeParse({
      email: d.email,
      password: d.password,
      confirmPassword: d.confirmPassword
    });
    if (!r.success) {
      for (const issue of r.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") errors[key] = issue.message;
      }
    }
  }
  if (kind === "name") {
    const r = nameStepSchema.safeParse({ firstName: d.firstName, lastName: d.lastName });
    if (!r.success) {
      r.error.flatten().fieldErrors.firstName?.forEach((m) => {
        errors.firstName = m;
      });
      r.error.flatten().fieldErrors.lastName?.forEach((m) => {
        errors.lastName = m;
      });
    }
  }
  if (kind === "experience") {
    const r = memberExperienceStepSchema.safeParse({
      isStudent: d.isStudent,
      jobTitle: d.jobTitle,
      company: d.company,
      school: d.school,
      fieldOfStudy: d.fieldOfStudy,
      startYear: d.startYear,
      ageConfirmed: d.ageConfirmed
    });
    if (!r.success) {
      const flat = r.error.flatten().fieldErrors;
      Object.entries(flat).forEach(([k, v]) => {
        if (v?.[0]) errors[k] = v[0];
      });
      r.error.issues.forEach((e) => {
        const key = String(e.path[0] ?? "");
        if (key && !errors[key]) errors[key] = e.message;
      });
    }
  }
  if (kind === "location") {
    const r = locationWithOptionalPhoneStepSchema.safeParse({
      location: d.location,
      phone: d.phone ?? ""
    });
    if (!r.success) {
      for (const issue of r.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") errors[key] = issue.message;
      }
    }
  }
  if (kind === "headline") {
    const r = headlineStepSchema.safeParse({ headline: d.headline });
    if (!r.success) {
      for (const issue of r.error.issues) {
        if (issue.path[0] === "headline") errors.headline = issue.message;
      }
      if (!errors.headline) errors.headline = r.error.issues[0]?.message ?? "Invalid headline";
    }
  }
  if (kind === "organization") {
    const r = organizationStepSchema.safeParse({
      companyName: d.companyName,
      companyIndustry: d.companyIndustry || undefined,
      companySize: d.companySize || undefined
    });
    if (!r.success) {
      const flat = r.error.flatten().fieldErrors;
      Object.entries(flat).forEach(([k, v]) => {
        if (v?.[0]) errors[k] = v[0];
      });
    }
  }
  return errors;
}

function mapRegisterFailure(error: unknown): { title: string; message: string } {
  if (isNetworkApiError(error)) {
    return {
      title: "Connection problem",
      message: "Unable to reach the server. Check your connection and try again."
    };
  }
  const status = getHttpStatus(error);
  if (status === 409) {
    const detail409 = getApiErrorMessage(error);
    return {
      title: "Already exists",
      message:
        detail409 ||
        "This email or profile may already exist. Try signing in, or use a different email address."
    };
  }
  if (status === 429) {
    return {
      title: "Too many attempts",
      message: "Too many requests. Please wait a few minutes and try again."
    };
  }
  if (status === 401) {
    return {
      title: "Session expired",
      message:
        "Your account may have been created, but your session expired while setting up your profile. Please sign in and try again."
    };
  }
  if (status === 502 || status === 503) {
    const detail = getApiErrorMessage(error);
    return {
      title: "Service unavailable",
      message:
        detail ||
        "The API could not reach a required service (for example the recruiter service). Start all backend services, or if you use the central gateway, ensure RECRUITER_SERVICE_URL points at a running recruiter process (often port 3003 in development)."
    };
  }
  if (status === 403) {
    return {
      title: "Not allowed",
      message: getApiErrorMessage(error) || "You are not allowed to perform this action with the current account."
    };
  }
  if (status !== undefined && status >= 500) {
    return {
      title: "Server error",
      message: "Something went wrong on our end. Please try again in a moment."
    };
  }
  const detail = getApiErrorMessage(error);
  return {
    title: "Could not create account",
    message: detail || "Please check your information and try again."
  };
}

const YEAR_OPTIONS = (() => {
  const end = new Date().getFullYear() + 6;
  const start = 1950;
  const ys: number[] = [];
  for (let y = end; y >= start; y -= 1) ys.push(y);
  return ys;
})();

const ruleOrder = ["minLength", "uppercase", "lowercase", "number", "special"] as const;

export function RegisterWizard() {
  const navigate = useNavigate();
  const setAuth = authStore((state) => state.setAuth);
  const clearAuth = authStore((state) => state.logout);
  const formErrorBoxId = useId();

  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(() => initialWizardData());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  const totalSteps = stepCount(data.role);
  const kind = stepKind(data.role, step);
  const progress = totalSteps > 0 ? Math.min((step + 1) / totalSteps, 1) : 0;

  const update = useCallback(<K extends keyof WizardData>(key: K, value: WizardData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }, []);

  const pwdStatus = useMemo(() => getPasswordRuleStatus(data.password ?? ""), [data.password]);

  function goBack() {
    if (step <= 0) return;
    setStep((s) => s - 1);
    setErrors({});
    setFormError(null);
  }

  async function advance() {
    if (!kind || kind === "review") return;
    setFormError(null);
    const nextErrors = validateStep(kind, data);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    if (kind === "join") {
      try {
        const result = await checkEmailExists(data.email.trim());
        if (result.exists) {
          setErrors({ email: "Email already registered" });
          return;
        }
      } catch (error: unknown) {
        setFormError(mapRegisterFailure(error));
        return;
      }
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, stepCount(data.role) - 1));
  }

  async function submitAll() {
    setFormError(null);
    setSubmitting(true);
    try {
      const auth = await registerAuth({
        email: data.email.trim(),
        password: data.password,
        role: data.role
      });
      const session = await login({
        email: data.email.trim(),
        password: data.password
      });
      if (!session.token) throw new Error("Registration succeeded but login token was missing.");

      setAuth({ token: session.token, userId: session.user_id, role: session.role });

      if (data.role === "member") {
        const headline = data.headline.trim();
        const experience =
          data.isStudent || (!data.jobTitle.trim() && !data.company.trim())
            ? []
            : [
                {
                  title: data.jobTitle.trim(),
                  company: data.company.trim(),
                  is_current: true as const
                }
              ];
        const education =
          data.isStudent && data.school.trim()
            ? [
                {
                  school: data.school.trim(),
                  field_of_study: data.fieldOfStudy.trim(),
                  start_year: Number.parseInt(data.startYear, 10) || undefined
                }
              ]
            : [];

        const phone = data.phone.trim();
        await createMember(
          {
            member_id: auth.user_id,
            first_name: data.firstName.trim(),
            last_name: data.lastName.trim(),
            phone: phone ? phone.slice(0, 30) : null,
            headline,
            location_city: data.location.trim() || null,
            experience,
            education
          },
          session.token
        );
      } else {
        const fullName = `${data.firstName} ${data.lastName}`.trim() || "Recruiter";
        await createRecruiter(
          {
            recruiter_id: auth.user_id,
            name: fullName,
            email: data.email.trim(),
            phone: data.phone.trim() || undefined,
            role: "Recruiter",
            company: {
              name: data.companyName.trim(),
              industry: data.companyIndustry.trim() || undefined,
              size: data.companySize.trim() || undefined,
              location: data.location.trim() || undefined
            }
          },
          session.token
        );
      }

      await logout().catch(() => undefined);
      clearAuth();
      toast.success("Account created. You can sign in now.");
      navigate("/login");
    } catch (error: unknown) {
      clearAuth();
      setFormError(mapRegisterFailure(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!kind) return null;

  const showBack = step > 0;
  const isReview = kind === "review";
  const titleDesc = layoutCopy(kind, data.role);

  return (
    <OnboardingLayout
      progress={progress}
      totalSteps={totalSteps}
      currentStepIndex={step}
      showBack={showBack && !submitting}
      onBack={goBack}
      title={titleDesc.title}
      description={titleDesc.description}
      footer={
        <p className="mt-6 text-center text-[1rem] text-[#1f1f1f]">
          Already on LinkedIn?{" "}
          <Link to="/login" className="font-semibold text-[#0a66c2] hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      {formError ? (
        <div id={formErrorBoxId} className="mb-4">
          <Alert title={formError.title} message={formError.message} />
        </div>
      ) : null}

      <div className="space-y-5">
        {kind === "join" ? (
          <JoinFields
            data={data}
            errors={errors}
            update={update}
            showPw={showPw}
            setShowPw={setShowPw}
            showPw2={showPw2}
            setShowPw2={setShowPw2}
            pwdStatus={pwdStatus}
          />
        ) : null}

        {kind === "name" ? (
          <div className="flex flex-col gap-5">
            <Field
              label="First name"
              required
              autoFocus
              value={data.firstName}
              onChange={(v) => update("firstName", v)}
              error={errors.firstName}
              autoComplete="given-name"
            />
            <Field
              label="Last name"
              required
              value={data.lastName}
              onChange={(v) => update("lastName", v)}
              error={errors.lastName}
              autoComplete="family-name"
            />
          </div>
        ) : null}

        {kind === "role" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["member", "Job seeker"],
                ["recruiter", "Recruiter / employer"]
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => update("role", value)}
                className={`rounded-lg border px-4 py-4 text-left text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a66c2] ${
                  data.role === value
                    ? "border-2 border-[#0a66c2] bg-[#eef5fc]"
                    : "border border-[#c9c9c9] bg-white hover:border-[#a8a8a8]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {kind === "experience" ? (
          <ExperienceFields data={data} errors={errors} update={update} />
        ) : null}

        {kind === "location" ? (
          <div className="flex flex-col gap-5">
            <Field
              label={data.role === "recruiter" ? "Office location" : "Location"}
              required
              autoFocus
              hint={
                data.role === "recruiter"
                  ? "City, region, or address where your organization is based."
                  : "This helps us recommend people, jobs and news in your area."
              }
              value={data.location}
              onChange={(v) => update("location", v)}
              error={errors.location}
              autoComplete={data.role === "recruiter" ? "organization" : "address-level2"}
            />
            <Field
              label="Phone number"
              hint={
                data.role === "recruiter"
                  ? "Optional — useful for account recovery and candidate contact."
                  : "Optional — useful for account recovery and how others may reach you."
              }
              value={data.phone}
              onChange={(v) => update("phone", v)}
              error={errors.phone}
              autoComplete="tel"
            />
          </div>
        ) : null}

        {kind === "headline" ? (
          <Field
            label="Headline"
            required
            autoFocus
            value={data.headline}
            onChange={(v) => update("headline", v)}
            error={errors.headline}
          />
        ) : null}

        {kind === "organization" ? (
          <div className="space-y-4">
            <Field
              label="Company name"
              required
              autoFocus
              value={data.companyName}
              onChange={(v) => update("companyName", v)}
              error={errors.companyName}
            />
            <Field
              label="Industry"
              value={data.companyIndustry}
              onChange={(v) => update("companyIndustry", v)}
            />
            <Field
              label="Company size"
              value={data.companySize}
              onChange={(v) => update("companySize", v)}
            />
          </div>
        ) : null}

        {kind === "review" ? (
          <ReviewPanel data={data} />
        ) : null}

        {!isReview ? (
          <Button
            type="button"
            fullWidth
            disabled={submitting}
            onClick={() => void advance()}
            className="h-12 rounded-full text-base font-semibold"
          >
            Continue
          </Button>
        ) : (
          <>
            <p className="text-sm leading-6 text-[#4b4b4b]">
              By clicking Agree &amp; Join, you agree to LinkedIn&apos;s User Agreement, Privacy Policy, and Cookie Policy.
            </p>
            <Button
              type="button"
              fullWidth
              disabled={submitting}
              aria-busy={submitting}
              onClick={() => void submitAll()}
              className="h-12 rounded-full text-base font-semibold"
            >
              {submitting ? "Creating account…" : "Agree & Join"}
            </Button>
          </>
        )}
      </div>
    </OnboardingLayout>
  );
}

function layoutCopy(kind: StepKind, role: UserRole): { title: string; description?: string } {
  switch (kind) {
    case "join":
      return {
        title: "Join LinkedIn — it’s free!",
        description: "Create your account with email and password. You’ll finish your profile in the next steps."
      };
    case "name":
      return { title: "Add your name", description: "This is how you’ll appear to others." };
    case "role":
      return { title: "How do you want to use LinkedIn?", description: "You can change this later in settings." };
    case "experience":
      return {
        title: "What’s your most recent experience?",
        description: "You can always change this later."
      };
    case "location":
      if (role === "recruiter") {
        return {
          title: "Office location & phone",
          description: "Share where your organization is based. Phone is optional."
        };
      }
      return {
        title: "Location & phone",
        description: "Your location helps with jobs and recommendations. Phone is optional."
      };
    case "headline":
      return {
        title: "Add a headline",
        description: "A short professional headline helps others understand what you do."
      };
    case "organization":
      return {
        title: "Tell us about your organization",
        description: "This helps candidates understand your company."
      };
    case "review":
      return {
        title: "Review and join",
        description: "Confirm your details and create your account."
      };
    default:
      return { title: "" };
  }
}

function JoinFields({
  data,
  errors,
  update,
  showPw,
  setShowPw,
  showPw2,
  setShowPw2,
  pwdStatus
}: {
  data: WizardData;
  errors: Record<string, string>;
  update: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
  showPw: boolean;
  setShowPw: (v: boolean) => void;
  showPw2: boolean;
  setShowPw2: (v: boolean) => void;
  pwdStatus: ReturnType<typeof getPasswordRuleStatus>;
}) {
  return (
    <>
      <Field
        label="Email"
        required
        autoFocus
        value={data.email}
        onChange={(v) => update("email", v)}
        error={errors.email}
        type="email"
        autoComplete="email"
      />
      <div>
        <label className="mb-1 block text-sm font-semibold text-[#444444]">
          Password <span className="text-red-700">*</span>
        </label>
        <div className="relative">
          <Input
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            value={data.password}
            onChange={(e) => update("password", e.target.value)}
            aria-invalid={errors.password ? true : undefined}
            className="h-12 rounded-[4px] border-[#888888] px-4 pr-20 focus:shadow-none"
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#0a66c2] hover:underline"
            onClick={() => setShowPw(!showPw)}
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? "Hide" : "Show"}
          </button>
        </div>
        {errors.password ? (
          <p className="mt-1.5 text-sm text-red-700" role="alert">
            {errors.password}
          </p>
        ) : null}
        <ul className="mt-3 space-y-1.5 text-sm text-[#4b4b4b]" aria-label="Password requirements">
          {ruleOrder.map((key) => {
            const ok = pwdStatus[key];
            const label =
              key === "minLength"
                ? `At least ${PASSWORD_MIN_LENGTH} characters`
                : passwordRuleCopy[key];
            return (
              <li key={key} className="flex gap-2">
                <span aria-hidden className={ok ? "text-[#057642]" : "text-[#999]"}>
                  {ok ? "✓" : "○"}
                </span>
                <span className={ok ? "text-[#1f1f1f]" : undefined}>
                  {label}
                  {ok ? <span className="sr-only"> — satisfied</span> : <span className="sr-only"> — not yet</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-[#444444]">
          Confirm password <span className="text-red-700">*</span>
        </label>
        <div className="relative">
          <Input
            type={showPw2 ? "text" : "password"}
            autoComplete="new-password"
            value={data.confirmPassword}
            onChange={(e) => update("confirmPassword", e.target.value)}
            aria-invalid={errors.confirmPassword ? true : undefined}
            className="h-12 rounded-[4px] border-[#888888] px-4 pr-20 focus:shadow-none"
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#0a66c2] hover:underline"
            onClick={() => setShowPw2(!showPw2)}
            aria-label={showPw2 ? "Hide confirm password" : "Show confirm password"}
          >
            {showPw2 ? "Hide" : "Show"}
          </button>
        </div>
        {errors.confirmPassword ? (
          <p className="mt-1.5 text-sm text-red-700" role="alert">
            {errors.confirmPassword}
          </p>
        ) : null}
      </div>
    </>
  );
}

function ExperienceFields({
  data,
  errors,
  update
}: {
  data: WizardData;
  errors: Record<string, string>;
  update: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-[#ebebeb] pb-4">
        <span className="text-base font-medium text-[#191919]">I&apos;m a student</span>
        <button
          type="button"
          role="switch"
          aria-checked={data.isStudent}
          onClick={() => update("isStudent", !data.isStudent)}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a66c2] ${
            data.isStudent ? "bg-[#057642]" : "bg-[#ccc]"
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
              data.isStudent ? "left-7" : "left-1"
            }`}
          />
          <span className="sr-only">{data.isStudent ? "Student mode on" : "Student mode off"}</span>
        </button>
      </div>

      {!data.isStudent ? (
        <div className="space-y-4 pt-2">
          <Field
            label="Job title"
            required
            autoFocus
            value={data.jobTitle}
            onChange={(v) => update("jobTitle", v)}
            error={errors.jobTitle}
          />
          <Field
            label="Company or employer"
            required
            value={data.company}
            onChange={(v) => update("company", v)}
            error={errors.company}
          />
        </div>
      ) : (
        <div className="space-y-4 pt-2">
          <Field
            label="School, college or university"
            required
            autoFocus
            value={data.school}
            onChange={(v) => update("school", v)}
            error={errors.school}
          />
          <Field
            label="Field of study"
            required
            value={data.fieldOfStudy}
            onChange={(v) => update("fieldOfStudy", v)}
            error={errors.fieldOfStudy}
          />
          <div>
            <label className="mb-1 block text-sm font-semibold text-[#444444]" htmlFor="start-year">
              Start year <span className="text-red-700">*</span>
            </label>
            <select
              id="start-year"
              value={data.startYear}
              onChange={(e) => update("startYear", e.target.value)}
              className="h-12 w-full rounded-[4px] border border-[#888888] bg-white px-3 text-base text-[#191919] focus:border-[#0a66c2] focus:outline-none focus:ring-1 focus:ring-[#0a66c2]"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
            {errors.startYear ? (
              <p className="mt-1.5 text-sm text-red-700" role="alert">
                {errors.startYear}
              </p>
            ) : null}
          </div>
          <label className="flex cursor-pointer items-start gap-3 pt-1">
            <input
              type="checkbox"
              checked={data.ageConfirmed}
              onChange={(e) => update("ageConfirmed", e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[#888888] text-[#057642] focus:ring-[#0a66c2]"
            />
            <span className="text-sm leading-snug text-[#191919]">I&apos;m over 16 years of age</span>
          </label>
          {errors.ageConfirmed ? (
            <p className="text-sm text-red-700" role="alert">
              {errors.ageConfirmed}
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}

function ReviewPanel({ data }: { data: WizardData }) {
  return (
    <ul className="space-y-3 text-sm text-[#333]">
      <li>
        <span className="font-semibold text-[#191919]">Email:</span> {data.email}
      </li>
      <li>
        <span className="font-semibold text-[#191919]">Name:</span> {data.firstName} {data.lastName}
      </li>
      <li>
        <span className="font-semibold text-[#191919]">Account type:</span>{" "}
        {data.role === "member" ? "Job seeker" : "Recruiter / employer"}
      </li>
      {data.role === "member" ? (
        <>
          <li>
            <span className="font-semibold text-[#191919]">Location:</span> {data.location || "—"}
          </li>
          {data.phone.trim() ? (
            <li>
              <span className="font-semibold text-[#191919]">Phone:</span> {data.phone}
            </li>
          ) : null}
          <li>
            <span className="font-semibold text-[#191919]">Headline:</span> {data.headline || "—"}
          </li>
          <li>
            <span className="font-semibold text-[#191919]">Recent experience:</span>{" "}
            {data.isStudent
              ? `Student at ${data.school} — ${data.fieldOfStudy} (${data.startYear})`
              : `${data.jobTitle} at ${data.company}`}
          </li>
        </>
      ) : (
        <>
          <li>
            <span className="font-semibold text-[#191919]">Company:</span> {data.companyName}
          </li>
          <li>
            <span className="font-semibold text-[#191919]">Office location:</span> {data.location.trim() || "—"}
          </li>
          {data.phone.trim() ? (
            <li>
              <span className="font-semibold text-[#191919]">Phone:</span> {data.phone}
            </li>
          ) : null}
        </>
      )}
    </ul>
  );
}

type FieldProps = {
  label: string;
  required?: boolean;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  /** Focus on mount when this step becomes visible */
  autoFocus?: boolean;
};

function Field({
  label,
  required,
  hint,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
  autoFocus
}: FieldProps) {
  const inputId = useId();
  const errId = useId();
  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-sm font-semibold text-[#444444]">
        {label}
        {required ? <span className="text-red-700"> *</span> : null}
      </label>
      {hint ? <p className="mb-2 text-sm text-[#666666]">{hint}</p> : null}
      <Input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        className="h-12 rounded-[4px] border-[#888888] px-4 focus:shadow-none"
      />
      {error ? (
        <p id={errId} className="mt-1.5 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
