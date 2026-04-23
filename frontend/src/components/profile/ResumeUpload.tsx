import { CheckCircle2, Download, FileText, RefreshCw, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import toast from "react-hot-toast";
import {
  downloadResumeFile,
  deleteResume,
  getResumeMeta,
  uploadResumeFile,
  type ResumeMeta
} from "../../api/members";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function validate(file: File): string | null {
  if (!ALLOWED_MIME.includes(file.type)) {
    return "Only PDF or DOCX files are allowed";
  }
  if (file.size > MAX_RESUME_BYTES) {
    return "Resume must be 5MB or smaller";
  }
  return null;
}

export function ResumeUpload({ memberId }: { memberId: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<ResumeMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const meta = await getResumeMeta(memberId);
        if (!cancelled) setUploaded(meta);
      } catch {
        // Non-fatal: stay in empty state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  function pickFile() {
    inputRef.current?.click();
  }

  function handleSelect(next: File | null | undefined) {
    setError("");
    if (!next) return;
    const msg = validate(next);
    if (msg) {
      setError(msg);
      return;
    }
    setFile(next);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleSelect(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    handleSelect(event.dataTransfer.files?.[0]);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  async function handleSave() {
    if (!file) return;
    setLoading(true);
    const toastId = toast.loading("Uploading resume...");
    try {
      const meta = await uploadResumeFile(memberId, file);
      setUploaded(meta);
      setFile(null);
      toast.success("Resume uploaded", { id: toastId });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Upload failed", { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  async function handleReplace() {
    setUploaded(null);
    setFile(null);
  }

  async function handleRemoveSaved() {
    const toastId = toast.loading("Removing resume...");
    try {
      await deleteResume(memberId);
      setUploaded(null);
      toast.success("Resume removed", { id: toastId });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not delete resume", { id: toastId });
    }
  }

  async function handleDownload() {
    setDownloading(true);
    const toastId = toast.loading("Preparing download...");
    try {
      const { blob, fileName } = await downloadResumeFile(memberId);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      toast.success("Download started", { id: toastId });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not download resume", { id: toastId });
    } finally {
      setDownloading(false);
    }
  }

  // ── State 3: saved ─────────────────────────────────────────────────────────
  if (uploaded) {
    return (
      <Card id="profile-resume">
        <h3 className="mb-3 text-lg font-semibold">Resume</h3>
        <div className="flex items-center justify-between gap-3 rounded-card border border-[#cdebd3] bg-[#eefbf1] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-[#16a34a]" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-[#1f1f1f]" title={uploaded.resume_file_name}>
                {uploaded.resume_file_name}
              </p>
              <p className="text-sm text-text-secondary">
                Uploaded {formatDate(uploaded.resume_uploaded_at) || "recently"}
              </p>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => void handleDownload()}
              disabled={downloading}
            >
              <Download className="mr-1 h-4 w-4" />
              {downloading ? "Downloading..." : "Download"}
            </Button>
            <Button variant="ghost" onClick={() => void handleReplace()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              Replace
            </Button>
            <button
              type="button"
              onClick={() => void handleRemoveSaved()}
              aria-label="Delete resume"
              className="rounded-full p-1 text-text-secondary hover:bg-[#e5e7eb] hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>
    );
  }

  // ── States 1 & 2: drop zone ────────────────────────────────────────────────
  return (
    <Card id="profile-resume">
      <h3 className="mb-3 text-lg font-semibold">Resume</h3>
      <div
        role="button"
        tabIndex={0}
        onClick={pickFile}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            pickFile();
          }
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={
          "flex flex-col items-center gap-3 rounded-card border-2 border-dashed p-8 text-center transition cursor-pointer " +
          (file
            ? "border-[#0a66c2] bg-[#eef3fb]"
            : dragOver
              ? "border-[#0a66c2] bg-[#eef3fb]"
              : "border-[#c9cfd6] hover:border-[#0a66c2] hover:bg-[#f4f7fb]")
        }
      >
        {file ? (
          <div className="flex w-full items-center justify-between gap-3 rounded-md border border-[#cfd8e3] bg-white p-3">
            <div className="flex min-w-0 items-center gap-3">
              <FileText className="h-5 w-5 text-[#0a66c2]" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-[#1f1f1f]" title={file.name}>
                  {file.name}
                </p>
                <p className="text-sm text-text-secondary">{formatSize(file.size)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setFile(null);
              }}
              className="rounded-full p-1 text-text-secondary hover:bg-[#e5e7eb] hover:text-red-600"
              aria-label="Remove file"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <>
            <UploadCloud className="h-10 w-10 text-[#0a66c2]" />
            <p className="text-base font-semibold text-[#1f1f1f]">Drag & drop your resume or browse</p>
            <p className="text-sm text-text-secondary">PDF or DOCX · Max 5MB</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={onInputChange}
        />
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {file ? (
        <div className="mt-4 flex justify-end">
          <Button onClick={() => void handleSave()} disabled={loading}>
            {loading ? "Saving..." : "Save resume"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
