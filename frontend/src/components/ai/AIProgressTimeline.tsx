import type { AIProgressStep } from "../../types/ai";

type Props = {
  steps: AIProgressStep[];
};

export function AIProgressTimeline({ steps }: Props) {
  return (
    <div className="space-y-4">
      {steps.map((step) => (
        <div key={step.key} className="flex gap-3">
          <div className="mt-0.5">
            {step.status === "done" ? (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-xs">
                ✓
              </span>
            ) : step.status === "active" ? (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white text-xs">
                •
              </span>
            ) : step.status === "failed" ? (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs">
                !
              </span>
            ) : (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-gray-400 text-xs">
                ○
              </span>
            )}
          </div>

          <div>
            <p className={`font-semibold ${step.status === "active" ? "text-blue-600" : ""}`}>
              {step.label}
            </p>
            {step.description ? (
              <p className="text-sm text-gray-500">{step.description}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}