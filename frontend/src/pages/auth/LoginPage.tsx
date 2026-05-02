import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { login } from "../../api/auth";
import {
  getApiErrorMessage,
  getHttpStatus,
  isNetworkApiError
} from "../../utils/getApiErrorMessage";
import { loginFormSchema } from "../../utils/authValidation";
import { authStore } from "../../context/AuthContext";
import { getHomePath } from "../../utils/navigation";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { LinkedInWordmark } from "../../components/layout/LinkedInWordmark";

type FormValues = z.infer<typeof loginFormSchema>;

function mapLoginFailureToMessage(error: unknown): string {
  if (isNetworkApiError(error)) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  const status = getHttpStatus(error);
  if (status === 401) return "Invalid email or password.";
  if (status === 429) {
    return "Too many sign-in attempts. Please wait a few minutes and try again.";
  }
  if (status === 502 || status === 503) {
    if (import.meta.env.DEV) {
      return "The backend is not reachable from the dev server. Start services (from the repo root: cd backend && docker compose up -d — auth listens on localhost:3001). If frontend/.env sets VITE_PROXY_GATEWAY=http://127.0.0.1:3000, start the gateway on port 3000 or remove VITE_PROXY_GATEWAY and restart npm run dev.";
    }
    return "The backend is not reachable. If you use Docker, ensure backend compose is up (auth port 3001 on the host) and rebuild the frontend so nginx can proxy. On Linux Docker, ensure API_HOST=host.docker.internal works or set frontend/docker-compose.yml extra_hosts (see comment in docker-compose.yml).";
  }
  if (status !== undefined && status >= 500) {
    return "Something went wrong on our end. Please try again in a moment.";
  }
  const fallback = getApiErrorMessage(error);
  if (fallback && fallback !== "Something went wrong") return fallback;
  return "Unable to sign in. Please try again.";
}

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = authStore((state) => state.setAuth);
  const emailId = useId();
  const passwordId = useId();
  const formErrorId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" }
  });

  async function onSubmit(values: FormValues) {
    setFormError("");
    try {
      const data = await login(values);
      if (!data.token) throw new Error("Missing token");
      setAuth({ token: data.token, userId: data.user_id, role: data.role });
      toast.success("Signed in");
      navigate(getHomePath(data.role));
    } catch (submitError: unknown) {
      setFormError(mapLoginFailureToMessage(submitError));
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-[#1f1f1f]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1960px] flex-col">
        <LinkedInWordmark className="mb-10" />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[430px]">
            <Card className="rounded-[12px] border border-[#e0e0e0] px-7 py-8 shadow-[0_4px_18px_rgba(0,0,0,0.12)]">
              <h1 className="mb-6 text-[3rem] font-semibold leading-none tracking-[-0.03em] text-[#191919]">Sign in</h1>
              <form
                className="space-y-5"
                onSubmit={handleSubmit((values) => void onSubmit(values))}
                noValidate
                aria-describedby={formError ? formErrorId : undefined}
              >
                {formError ? (
                  <div id={formErrorId}>
                    <Alert title="Sign-in failed" message={formError} />
                  </div>
                ) : null}
                <p className="text-sm leading-6 text-[#4b4b4b]">
                  By clicking Continue, you agree to LinkedIn&apos;s User Agreement, Privacy Policy, and Cookie Policy.
                </p>
                <div>
                  <label htmlFor={emailId} className="mb-1 block text-sm font-semibold text-[#444444]">
                    Email
                  </label>
                  <Input
                    id={emailId}
                    {...register("email")}
                    type="email"
                    autoComplete="email"
                    aria-invalid={errors.email ? true : undefined}
                    aria-describedby={errors.email ? `${emailId}-err` : undefined}
                    className="h-[64px] rounded-[4px] border-[#888888] px-4 text-[17px] focus:shadow-none"
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
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id={passwordId}
                      {...register("password")}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      aria-invalid={errors.password ? true : undefined}
                      aria-describedby={errors.password ? `${passwordId}-err` : undefined}
                      className="h-[64px] rounded-[4px] border-[#888888] px-4 pr-20 text-[17px] focus:shadow-none"
                    />
                    <button
                      type="button"
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-brand hover:underline"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  {errors.password?.message ? (
                    <p id={`${passwordId}-err`} className="mt-1.5 flex gap-1.5 text-sm text-red-700" role="alert">
                      <span aria-hidden>•</span>
                      <span>{errors.password.message}</span>
                    </p>
                  ) : null}
                </div>
                <Link to="/forgot-password" className="block text-[1.05rem] font-semibold text-brand hover:underline">
                  Forgot password?
                </Link>
                <label className="flex items-center gap-3 text-[1.05rem] text-[#1f1f1f]">
                  <input
                    type="checkbox"
                    checked={keepLoggedIn}
                    onChange={() => setKeepLoggedIn((current) => !current)}
                    className="h-6 w-6 rounded border-[#666666] accent-brand"
                  />
                  <span>Keep me logged in</span>
                </label>
                <Button
                  fullWidth
                  type="submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                  className="h-[62px] rounded-full border-brand bg-brand text-[1.2rem] font-semibold hover:bg-[#005bb5]"
                >
                  {isSubmitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </Card>
            <p className="mt-10 text-center text-[1.05rem] text-[#1f1f1f]">
              New to LinkedIn?{" "}
              <Link to="/register" className="font-semibold text-brand">
                Join now
              </Link>
            </p>
          </div>
        </div>
        <footer className="pt-8 text-center text-[0.95rem] text-[#666666]">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <span className="font-semibold text-[#1f1f1f]">LinkedIn</span>
            <span>&copy; 2026</span>
            <a href="/">User Agreement</a>
            <a href="/">Privacy Policy</a>
            <a href="/">Your California Privacy Choices</a>
            <a href="/">Community Guidelines</a>
            <a href="/">Cookie Policy</a>
            <a href="/">Copyright Policy</a>
            <a href="/">Send Feedback</a>
            <a href="/">Language</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
