import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { login, logout, register as registerAuth } from "../../api/auth";
import {
  getApiErrorMessage,
  getHttpStatus,
  isNetworkApiError
} from "../../utils/getApiErrorMessage";
import {
  getPasswordRuleStatus,
  passwordRuleCopy,
  strongPasswordSchema
} from "../../utils/authValidation";
import { createMember } from "../../api/members";
import { createRecruiter } from "../../api/recruiters";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { LinkedInWordmark } from "../../components/layout/LinkedInWordmark";
import { authStore } from "../../context/AuthContext";

const registerBaseSchema = z.object({
  email: z.string().min(1, "Enter your email address").email("Enter a valid email address"),
  password: strongPasswordSchema,
  confirmPassword: z.string().min(1, "Confirm your password"),
  role: z.enum(["member", "recruiter"]),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  headline: z.string().optional(),
  name: z.string().optional(),
  companyName: z.string().optional(),
  companyIndustry: z.string().optional(),
  companySize: z.string().optional()
});

const schema = registerBaseSchema.refine((data) => data.password === data.confirmPassword, {
  message: "Passwords must match",
  path: ["confirmPassword"]
});

type FormValues = z.infer<typeof schema>;

function mapRegisterFailure(error: unknown): { title: string; message: string } {
  if (isNetworkApiError(error)) {
    return {
      title: "Connection problem",
      message: "Unable to reach the server. Check your connection and try again."
    };
  }
  const status = getHttpStatus(error);
  if (status === 409) {
    return {
      title: "Email already in use",
      message: "This email is already registered. Try signing in instead."
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
      message: "Your account may have been created, but your session expired while setting up your profile. Please sign in and try again."
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

const ruleOrder = ["minLength", "uppercase", "lowercase", "number", "special"] as const;

export function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = authStore((state) => state.setAuth);
  const clearAuth = authStore((state) => state.logout);
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const formErrorBoxId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState<{ title: string; message: string } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: "member", email: "", password: "", confirmPassword: "" }
  });
  const role = watch("role");
  const passwordValue = watch("password") ?? "";
  const ruleStatus = getPasswordRuleStatus(passwordValue);

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const auth = await registerAuth({ email: values.email, password: values.password, role: values.role });
      const session = await login({ email: values.email, password: values.password });
      if (!session.token) {
        throw new Error("Registration succeeded but login token was missing.");
      }

      setAuth({ token: session.token, userId: session.user_id, role: session.role });

      if (values.role === "member") {
        await createMember(
          {
            member_id: auth.user_id,
            first_name: values.firstName || "First",
            last_name: values.lastName || "Last",
            phone: values.phone,
            headline: values.headline,
            location_city: values.location
          },
          session.token
        );
      } else {
        await createRecruiter(
          {
            recruiter_id: auth.user_id,
            name: values.name || "Recruiter",
            email: values.email,
            phone: values.phone,
            role: "Recruiter",
            company: {
              name: values.companyName || "Company",
              industry: values.companyIndustry,
              size: values.companySize
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
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-[#1f1f1f]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1960px] flex-col">
        <LinkedInWordmark className="mb-10" />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[560px]">
            <Card className="rounded-[12px] border border-[#e0e0e0] px-7 py-8 shadow-[0_4px_18px_rgba(0,0,0,0.12)]">
              <h1 className="mb-2 text-[2.65rem] font-semibold leading-none tracking-[-0.03em] text-[#191919]">
                Join LinkedIn
              </h1>
              <p className="mb-6 text-base text-[#666666]">
                Build your profile and start networking, hiring, or applying faster.
              </p>
              <form
                className="space-y-4"
                onSubmit={handleSubmit((values) => void onSubmit(values))}
                noValidate
                aria-describedby={formError ? formErrorBoxId : undefined}
              >
                {formError ? (
                  <div id={formErrorBoxId}>
                    <Alert title={formError.title} message={formError.message} />
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor={emailId} className="mb-1 block text-sm font-semibold text-[#444444]">
                      Email <span className="text-red-700">*</span>
                    </label>
                    <Input
                      id={emailId}
                      {...register("email")}
                      type="email"
                      autoComplete="email"
                      aria-required
                      aria-invalid={errors.email ? true : undefined}
                      aria-describedby={errors.email ? `${emailId}-err` : undefined}
                      className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none"
                    />
                    {errors.email?.message ? (
                      <p id={`${emailId}-err`} className="mt-1.5 flex gap-1.5 text-sm text-red-700" role="alert">
                        <span aria-hidden>•</span>
                        <span>{errors.email.message}</span>
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor={passwordId} className="mb-1 block text-sm font-semibold text-[#444444]">
                      Password <span className="text-red-700">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        id={passwordId}
                        {...register("password")}
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        aria-required
                        aria-invalid={errors.password ? true : undefined}
                        aria-describedby={`${passwordId}-hints ${errors.password ? `${passwordId}-err` : ""}`.trim()}
                        className="h-[56px] rounded-[4px] border-[#888888] px-4 pr-20 focus:shadow-none"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-brand hover:underline"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <ul
                      id={`${passwordId}-hints`}
                      className="mt-2 space-y-1 text-sm text-[#4b4b4b]"
                      aria-label="Password requirements"
                    >
                      {ruleOrder.map((key) => {
                        const ok = ruleStatus[key];
                        const label = passwordRuleCopy[key];
                        return (
                          <li key={key} className="flex gap-2">
                            <span aria-hidden>{ok ? "✓" : "○"}</span>
                            <span className={ok ? "text-[#1f1f1f]" : undefined}>
                              {label}
                              {ok ? <span className="sr-only"> — satisfied</span> : <span className="sr-only"> — not yet</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    {errors.password?.message ? (
                      <p id={`${passwordId}-err`} className="mt-1.5 flex gap-1.5 text-sm text-red-700" role="alert">
                        <span aria-hidden>•</span>
                        <span>{errors.password.message}</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <label htmlFor={confirmId} className="mb-1 block text-sm font-semibold text-[#444444]">
                    Confirm password <span className="text-red-700">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      id={confirmId}
                      {...register("confirmPassword")}
                      type={showConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      aria-required
                      aria-invalid={errors.confirmPassword ? true : undefined}
                      aria-describedby={errors.confirmPassword ? `${confirmId}-err` : undefined}
                      className="h-[56px] rounded-[4px] border-[#888888] px-4 pr-20 focus:shadow-none"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-brand hover:underline"
                      onClick={() => setShowConfirm((v) => !v)}
                      aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                      aria-pressed={showConfirm}
                    >
                      {showConfirm ? "Hide" : "Show"}
                    </button>
                  </div>
                  {errors.confirmPassword?.message ? (
                    <p id={`${confirmId}-err`} className="mt-1.5 flex gap-1.5 text-sm text-red-700" role="alert">
                      <span aria-hidden>•</span>
                      <span>{errors.confirmPassword.message}</span>
                    </p>
                  ) : null}
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-[#444444]">I&apos;m a</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      ["member", "Job Seeker"],
                      ["recruiter", "Recruiter / Employer"]
                    ].map(([value, label]) => (
                      <label
                        key={value}
                        className={`cursor-pointer rounded-[10px] border px-4 py-4 ${
                          role === value ? "border-2 border-brand bg-[#eef5fc]" : "border-[#c9c9c9] bg-white"
                        }`}
                      >
                        <input type="radio" value={value} {...register("role")} className="sr-only" />
                        <span className="font-semibold">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {role === "member" ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        {...register("firstName")}
                        placeholder="First name"
                        className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none"
                      />
                      <Input
                        {...register("lastName")}
                        placeholder="Last name"
                        className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none"
                      />
                    </div>
                    <Input
                      {...register("phone")}
                      placeholder="Phone"
                      className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none"
                    />
                    <Input
                      {...register("location")}
                      placeholder="Location"
                      className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none"
                    />
                    <Input
                      {...register("headline")}
                      placeholder="Headline"
                      className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none"
                    />
                  </>
                ) : (
                  <>
                    <Input
                      {...register("name")}
                      placeholder="Your name"
                      className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none"
                    />
                    <Input
                      {...register("phone")}
                      placeholder="Phone"
                      className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none"
                    />
                    <Input
                      {...register("companyName")}
                      placeholder="Company name"
                      className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none"
                    />
                    <Input
                      {...register("companyIndustry")}
                      placeholder="Company industry"
                      className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none"
                    />
                    <Input
                      {...register("companySize")}
                      placeholder="Company size"
                      className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none"
                    />
                  </>
                )}
                <p className="text-sm leading-6 text-[#4b4b4b]">
                  By clicking Agree &amp; Join, you agree to LinkedIn&apos;s User Agreement, Privacy Policy, and Cookie
                  Policy.
                </p>
                <Button
                  fullWidth
                  type="submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                  className="h-[58px] rounded-full text-lg font-semibold"
                >
                  {isSubmitting ? "Creating account…" : "Agree & Join"}
                </Button>
              </form>
            </Card>
            <p className="mt-8 text-center text-[1.05rem] text-[#1f1f1f]">
              Already on LinkedIn?{" "}
              <Link to="/login" className="font-semibold text-brand">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
