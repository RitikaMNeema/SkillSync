import { UploadCloud } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { uploadResume } from "../../api/members";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";

export function ResumeUpload({ memberId }: { memberId: number }) {
  const [url, setUrl] = useState("");

  async function handleUpload() {
    const loading = toast.loading("Saving resume...");
    try {
      await uploadResume({ member_id: memberId, resume_url: url });
      toast.success("Resume updated", { id: loading });
      setUrl("");
    } catch {
      toast.error("Failed to update resume", { id: loading });
    }
  }

  return (
    <Card>
      <h3 className="mb-3 text-lg font-semibold">Resume</h3>
      <div className="rounded-card border border-dashed p-4">
        <div className="mb-3 flex items-center gap-3">
          <UploadCloud className="h-5 w-5 text-brand" />
          <p className="text-sm text-text-secondary">Paste a resume URL from your storage provider.</p>
        </div>
        <div className="flex gap-2">
          <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
          <Button onClick={() => void handleUpload()} disabled={!url}>
            Save
          </Button>
        </div>
      </div>
    </Card>
  );
}
