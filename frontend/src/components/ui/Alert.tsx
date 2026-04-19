import { AlertCircle } from "lucide-react";
import { Button } from "./Button";

export function Alert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="linkedin-card border-l-4 border-l-red-600 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
        <div className="flex-1">
          <p className="font-semibold text-red-700">Something went wrong</p>
          <p className="text-sm text-text-secondary">{message}</p>
        </div>
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
