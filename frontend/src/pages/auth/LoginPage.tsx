import { useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { login } from "../../api/auth";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { authStore } from "../../context/AuthContext";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { LinkedInWordmark } from "../../components/layout/LinkedInWordmark";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = authStore((state) => state.setAuth);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError("");
    const loading = toast.loading("Signing in...");
    try {
      const data = await login(values);
      if (!data.token) throw new Error("Missing token");
      setAuth({ token: data.token, userId: data.user_id, role: data.role });
      toast.success("Signed in", { id: loading });
      navigate(data.role === "recruiter" ? "/recruiter/dashboard" : "/feed");
    } catch (submitError: unknown) {
      const message = getApiErrorMessage(submitError);
      setError(message || "Invalid email or password");
      toast.error(message || "Could not sign in", { id: loading });
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
              <form className="space-y-5" onSubmit={handleSubmit((values) => void onSubmit(values))}>
                {error ? <Alert message={error} /> : null}
                <p className="text-sm leading-6 text-[#4b4b4b]">
                  By clicking Continue, you agree to LinkedIn&apos;s User Agreement, Privacy Policy, and Cookie Policy.
                </p>
                <div>
                  <Input
                    {...register("email")}
                    placeholder="Email or phone"
                    className="h-[64px] rounded-[4px] border-[#888888] px-4 text-[17px] placeholder:text-[#666666] focus:shadow-none"
                  />
                </div>
                <div className="relative">
                  <Input
                    {...register("password")}
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    className="h-[64px] rounded-[4px] border-[#888888] px-4 pr-20 text-[17px] placeholder:text-[#666666] focus:shadow-none"
                  />
                  <button
                    type="button"
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-brand hover:underline"
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <Link to="/login" className="block text-[1.05rem] font-semibold text-brand hover:underline">
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
                  disabled={formState.isSubmitting}
                  className="h-[62px] rounded-full border-brand bg-brand text-[1.2rem] font-semibold hover:bg-[#005bb5]"
                >
                  Sign in
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
