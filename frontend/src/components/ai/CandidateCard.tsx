import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Textarea } from "../ui/Input";
import type { AICandidate } from "../../types/ai";

export function CandidateCard({
  candidate,
  onApprove,
  onReject,
  onChange
}: {
  candidate: AICandidate;
  onApprove: () => void;
  onReject: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <Card
      className={`${candidate.state === "approved" ? "animate-approve-sweep border-l-4 border-l-success" : ""} ${
        candidate.state === "rejected" ? "animate-reject-fade" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{candidate.name}</p>
          <p className="text-sm text-text-secondary">{candidate.headline}</p>
        </div>
        <div className="text-2xl font-bold text-brand">{candidate.score}%</div>
      </div>
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {candidate.topSkills.map((skill) => (
            <Badge key={skill} className="bg-emerald-100 text-success">
              {skill}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {candidate.missingSkills.map((skill) => (
            <Badge key={skill} className="border border-red-200 bg-white text-red-600">
              {skill}
            </Badge>
          ))}
        </div>
        <p className="text-sm italic text-text-secondary">{candidate.reasoning}</p>
        <Textarea value={candidate.outreachDraft} onChange={(event) => onChange(event.target.value)} />
        <div className="flex gap-2">
          <Button onClick={onApprove}>Approve</Button>
          <Button variant="secondary" onClick={onApprove}>
            Edit & Approve
          </Button>
          <Button variant="ghost" onClick={onReject}>
            Reject
          </Button>
        </div>
      </div>
    </Card>
  );
}
