import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getRecruiter } from "../../api/recruiters";
import { Avatar } from "../../components/ui/Avatar";
import { Card } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import { CardSkeleton } from "../../components/ui/Skeleton";
import type { RecruiterProfile } from "../../types/recruiter";

export function RecruiterProfilePage() {
  const { recruiter_id } = useParams<{ recruiter_id: string }>();
  const parsedId = Number(recruiter_id);
  const [profile, setProfile] = useState<RecruiterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      setError("Recruiter profile not found.");
      setLoading(false);
      return;
    }
    setLoading(true);
    void getRecruiter(parsedId).then(
      (data) => {
        setProfile(data);
        setError("");
        setLoading(false);
      },
      () => {
        setError("Could not load recruiter profile.");
        setLoading(false);
      }
    );
  }, [parsedId]);

  if (loading) return <CardSkeleton />;
  if (error || !profile) return <Alert message={error || "Recruiter profile not found."} />;

  return (
    <div className="mx-auto max-w-[900px]">
      <Card>
        <div className="flex items-start gap-4">
          <Avatar alt={profile.name} name={profile.name} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-[#1f1f1f]">{profile.name}</h1>
            <p className="mt-1 text-sm text-text-secondary">{profile.role || "Recruiter"}</p>
            <div className="mt-4 grid gap-2 text-sm text-text-secondary">
              <p><span className="font-medium text-text-primary">Company:</span> {profile.company_name}</p>
              {profile.industry ? <p><span className="font-medium text-text-primary">Industry:</span> {profile.industry}</p> : null}
              {profile.company_location ? <p><span className="font-medium text-text-primary">Location:</span> {profile.company_location}</p> : null}
              <p><span className="font-medium text-text-primary">Email:</span> {profile.email}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
