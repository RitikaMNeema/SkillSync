import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useParams } from "react-router-dom";

import {
  approveAgentWorkflow,
  getAICommandStatus,
  getAIMetrics,
  getAgentStatus,
  startAgentWorkflow,
} from "../../api/ai";
import { authStore } from "../../context/AuthContext";

const emptyCandidateJson = `{
  "member_id": 0,
  "headline": "",
  "summary": "",
  "skills": [],
  "experiences": [],
  "location": "",
  "education": []
}`;

const emptyJobJson = `{
  "title": "",
  "description": "",
  "skills_required": [],
  "location": "",
  "seniority_level": "",
  "employment_type": ""
}`;

function getStepData(traceStatus: any, stepName: string) {
  const steps = traceStatus?.steps ?? [];
  const step = steps.find((item: any) => item.step_name === stepName);
  return step?.data ?? null;
}

export function AIHiringPage() {
  const { job_id } = useParams();
  const recruiterId = authStore((state) => state.userId);

  const [candidateJson, setCandidateJson] = useState(emptyCandidateJson);
  const [jobJson, setJobJson] = useState(emptyJobJson);

  const [loading, setLoading] = useState(false);

  const [workflowCommandId, setWorkflowCommandId] = useState<string | null>(null);
  const [approvalCommandId, setApprovalCommandId] = useState<string | null>(null);

  const [workflowCommandStatus, setWorkflowCommandStatus] = useState<any | null>(null);
  const [approvalCommandStatus, setApprovalCommandStatus] = useState<any | null>(null);

  const [traceId, setTraceId] = useState<string | null>(null);
  const [traceStatus, setTraceStatus] = useState<any | null>(null);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [editedMessage, setEditedMessage] = useState("");

  async function pollCommandUntilDone(
    nextCommandId: string,
    kind: "workflow" | "approval"
  ) {
    for (let i = 0; i < 25; i += 1) {
      const status = await getAICommandStatus(nextCommandId);

      if (kind === "workflow") {
        setWorkflowCommandStatus(status);
      } else {
        setApprovalCommandStatus(status);
      }

      if (status.status === "completed") {
        return status;
      }

      if (status.status === "failed") {
        throw new Error(status.error || `${kind} command failed`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    throw new Error(`Timed out waiting for ${kind} command completion`);
  }

  async function refreshMetrics() {
    try {
      const result = await getAIMetrics();
      setMetrics(result);
    } catch (error) {
      console.error(error);
    }
  }

  async function refreshTrace(nextTraceId: string) {
    const status = await getAgentStatus(nextTraceId);
    setTraceStatus(status);

    const finalDraft = status?.final_result?.outreach_draft?.message;
    const stepDraft = getStepData(status, "outreach_generator")?.message;
    const draft = finalDraft || stepDraft || "";

    if (draft) {
      setEditedMessage(draft);
    }

    return status;
  }

  async function pollTraceUntilReady(nextTraceId: string) {
    for (let i = 0; i < 90; i += 1) {
      const status = await refreshTrace(nextTraceId);

      if (
        status?.status === "awaiting_approval" ||
        status?.status === "completed" ||
        status?.status === "failed" ||
        status?.status === "rejected"
      ) {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const latest = await refreshTrace(nextTraceId);
    return latest;
  }

  async function handleRefreshTrace() {
    if (!traceId) {
      toast.error("No trace id found");
      return;
    }

    try {
      const latest = await refreshTrace(traceId);

      if (latest?.status === "awaiting_approval") {
        toast.success("Trace refreshed: ready for review");
      } else if (latest?.status === "completed") {
        toast.success("Trace refreshed: workflow completed");
      } else if (latest?.status === "failed") {
        toast.error("Trace refreshed: workflow failed");
      } else {
        toast.success(`Trace refreshed: ${latest?.current_step ?? latest?.status ?? "updated"}`);
      }
    } catch (error) {
      toast.error("Could not refresh trace");
    }
  }

  async function startAnalysis() {
    if (!recruiterId) {
      toast.error("Recruiter id not found");
      return;
    }

    let candidate: any;
    let job: any;

    try {
      candidate = JSON.parse(candidateJson);
      job = { ...JSON.parse(jobJson), job_id: Number(job_id) };
    } catch {
      toast.error("Invalid candidate/job JSON");
      return;
    }
    if (!candidate?.member_id || !job?.title) {
      toast.error("Candidate member_id and job title are required");
      return;
    }

    setLoading(true);
    setApprovalCommandId(null);
    setApprovalCommandStatus(null);
    setWorkflowCommandStatus(null);
    setTraceStatus(null);
    setTraceId(null);
    setEditedMessage("");

    try {
      const queued = await startAgentWorkflow({
        recruiter_id: recruiterId,
        candidate,
        job,
        workflow_type: "shortlist_outreach",
        require_human_approval: true,
      });

      setWorkflowCommandId(queued.command_id);
      toast.success("AI workflow queued");

      const result = await pollCommandUntilDone(queued.command_id, "workflow");
      const nextTraceId = result?.result?.trace_id;

      if (nextTraceId) {
        setTraceId(nextTraceId);
        const finalTrace = await pollTraceUntilReady(nextTraceId);

        if (finalTrace?.status === "awaiting_approval") {
          toast.success("AI workflow ready for review");
        } else if (finalTrace?.status === "completed") {
          toast.success("AI workflow completed");
        } else if (finalTrace?.status === "failed") {
          toast.error("AI workflow failed");
        } else if (finalTrace?.status === "rejected") {
          toast("Workflow ended as rejected");
        } else if (finalTrace?.status === "running") {
          toast(`Workflow still running at step: ${finalTrace?.current_step ?? "unknown"}`);
        } else {
          toast.success("AI workflow updated");
        }
      }

      await refreshMetrics();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run AI workflow");
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(action: "approve" | "edit" | "reject") {
    if (!traceId) {
      toast.error("No trace id found");
      return;
    }

    try {
      const queued = await approveAgentWorkflow({
        trace_id: traceId,
        action,
        edited_message: action === "edit" ? editedMessage : null,
        reviewer_id: recruiterId ?? null,
      });

      setApprovalCommandId(queued.command_id);
      await pollCommandUntilDone(queued.command_id, "approval");
      await refreshTrace(traceId);
      await refreshMetrics();

      toast.success(`Outreach ${action} completed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval action failed");
    }
  }

  const parsedProfile =
    traceStatus?.final_result?.parsed_profile ??
    getStepData(traceStatus, "resume_parser") ??
    null;

  const matchResult =
    traceStatus?.final_result?.match_result ??
    getStepData(traceStatus, "matcher") ??
    null;

  const outreachDraft =
    traceStatus?.final_result?.outreach_draft ??
    getStepData(traceStatus, "outreach_generator") ??
    null;

  const canReview = traceStatus?.status === "awaiting_approval";

  const metricsSummary = useMemo(() => {
    if (!metrics) return "No metrics loaded yet";
    return JSON.stringify(metrics, null, 2);
  }, [metrics]);

  return (
    <div style={{ padding: "24px", display: "grid", gap: "20px" }}>
      <div>
        <h1>AI Hiring Assistant</h1>
        <p>Job ID: {job_id}</p>
        <p>Workflow Command ID: {workflowCommandId ?? "none"}</p>
        <p>Approval Command ID: {approvalCommandId ?? "none"}</p>
        <p>Trace ID: {traceId ?? "none"}</p>
        <p>Workflow Status: {traceStatus?.status ?? "not started"}</p>
        <p>Current Step: {traceStatus?.current_step ?? "none"}</p>
        <p>Workflow Ready For Review: {canReview ? "Yes" : "No"}</p>
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        <label>Candidate JSON</label>
        <textarea
          value={candidateJson}
          onChange={(e) => setCandidateJson(e.target.value)}
          rows={10}
          style={{ width: "100%" }}
        />

        <label>Job JSON</label>
        <textarea
          value={jobJson}
          onChange={(e) => setJobJson(e.target.value)}
          rows={10}
          style={{ width: "100%" }}
        />

        <button onClick={startAnalysis} disabled={loading}>
          {loading ? "Running..." : "Start AI Analysis"}
        </button>
      </div>

      <div>
        <h2>Workflow Command Status</h2>
        <pre>{JSON.stringify(workflowCommandStatus, null, 2)}</pre>
      </div>

      <div>
        <h2>Approval Command Status</h2>
        <pre>{JSON.stringify(approvalCommandStatus, null, 2)}</pre>
      </div>

      <div>
        <h2>Trace Status</h2>
        <button onClick={handleRefreshTrace} disabled={!traceId}>
          Refresh Trace
        </button>
        <pre>{JSON.stringify(traceStatus, null, 2)}</pre>
      </div>

      <div>
        <h2>Parsed Profile</h2>
        <pre>
          {parsedProfile
            ? JSON.stringify(parsedProfile, null, 2)
            : "Parsed profile not available yet"}
        </pre>
      </div>

      <div>
        <h2>Match Result</h2>
        <pre>
          {matchResult
            ? JSON.stringify(matchResult, null, 2)
            : "Match result not available yet"}
        </pre>
      </div>

      <div>
        <h2>Outreach Draft</h2>
        <textarea
          value={editedMessage}
          onChange={(e) => setEditedMessage(e.target.value)}
          rows={8}
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
          <button onClick={() => handleApproval("approve")} disabled={!canReview}>
            Approve
          </button>
          <button onClick={() => handleApproval("edit")} disabled={!canReview}>
            Edit + Approve
          </button>
          <button onClick={() => handleApproval("reject")} disabled={!canReview}>
            Reject
          </button>
        </div>
      </div>

      <div>
        <h2>Metrics</h2>
        <button onClick={refreshMetrics}>Refresh Metrics</button>
        <pre>{metricsSummary}</pre>
      </div>
    </div>
  );
}