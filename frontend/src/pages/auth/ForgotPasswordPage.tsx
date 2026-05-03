import { useNavigate } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { LinkedInWordmark } from "../../components/layout/LinkedInWordmark";
import { Button } from "../../components/ui/Button";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen bg-white px-6 py-8 text-[#1f1f1f]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1960px] flex-col">
        <LinkedInWordmark className="mb-10" />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[430px]">
            <Card className="rounded-[12px] border border-[#e0e0e0] px-7 py-8 shadow-[0_4px_18px_rgba(0,0,0,0.12)]">
              <h1 className="mb-4 text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-[#191919]">
                Forgot password
              </h1>
              <p className="mb-6 text-base leading-6 text-[#4b4b4b]">
                Self-service password reset is not available for this deployment. If you are locked out, contact your
                administrator or create a new account with a different email.
              </p>
              <Button
                fullWidth
                type="button"
                className="h-[52px] rounded-full text-lg font-semibold"
                onClick={() => navigate("/login")}
              >
                Back to Sign in
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
