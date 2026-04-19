import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { login, logout, register as registerAuth } from "../../api/auth";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { createMember } from "../../api/members";
import { createRecruiter } from "../../api/recruiters";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { LinkedInWordmark } from "../../components/layout/LinkedInWordmark";
import { authStore } from "../../context/AuthContext";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
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

type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = authStore((state) => state.setAuth);
  const clearAuth = authStore((state) => state.logout);
  const { register, handleSubmit, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: "member" }
  });
  const role = watch("role");

  async function onSubmit(values: FormValues) {
    const loading = toast.loading("Creating account...");
    try {
      const auth = await registerAuth({ email: values.email, password: values.password, role: values.role });
      const session = await login({ email: values.email, password: values.password });
      if (!session.token) {
        throw new Error("Registration succeeded but login token was missing.");
      }

      setAuth({ token: session.token, userId: session.user_id, role: session.role });

      if (values.role === "member") {
        await createMember({
          member_id: auth.user_id,
          first_name: values.firstName || "First",
          last_name: values.lastName || "Last",
          phone: values.phone,
          headline: values.headline,
          location_city: values.location
        });
      } else {
        await createRecruiter({
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
        });
      }

      await logout().catch(() => undefined);
      clearAuth();
      toast.success("Account created", { id: loading });
      navigate("/login");
    } catch (error: unknown) {
      clearAuth();
      toast.error(getApiErrorMessage(error), { id: loading });
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-[#1f1f1f]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1960px] flex-col">
        <LinkedInWordmark className="mb-10" />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[560px]">
            <Card className="rounded-[12px] border border-[#e0e0e0] px-7 py-8 shadow-[0_4px_18px_rgba(0,0,0,0.12)]">
              <h1 className="mb-2 text-[2.65rem] font-semibold leading-none tracking-[-0.03em] text-[#191919]">Join LinkedIn</h1>
              <p className="mb-6 text-base text-[#666666]">Build your profile and start networking, hiring, or applying faster.</p>
              <form className="space-y-4" onSubmit={handleSubmit((values) => void onSubmit(values))}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-[#444444]">Email</label>
                    <Input {...register("email")} className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-[#444444]">Password</label>
                    <Input type="password" {...register("password")} className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none" />
                  </div>
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
                      <Input {...register("firstName")} placeholder="First name" className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none" />
                      <Input {...register("lastName")} placeholder="Last name" className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none" />
                    </div>
                    <Input {...register("phone")} placeholder="Phone" className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none" />
                    <Input {...register("location")} placeholder="Location" className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none" />
                    <Input {...register("headline")} placeholder="Headline" className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none" />
                  </>
                ) : (
                  <>
                    <Input {...register("name")} placeholder="Your name" className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none" />
                    <Input {...register("phone")} placeholder="Phone" className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none" />
                    <Input {...register("companyName")} placeholder="Company name" className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none" />
                    <Input {...register("companyIndustry")} placeholder="Company industry" className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none" />
                    <Input {...register("companySize")} placeholder="Company size" className="h-[56px] rounded-[4px] border-[#888888] px-4 focus:shadow-none" />
                  </>
                )}
                <p className="text-sm leading-6 text-[#4b4b4b]">
                  By clicking Agree &amp; Join, you agree to LinkedIn&apos;s User Agreement, Privacy Policy, and Cookie Policy.
                </p>
                <Button fullWidth type="submit" className="h-[58px] rounded-full text-lg font-semibold">
                  Agree &amp; Join
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
