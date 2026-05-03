import { Navigate, useParams } from "react-router-dom";
import { APP_SHELL_MAIN_COLUMN_CLASS } from "../../constants/appShellLayout";
import { cn } from "../../utils/cn";
import { Card } from "../../components/ui/Card";

function memberIdFromSlug(slug: string | undefined): number | null {
  if (!slug) return null;
  const match = slug.match(/-(\d+)$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function PublicProfileSlugPage() {
  const { profile_slug } = useParams<{ profile_slug: string }>();
  const memberId = memberIdFromSlug(profile_slug);

  if (memberId) {
    return <Navigate to={`/profile/${memberId}`} replace />;
  }

  return (
    <div className={cn(APP_SHELL_MAIN_COLUMN_CLASS, "py-6")}>
      <Card>
        <h1 className="text-xl font-semibold">Profile not found</h1>
        <p className="mt-2 text-sm text-text-secondary">
          This public profile URL is invalid or incomplete.
        </p>
      </Card>
    </div>
  );
}
