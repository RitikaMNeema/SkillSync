import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { AIProgressStep } from "../../types/ai";

export function AIProgressTimeline({ steps }: { steps: AIProgressStep[] }) {
  return (
    <div className="space-y-4">
      {steps.map((step) => (
        <div key={step.key} className="flex gap-3">
          <div className="mt-0.5">
            {step.status === "done" ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : step.status === "active" ? (
              <Loader2 className="h-5 w-5 animate-spin text-brand" />
            ) : (
              <Circle className="h-5 w-5 text-text-tertiary" />
            )}
          </div>
          <div>
            <p className={`font-semibold ${step.status === "active" ? "text-brand" : ""}`}>{step.label}</p>
            <p className="text-sm text-text-secondary">{step.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
