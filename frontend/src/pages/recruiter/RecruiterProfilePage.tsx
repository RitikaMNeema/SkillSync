import { Navigate, useParams } from "react-router-dom";

/**
 * Legacy URL: full recruiter data (about, experience, skills, photos) is loaded by
 * `ProfilePage` via `getUnifiedProfile(_, "recruiter")`. Keep this route as a redirect
 * so old links and bookmarks resolve to the same experience as search (`?type=recruiter`).
 */
export function RecruiterProfilePage() {
  const { recruiter_id } = useParams<{ recruiter_id: string }>();
  const parsedId = Number(recruiter_id);
  if (!Number.isFinite(parsedId) || parsedId <= 0) {
    return <Navigate to="/feed" replace />;
  }
  return <Navigate to={`/profile/${parsedId}?type=recruiter`} replace />;
}
