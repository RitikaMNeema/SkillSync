import { AlertCircle } from "lucide-react";
import { Button } from "./Button";

export function Alert({
  message,
  title = "Something went wrong",
  onRetry
}: {
  message: string;
  /** Visible heading (in addition to icon and body text — not color-only). */
  title?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="linkedin-card border-l-4 border-l-red-600 p-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
        <div className="flex-1">
          <p className="font-semibold text-red-700">{title}</p>
          <p className="text-sm text-text-secondary">{message}</p>
        </div>
        {onRetry ? (
          <Button type="button" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
