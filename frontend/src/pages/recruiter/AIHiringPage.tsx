import { useState } from "react";
import toast from "react-hot-toast";
import { useParams } from "react-router-dom";
import { ApprovalBar } from "../../components/ai/ApprovalBar";
import { AIProgressTimeline } from "../../components/ai/AIProgressTimeline";
import { CandidateCard } from "../../components/ai/CandidateCard";
import { Card } from "../../components/ui/Card";
import type { AICandidate, AIProgressStep } from "../../types/ai";

const initialSteps: AIProgressStep[] = [
  { key: "parse", label: "Parsing resumes...", description: "Waiting on backend support", status: "pending" },
  { key: "match", label: "Matching candidates...", description: "Waiting on backend support", status: "pending" },
  { key: "shortlist", label: "Generating shortlist", description: "Waiting on backend support", status: "pending" },
  { key: "draft", label: "Drafting outreach...", description: "Waiting on backend support", status: "pending" }
];

const initialCandidates: AICandidate[] = [];

export function AIHiringPage() {
  const { job_id } = useParams();
  const [steps, setSteps] = useState(initialSteps);
  const [candidates, setCandidates] = useState(initialCandidates);

  function startAnalysis() {
    toast.error("The current backend does not expose AI or WebSocket endpoints yet.");
    setSteps((current) => current.map((step, index) => ({ ...step, status: index === 0 ? "active" : "pending" })));
  }

  const approved = candidates.filter((candidate) => candidate.state === "approved").length;
  const edited = candidates.filter((candidate) => candidate.state === "edited").length;
  const rejected = candidates.filter((candidate) => candidate.state === "rejected").length;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <h1 className="text-xl font-bold">AI Hiring Assistant</h1>
          <p className="mt-2 text-sm text-text-secondary">Job #{job_id}</p>
          <button
            className="mt-4 inline-flex w-full items-center justify-center rounded-pill border-2 border-brand bg-brand px-4 py-2 font-semibold text-white"
            onClick={startAnalysis}
          >
            Start AI Analysis
          </button>
        </Card>
        <Card>
          <AIProgressTimeline steps={steps} />
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <h2 className="text-xl font-bold">AI Shortlist Results</h2>
          <p className="mt-2 text-sm text-text-secondary">
            This screen is ready for real AI data, but the backend currently has no AI or WebSocket endpoints to drive it.
          </p>
        </Card>
        {candidates.map((candidate, index) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            onApprove={() =>
              setCandidates((current) =>
                current.map((item, itemIndex) => (itemIndex === index ? { ...item, state: "approved" } : item))
              )
            }
            onReject={() =>
              setCandidates((current) =>
                current.map((item, itemIndex) => (itemIndex === index ? { ...item, state: "rejected" } : item))
              )
            }
            onChange={(value) =>
              setCandidates((current) =>
                current.map((item, itemIndex) => (itemIndex === index ? { ...item, outreachDraft: value, state: "edited" } : item))
              )
            }
          />
        ))}
        <ApprovalBar approved={approved} edited={edited} rejected={rejected} total={candidates.length} />
      </div>
    </div>
  );
}
