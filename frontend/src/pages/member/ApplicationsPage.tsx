import { ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { getApplication, getApplicationsByMember, withdrawApplication } from "../../api/applications";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { Application, ApplicationStatus } from "../../types/application";
import { formatRelativeDate } from "../../utils/formatDate";
import { getStatusColor } from "../../utils/getStatusColor";

const tabs: Array<ApplicationStatus | "all"> = ["all", "submitted", "reviewing", "interview", "offer", "hired", "rejected"];

/** Ordered pipeline for progress badges (no duplicate labels). */
function applicationProgressBadges(status: ApplicationStatus): ApplicationStatus[] {
  const pipeline: ApplicationStatus[] = ["submitted", "reviewing", "interview", "offer"];
  if (status === "withdrawn") return ["submitted", "withdrawn"];
  if (status === "rejected") return [...pipeline, "rejected"];
  const idx = pipeline.indexOf(status);
  if (idx >= 0) return pipeline.slice(0, idx + 1);
  return [status];
}

export function ApplicationsPage() {
  const navigate = useNavigate();
  const userId = authStore((state) => state.userId);
  const [applications, setApplications] = useState<Application[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ApplicationStatus | "all">("all");

  useEffect(() => {
    if (!userId) return;
    void getApplicationsByMember(userId)
      .then((data) => {
        setApplications(data.applications);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load applications");
      })
      .finally(() => setLoading(false));
  }, [userId]);

  async function toggleExpanded(application: Application) {
    if (expandedId === application.application_id) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(application.application_id);
    try {
      const detail = await getApplication(application.application_id);
      setExpandedDetail(detail);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not load details");
      setExpandedId(null);
      setExpandedDetail(null);
    }
  }

  const filtered = status === "all" ? applications : applications.filter((application) => application.status === status);

  if (loading) {
    return (
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No applications yet"
        description="Apply to jobs to track them here."
        actionLabel="Find jobs"
        onAction={() => navigate("/jobs")}
      />
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">My Applications</h1>
      <div className="flex flex-wrap gap-4 border-b pb-2 text-sm">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`${status === tab ? "border-b-2 border-brand font-semibold text-brand" : "text-text-secondary"}`}
            onClick={() => setStatus(tab)}
          >
            {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.map((application) => (
          <Card key={application.application_id} className="cursor-pointer" onClick={() => void toggleExpanded(application)}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded bg-brand-light font-semibold text-brand">
                  {(application.company_name ?? "Co").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <Link
                    to={`/jobs/${application.job_id}`}
                    className="font-semibold text-brand hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {application.job_title}
                  </Link>
                  <p className="text-sm text-text-secondary">
                    {application.company_name} · {formatRelativeDate(application.application_datetime)}
                  </p>
                  <Badge className={getStatusColor(application.status)}>{application.status}</Badge>
                  <div className="mt-2">
                    <Link
                      to={`/jobs/${application.job_id}`}
                      className="text-sm font-semibold text-brand hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      View job posting
                    </Link>
                  </div>
                </div>
              </div>
              {application.status !== "withdrawn" &&
              application.status !== "rejected" &&
              application.status !== "hired" ? (
                <Button
                  variant="ghost"
                  className="text-[#cc1016]"
                  onClick={(event) => {
                    event.stopPropagation();
                    void withdrawApplication(application.application_id)
                      .then(() =>
                        setApplications((current) =>
                          current.map((item) =>
                            item.application_id === application.application_id ? { ...item, status: "withdrawn" } : item
                          )
                        )
                      )
                      .catch((error: unknown) => {
                        toast.error(error instanceof Error ? error.message : "Could not withdraw");
                      });
                  }}
                >
                  Withdraw
                </Button>
              ) : null}
            </div>
            {expandedId === application.application_id && expandedDetail ? (
              <div className="mt-4 border-t pt-4 text-sm text-text-secondary" onClick={(event) => event.stopPropagation()}>
                <p>Resume: {expandedDetail.resume_url || "No resume attached"}</p>
                <p className="mt-2">Cover letter: {expandedDetail.cover_letter || "No cover letter provided"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {applicationProgressBadges(expandedDetail.status).map((step) => (
                    <Badge key={step} className={getStatusColor(step)}>
                      {step}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </section>
  );
}
