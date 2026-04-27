import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserRoundCheck, Users } from "lucide-react";
import {
  acceptConnection,
  listConnections,
  listPendingConnections,
  rejectConnection,
} from "../../api/connections";
import { getMember } from "../../api/members";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { Connection, PendingConnection } from "../../types/connection";

export function ConnectionsPage() {
  const userId = authStore((state) => state.userId);
  const navigate = useNavigate();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [pending, setPending] = useState<PendingConnection[]>([]);
  const [invitationProfiles, setInvitationProfiles] = useState<
    Record<number, { profilePhotoUrl: string | null; name: string; headline: string | null }>
  >({});
  const [loading, setLoading] = useState(true);

  const loadNetworkData = async () => {
    if (!userId) return;

    const [list, pendingList] = await Promise.all([
      listConnections(userId),
      listPendingConnections(userId),
    ]);

    setConnections(list);
    setPending(pendingList);

    const profileIds = Array.from(
      new Set(
        pendingList.map((request) =>
          (request.direction ?? "incoming") === "incoming" ? request.requester_id : request.receiver_id
        )
      )
    ).filter((id) => Number.isFinite(id) && id > 0);

    const entries = await Promise.all(
      profileIds.map(async (memberId) => {
        try {
          const profile = await getMember(memberId);
          const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Member";
          return [
            memberId,
            {
              profilePhotoUrl: profile.profile_photo_url ?? null,
              name: fullName,
              headline: profile.headline ?? null
            }
          ] as const;
        } catch {
          return [memberId, { profilePhotoUrl: null, name: "Member", headline: null }] as const;
        }
      })
    );
    setInvitationProfiles(Object.fromEntries(entries));
  };

  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    void loadNetworkData().finally(() => setLoading(false));
  }, [userId]);

  const handleAccept = async (requestId: number) => {
    await acceptConnection(requestId);
    await loadNetworkData();
  };

  const handleReject = async (requestId: number) => {
    await rejectConnection(requestId);
    await loadNetworkData();
  };

  const getInvitationProfile = (request: PendingConnection) => {
    const targetMemberId =
      (request.direction ?? "incoming") === "incoming" ? request.requester_id : request.receiver_id;
    const profile = invitationProfiles[targetMemberId];
    return {
      profilePhotoUrl: profile?.profilePhotoUrl ?? null,
      name: profile?.name || "Member",
      headline: profile?.headline?.trim() || "LinkedIn member",
      initials: (request.counterpart_email || request.requester_email).slice(0, 2).toUpperCase()
    };
  };

  const incomingPending = pending.filter((request) => (request.direction ?? "incoming") === "incoming");

  if (loading) {
    return (
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <Card className="h-fit rounded-xl border border-[#e0e0e0] bg-white p-0">
        <h2 className="px-4 pt-4 text-[20px] font-semibold text-[#1f1f1f]">Manage my network</h2>
        <div className="mt-3 divide-y divide-[#f0f0f0]">
          <div className="flex items-center justify-between px-4 py-3 text-[15px] text-[#3a3a3a]">
            <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" />Connections</span>
            <span className="font-semibold text-[#666]">{connections.length}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-[15px] text-[#3a3a3a]">
            <span className="inline-flex items-center gap-2"><UserRoundCheck className="h-4 w-4" />Following & followers</span>
            <span className="font-semibold text-[#666]">0</span>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="rounded-xl border border-[#e0e0e0] bg-white p-0">
          <div className="flex items-center px-5 pt-4 text-[18px] font-semibold">
            <button type="button" className="border-b-[3px] border-[#0a66c2] pb-2 text-[#0a66c2]">Grow</button>
          </div>
        </Card>

        <Card className="rounded-xl border border-[#e0e0e0] bg-white p-0">
          <div className="flex items-center justify-between border-b border-[#ededed] px-5 py-4">
            <h3 className="text-[20px] font-semibold text-[#1f1f1f]">
              Invitations ({incomingPending.length})
            </h3>
            <span className="text-sm font-semibold text-[#444]">Show all</span>
          </div>

          {pending.length === 0 ? (
            <p className="px-5 py-6 text-sm text-text-secondary">No pending invitations</p>
          ) : (
            <div className="divide-y divide-[#f0f0f0]">
              {pending.map((request) => {
                const invitation = getInvitationProfile(request);
                return (
                <div
                  key={request.id}
                  className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[#fafafa]"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    {invitation.profilePhotoUrl ? (
                      <img
                        src={invitation.profilePhotoUrl}
                        alt="Profile"
                        className="h-14 w-14 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#dce6f1] text-base font-semibold text-[#2b5d8d]">
                        {invitation.initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[22px] font-semibold text-[#1f1f1f]">{invitation.name}</p>
                      <p className="text-sm text-text-secondary">{invitation.headline}</p>
                    </div>
                  </div>

                  {(request.direction ?? "incoming") === "incoming" ? (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        className="rounded-full border-[#9aa0a6] px-4"
                        onClick={() => void handleReject(request.id)}
                      >
                        Ignore
                      </Button>
                      <Button className="rounded-full px-4" onClick={() => void handleAccept(request.id)}>
                        Accept
                      </Button>
                    </div>
                  ) : (
                    <span className="text-sm font-semibold text-text-secondary">Pending</span>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </Card>

        {connections.length === 0 ? (
          <Card>
            <p className="text-sm text-text-secondary">
              No connections yet.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {connections.map((connection) => (
              <Card
                key={connection.id}
                className="transition-shadow duration-150 hover:shadow-[0_0_0_1px_#0a66c2,0_2px_8px_rgba(10,102,194,.15)]"
              >
                <div className="h-16 rounded-card bg-gradient-to-r from-[#1d4477] to-[#1568bf]" />
                <div className="-mt-7">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-brand text-lg font-semibold text-white">
                    {String(connection.connected_user_id).slice(0, 2)}
                  </div>
                </div>

                <p className="mt-3 font-semibold">{connection.connected_email}</p>
                <p className="text-sm text-text-secondary">
                  Connected {connection.connected_at}
                </p>

                <Button
                  fullWidth
                  variant="secondary"
                  className="mt-4"
                  onClick={() => navigate(`/messages?user=${connection.connected_user_id}`)}
                >
                  Message
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}