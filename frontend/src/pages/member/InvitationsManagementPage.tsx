import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { acceptConnection, getMutualConnections, listPendingConnections, rejectConnection, withdrawConnection } from "../../api/connections";
import { getMember } from "../../api/members";
import { getRecruiter } from "../../api/recruiters";
import { Button } from "../../components/ui/Button";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { MutualConnection, PendingConnection } from "../../types/connection";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { AppShellBreakout, AppShellMainRow } from "../../components/layout/AppShellRegions";
import { MutualAvatarStack, NetworkCard, NetworkCardHeader, NetworkListRow } from "../../components/network";
import { APP_SHELL_MAIN_COLUMN_CLASS } from "../../constants/appShellLayout";

type TabKey = "received" | "sent";

function titleCaseFromEmailLocal(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function mutualCaptionLine(mutuals: MutualConnection[], count: number): string {
  if (!count || mutuals.length === 0) return "";
  const first = titleCaseFromEmailLocal(mutuals[0].email);
  if (count === 1) return `${first} · 1 mutual connection`;
  return `${first} and ${count - 1} other${count - 1 === 1 ? "" : "s"}`;
}

async function loadInvitationProfile(userId: number): Promise<{
  profilePhotoUrl: string | null;
  name: string;
  headline: string | null;
}> {
  try {
    const member = await getMember(userId);
    const fullName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || "Member";
    return {
      profilePhotoUrl: member.profile_photo_url ?? null,
      name: fullName,
      headline: member.headline ?? null,
    };
  } catch {
    // Fall through to recruiter profile lookup.
  }

  try {
    const recruiter = await getRecruiter(userId);
    const recruiterName =
      `${recruiter.first_name ?? ""} ${recruiter.last_name ?? ""}`.trim() ||
      recruiter.name?.trim() ||
      recruiter.email ||
      "Recruiter";
    return {
      profilePhotoUrl: recruiter.profile_photo_url ?? null,
      name: recruiterName,
      headline: recruiter.headline ?? recruiter.role ?? null,
    };
  } catch {
    return { profilePhotoUrl: null, name: "Member", headline: null };
  }
}

export function InvitationsManagementPage() {
  const userId = authStore((state) => state.userId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [pending, setPending] = useState<PendingConnection[]>([]);
  const [profiles, setProfiles] = useState<Record<number, { profilePhotoUrl: string | null; name: string; headline: string | null }>>({});
  const [mutuals, setMutuals] = useState<Record<number, { mutuals: MutualConnection[]; count: number } | undefined>>({});
  const [loading, setLoading] = useState(true);

  const tab: TabKey = searchParams.get("tab") === "sent" ? "sent" : "received";

  const loadInvitations = async () => {
    if (!userId) return;
    const pendingList = await listPendingConnections(userId);
    setPending(pendingList);

    const profileIds = Array.from(
      new Set(
        pendingList.map((request) =>
          (request.direction ?? "incoming") === "incoming" ? request.requester_id : request.receiver_id
        )
      )
    ).filter((id) => Number.isFinite(id) && id > 0);

    const profileEntries = await Promise.all(
      profileIds.map(async (memberId) => {
        const profile = await loadInvitationProfile(memberId);
        return [memberId, profile] as const;
      })
    );
    setProfiles(Object.fromEntries(profileEntries));

    const incoming = pendingList.filter((r) => (r.direction ?? "incoming") === "incoming");
    const mutualEntries = await Promise.all(
      incoming.map(async (request) => {
        try {
          const result = await getMutualConnections(userId, request.requester_id);
          return [request.id, { mutuals: result.mutual_connections ?? [], count: result.count ?? 0 }] as const;
        } catch {
          return [request.id, undefined] as const;
        }
      })
    );
    setMutuals(Object.fromEntries(mutualEntries));
  };

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    void loadInvitations().finally(() => setLoading(false));
  }, [userId]);

  const received = useMemo(
    () => pending.filter((request) => (request.direction ?? "incoming") === "incoming"),
    [pending]
  );
  const sent = useMemo(
    () => pending.filter((request) => (request.direction ?? "incoming") === "outgoing"),
    [pending]
  );

  const activeList = tab === "received" ? received : sent;

  const onAccept = async (requestId: number) => {
    const t = toast.loading("Accepting…");
    try {
      await acceptConnection(requestId);
      await loadInvitations();
      toast.success("Invitation accepted", { id: t });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not accept invitation", { id: t });
    }
  };

  const onIgnore = async (requestId: number) => {
    const t = toast.loading("Ignoring…");
    try {
      await rejectConnection(requestId);
      await loadInvitations();
      toast.success("Invitation dismissed", { id: t });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not ignore invitation", { id: t });
    }
  };

  const onWithdraw = async (requestId: number) => {
    const t = toast.loading("Withdrawing…");
    try {
      await withdrawConnection(requestId);
      await loadInvitations();
      toast.success("Invitation withdrawn", { id: t });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not withdraw invitation", { id: t });
    }
  };

  const switchTab = (next: TabKey) => {
    setSearchParams(next === "sent" ? { tab: "sent" } : {});
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] bg-[#f3f2ef] py-6">
        <AppShellBreakout>
          <div className={APP_SHELL_MAIN_COLUMN_CLASS}>
            <div className="space-y-3">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          </div>
        </AppShellBreakout>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-100px)] bg-[#f3f2ef] pb-6 pt-2">
      <AppShellBreakout>
        <AppShellMainRow className="flex-col">
        <NetworkCard padded={false}>
          <div className="border-b border-[#e0dfdc] px-5 pt-2 md:px-6">
            <div className="flex gap-8">
              <button
                type="button"
                className={`-mb-px border-b-2 pb-2 pt-2 text-[17px] font-semibold ${tab === "received" ? "border-[#0a66c2] text-[#0a66c2]" : "border-transparent text-[#666]"}`}
                onClick={() => switchTab("received")}
              >
                Received
              </button>
              <button
                type="button"
                className={`-mb-px border-b-2 pb-2 pt-2 text-[17px] font-semibold ${tab === "sent" ? "border-[#0a66c2] text-[#0a66c2]" : "border-transparent text-[#666]"}`}
                onClick={() => switchTab("sent")}
              >
                Sent
              </button>
            </div>
          </div>
          <div className="px-5 pt-3 md:px-6">
            <NetworkCardHeader
              border
              title={
                <h2 className="text-lg font-semibold text-[#222]">
                  {tab === "received" ? `Received invitations (${received.length})` : `Sent invitations (${sent.length})`}
                </h2>
              }
            />
          </div>
          {activeList.length === 0 ? (
            <p className="px-5 pb-4 text-sm text-[#666] md:px-6">
              {tab === "received" ? "You have no pending invitations." : "You have no sent invitations."}
            </p>
          ) : (
            <div className="divide-y divide-[#e0dfdc]">
              {activeList.map((request) => {
                const targetId = (request.direction ?? "incoming") === "incoming" ? request.requester_id : request.receiver_id;
                const p = profiles[targetId];
                const name = p?.name || "Member";
                const subtitle = p?.headline?.trim() || (tab === "received" ? "Wants to connect with you" : "Invitation sent");
                const initials = (request.counterpart_email || request.requester_email || "?").slice(0, 2).toUpperCase();
                const mutualBundle = tab === "received" ? mutuals[request.id] : undefined;
                const tertiary =
                  mutualBundle && mutualBundle.count > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {mutualBundle.mutuals.length > 0 ? <MutualAvatarStack emails={mutualBundle.mutuals.map((m) => m.email)} /> : null}
                      <span className="text-xs text-[#666]">
                        {mutualBundle.mutuals.length > 0
                          ? mutualCaptionLine(mutualBundle.mutuals, mutualBundle.count)
                          : `${mutualBundle.count} mutual connection${mutualBundle.count === 1 ? "" : "s"}`}
                      </span>
                    </div>
                  ) : undefined;

                return (
                  <NetworkListRow
                    key={request.id}
                    avatar={
                      p?.profilePhotoUrl ? (
                        <img src={p.profilePhotoUrl} alt="" className="h-14 w-14 rounded-full object-cover ring-1 ring-[#e0dfdc]" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#dce6f1] text-sm font-semibold text-[#2b5d8d] ring-1 ring-[#e0dfdc]">
                          {initials}
                        </div>
                      )
                    }
                    primary={<span className="truncate font-semibold">{name}</span>}
                    secondary={<span className="line-clamp-2 text-[#666]">{subtitle}</span>}
                    tertiary={tertiary}
                    actions={
                      tab === "received" ? (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            className="rounded-full border border-[#666] bg-transparent px-4 py-2 text-sm font-semibold text-[#666] hover:bg-[#f3f2ef] hover:text-[#222]"
                            onClick={() => void onIgnore(request.id)}
                          >
                            Ignore
                          </Button>
                          <Button
                            type="button"
                            className="rounded-full border-0 bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004182]"
                            onClick={() => void onAccept(request.id)}
                          >
                            Accept
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-semibold text-[#666]">Sent</span>
                          <Button
                            type="button"
                            variant="secondary"
                            className="rounded-full border border-[#666] bg-transparent px-4 py-2 text-sm font-semibold text-[#666] hover:bg-[#f3f2ef] hover:text-[#222]"
                            onClick={() => void onWithdraw(request.id)}
                          >
                            Withdraw
                          </Button>
                        </>
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </NetworkCard>
        </AppShellMainRow>
      </AppShellBreakout>
    </div>
  );
}
