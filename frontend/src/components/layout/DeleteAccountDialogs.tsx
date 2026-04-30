import { Check, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { deleteAccount } from "../../api/auth";
import { Button } from "../ui/Button";

interface DeleteAccountDialogsProps {
  confirmOpen: boolean;
  onCloseConfirm: () => void;
  onNavigateAfterSuccess: () => void;
}

export function DeleteAccountDialogs({
  confirmOpen,
  onCloseConfirm,
  onNavigateAfterSuccess
}: DeleteAccountDialogsProps) {
  const [successOpen, setSuccessOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState(false);

  useEffect(() => {
    if (!confirmOpen) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (!loading && event.key === "Escape") onCloseConfirm();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmOpen, loading, onCloseConfirm]);

  useEffect(() => {
    if (!confirmOpen) {
      setInlineError(false);
      setLoading(false);
    }
  }, [confirmOpen]);

  async function handleConfirmDelete() {
    setInlineError(false);
    setLoading(true);
    try {
      await deleteAccount();
      onCloseConfirm();
      setSuccessOpen(true);
    } catch {
      setInlineError(true);
    } finally {
      setLoading(false);
    }
  }

  function handleSuccessOk() {
    setSuccessOpen(false);
    onNavigateAfterSuccess();
  }

  return (
    <>
      {confirmOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-4 py-8"
          onMouseDown={(event) => {
            if (!loading && event.target === event.currentTarget) onCloseConfirm();
          }}
        >
          <div className="relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_22px_60px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between border-b border-[#e4e7eb] px-8 py-5">
              <h2 className="text-xl font-semibold tracking-tight text-[#1f1f1f]">Delete account</h2>
              <button
                type="button"
                aria-label="Close"
                disabled={loading}
                className="rounded-full p-2 text-[#4d4d4d] transition hover:bg-[#f3f6f8] disabled:opacity-50"
                onClick={onCloseConfirm}
              >
                ×
              </button>
            </div>
            <div className="px-8 py-8">
              <div className="flex gap-6">
                <div className="flex shrink-0 items-start justify-center pt-1">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FEF2F2]">
                    <Trash2 className="h-8 w-8 text-[#DC2626]" aria-hidden />
                  </span>
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="text-base font-semibold text-[#1f1f1f]">Are you sure you want to delete your account?</p>
                  <p className="text-sm leading-relaxed text-[#4b5563]">
                    This action cannot be undone. All your data, applications, saved jobs, and account settings will be permanently deleted.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-[#e4e7eb] px-8 py-5">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-full border-[#0A66C2] bg-white text-[#0A66C2] hover:bg-[#EAF4FF]"
                  disabled={loading}
                  onClick={onCloseConfirm}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="rounded-full border-transparent bg-[#DC2626] text-white hover:bg-[#b91c1c]"
                  disabled={loading}
                  onClick={() => void handleConfirmDelete()}
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deleting…
                    </span>
                  ) : (
                    "Delete account"
                  )}
                </Button>
              </div>
              {inlineError ? (
                <p className="text-center text-xs text-[#DC2626] sm:text-left">Something went wrong. Please try again.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {successOpen ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-4 py-8">
          <div className="w-full max-w-[420px] rounded-[18px] bg-white px-8 py-10 text-center shadow-[0_22px_60px_rgba(15,23,42,0.22)]">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#DCFCE7]">
              <Check className="h-8 w-8 text-[#16A34A]" strokeWidth={2.5} aria-hidden />
            </div>
            <h2 className="text-xl font-semibold text-[#1f1f1f]">Account deleted</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#4b5563]">
              Your account has been successfully deleted. We&apos;re sorry to see you go.
            </p>
            <Button type="button" className="mt-8 w-full rounded-full border-[#0A66C2] bg-[#0A66C2] hover:bg-[#004182]" onClick={handleSuccessOk}>
              OK
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
