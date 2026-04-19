import { X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { submitApplication } from "../../api/applications";
import { uploadResume } from "../../api/members";
import { authStore } from "../../context/AuthContext";
import type { Job } from "../../types/job";
import { Button } from "../ui/Button";
import { Input, Textarea } from "../ui/Input";

export function ApplyModal({
  job,
  open,
  onClose,
  onSubmitted
}: {
  job: Job;
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const userId = authStore((state) => state.userId);
  const [resumeUrl, setResumeUrl] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [phone, setPhone] = useState("");

  if (!open) return null;

  async function handleSubmit() {
    if (!userId) return;
    const loading = toast.loading("Submitting application...");
    try {
      if (resumeUrl) {
        await uploadResume({ member_id: userId, resume_url: resumeUrl });
      }
      await submitApplication({
        job_id: job.job_id,
        member_id: userId,
        resume_url: resumeUrl || null,
        cover_letter: coverLetter || null,
        answers: phone ? { phone } : undefined
      });
      toast.success("Application submitted", { id: loading });
      onSubmitted();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit", { id: loading });
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-card bg-white shadow-modal">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold">Submit your application</h3>
            <p className="text-sm text-text-secondary">{job.title}</p>
          </div>
          <Button variant="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-sm font-semibold">Resume URL</label>
            <Input value={resumeUrl} onChange={(event) => setResumeUrl(event.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Phone number</label>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(555) 555-5555" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Cover letter</label>
            <Textarea
              value={coverLetter}
              onChange={(event) => setCoverLetter(event.target.value)}
              placeholder="Optional cover letter"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Save for later
          </Button>
          <Button onClick={() => void handleSubmit()}>Submit application</Button>
        </div>
      </div>
    </div>
  );
}
