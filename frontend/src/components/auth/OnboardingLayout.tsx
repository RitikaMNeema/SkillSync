import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { APP_SHELL_MAIN_COLUMN_CLASS } from "../../constants/appShellLayout";
import { cn } from "../../utils/cn";
import { LinkedInWordmark } from "../layout/LinkedInWordmark";

type OnboardingLayoutProps = {
  /** 0–1 fraction of completion */
  progress: number;
  totalSteps: number;
  currentStepIndex: number;
  showBack: boolean;
  onBack: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function OnboardingLayout({
  progress,
  totalSteps,
  currentStepIndex,
  showBack,
  onBack,
  title,
  description,
  children,
  footer
}: OnboardingLayoutProps) {
  const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));

  return (
    <main className="min-h-screen bg-[#f3f2ef] py-6 text-[#191919]">
      <div className={cn(APP_SHELL_MAIN_COLUMN_CLASS, "flex min-h-[calc(100vh-3rem)] flex-col items-center")}>
        <div className="relative flex w-full max-w-[420px] flex-1 flex-col">
          {/* Progress */}
          <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-[#e0dfdc]" aria-hidden>
            <div className="h-full bg-[#0a66c2] transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
          </div>
          <p className="sr-only">
            Step {currentStepIndex + 1} of {totalSteps}
          </p>

          <LinkedInWordmark className="mb-8 w-[102px]" />

          <div className="flex flex-1 flex-col rounded-md border border-[#cfcfcf] bg-white px-6 py-8 shadow-none sm:px-8">
            <div className={showBack ? "mb-6 flex items-start gap-3" : "mb-6 text-center"}>
              {showBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#0a66c2] bg-white text-[#0a66c2] transition hover:bg-[#eef3f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a66c2]"
                  aria-label="Go back"
                >
                  <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
                </button>
              ) : null}
              <div className={showBack ? "min-w-0 flex-1" : "mx-auto max-w-[26rem]"}>
                <h1 className="text-[1.65rem] font-semibold leading-tight tracking-[-0.02em] text-[#191919] sm:text-[1.85rem]">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-[#666666]">{description}</p>
                ) : null}
              </div>
            </div>

            <div className="flex-1">{children}</div>
          </div>

          {footer ? <div className="mt-8 px-1">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}
