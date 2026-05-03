import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ChevronDown, Lightbulb, MailOpen, MoreHorizontal, Search, UsersRound } from "lucide-react";
import {
  acceptConnection,
  getMutualConnections,
  listConnections,
  listPendingConnections,
  removeConnection,
  rejectConnection,
} from "../../api/connections";
import { getMember } from "../../api/members";
import { getRecruiter } from "../../api/recruiters";
import { Button } from "../../components/ui/Button";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { Connection, MutualConnection, PendingConnection } from "../../types/connection";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { AppShellBreakout, AppShellMainRow } from "../../components/layout/AppShellRegions";
import {
  MutualAvatarStack,
  NetworkCard,
  NetworkCardHeader,
  NetworkGrowCard,
  NetworkListRow,
  NetworkSidebar,
  type NetworkSidebarKey,
} from "../../components/network";
import { APP_SHELL_MAIN_COLUMN_CLASS } from "../../constants/appShellLayout";

function formatConnectedRelative(isoString: string): string {
  const t = new Date(isoString).getTime();
  if (!Number.isFinite(t)) return "Recently";
  const diffMs = Date.now() - t;
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return "Connected today";
  if (days === 1) return "Connected 1 day ago";
  return `Connected ${days} days ago`;
}

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

function connectionInitials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return (email.slice(0, 2) || "?").toUpperCase();
}

type ConnectionProfile = {
  profilePhotoUrl: string | null;
  displayName: string;
  headline: string | null;
};

type InvitationMutualBundle = {
  mutuals: MutualConnection[];
  count: number;
};

async function loadNetworkProfile(userId: number): Promise<ConnectionProfile> {
  try {
    const member = await getMember(userId);
    const memberName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim();
    return {
      profilePhotoUrl: member.profile_photo_url ?? null,
      displayName: memberName || member.email || "Member",
      headline: member.headline?.trim() || null,
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
      displayName: recruiterName,
      headline: recruiter.headline?.trim() || recruiter.role?.trim() || null,
    };
  } catch {
    return {
      profilePhotoUrl: null,
      displayName: "",
      headline: null,
    };
  }
}

export function ConnectionsPage() {
  const userId = authStore((state) => state.userId);
  const navigate = useNavigate();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [pending, setPending] = useState<PendingConnection[]>([]);
  const [invitationProfiles, setInvitationProfiles] = useState<
    Record<number, { profilePhotoUrl: string | null; name: string; headline: string | null }>
  >({});
  const [invitationMutuals, setInvitationMutuals] = useState<Record<number, InvitationMutualBundle | undefined>>({});
  const [connectionProfiles, setConnectionProfiles] = useState<Record<number, ConnectionProfile>>({});
  const [loading, setLoading] = useState(true);
  const [sidebarActive, setSidebarActive] = useState<NetworkSidebarKey>("connections");
  const [connectionQuery, setConnectionQuery] = useState("");
  const [sortKey, setSortKey] = useState<"recent" | "name">("recent");
  const [invitationsMenuOpen, setInvitationsMenuOpen] = useState(false);
  const [activeConnectionMenuId, setActiveConnectionMenuId] = useState<number | null>(null);

  const connectionsListRef = useRef<HTMLDivElement>(null);
  const followingSectionRef = useRef<HTMLDivElement>(null);
  const invitationsMenuRef = useRef<HTMLDivElement>(null);
  const activeConnectionMenuRef = useRef<HTMLDivElement>(null);

  const loadNetworkData = async () => {
    if (!userId) return;

    const [listResult, pendingResult] = await Promise.allSettled([
      listConnections(userId),
      listPendingConnections(userId),
    ]);

    const list = listResult.status === "fulfilled" ? listResult.value : [];
    const pendingList = pendingResult.status === "fulfilled" ? pendingResult.value : [];

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
        const profile = await loadNetworkProfile(memberId);
        return [
          memberId,
          {
            profilePhotoUrl: profile.profilePhotoUrl,
            name: profile.displayName || "Member",
            headline: profile.headline,
          },
        ] as const;
      })
    );
    setInvitationProfiles(Object.fromEntries(entries));

    const incoming = pendingList.filter((r) => (r.direction ?? "incoming") === "incoming");
    const mutualBundles = await Promise.all(
      incoming.map(async (request) => {
        const otherId = request.requester_id;
        try {
          const { mutual_connections, count } = await getMutualConnections(userId, otherId);
          const mutuals = mutual_connections ?? [];
          const c = count ?? mutuals.length;
          return [
            request.id,
            c > 0 ? { mutuals, count: c } : undefined,
          ] as const;
        } catch {
          return [request.id, undefined] as const;
        }
      })
    );
    setInvitationMutuals(Object.fromEntries(mutualBundles));

    const connIds = Array.from(new Set(list.map((c) => c.connected_user_id))).filter((id) => Number.isFinite(id) && id > 0);
    const connEntries = await Promise.all(
      connIds.map(async (memberId) => {
        const profile = await loadNetworkProfile(memberId);
        return [memberId, profile] as const;
      })
    );
    setConnectionProfiles(Object.fromEntries(connEntries));
  };

  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    void loadNetworkData().finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (invitationsMenuOpen && invitationsMenuRef.current && !invitationsMenuRef.current.contains(target)) {
        setInvitationsMenuOpen(false);
      }
      if (activeConnectionMenuId !== null && activeConnectionMenuRef.current && !activeConnectionMenuRef.current.contains(target)) {
        setActiveConnectionMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [invitationsMenuOpen, activeConnectionMenuId]);

  const handleAccept = async (requestId: number) => {
    const t = toast.loading("Accepting…");
    try {
      await acceptConnection(requestId);
      await loadNetworkData();
      toast.success("Invitation accepted", { id: t });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not accept invitation", { id: t });
    }
  };

  const handleReject = async (requestId: number) => {
    const t = toast.loading("Ignoring…");
    try {
      await rejectConnection(requestId);
      await loadNetworkData();
      toast.success("Invitation dismissed", { id: t });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not ignore invitation", { id: t });
    }
  };

  const getInvitationProfile = (request: PendingConnection) => {
    const targetMemberId =
      (request.direction ?? "incoming") === "incoming" ? request.requester_id : request.receiver_id;
    const profile = invitationProfiles[targetMemberId];
    return {
      profilePhotoUrl: profile?.profilePhotoUrl ?? null,
      name: profile?.name || "Member",
      headline: profile?.headline?.trim() || "",
      initials: (request.counterpart_email || request.requester_email || "?").slice(0, 2).toUpperCase(),
    };
  };

  const followingCount = 0;
  const visiblePending = useMemo(
    () => pending.filter((request) => (request.direction ?? "incoming") === "incoming"),
    [pending]
  );

  const filteredConnections = useMemo(() => {
    const q = connectionQuery.trim().toLowerCase();
    let rows = q
      ? connections.filter(
          (c) =>
            c.connected_email.toLowerCase().includes(q) ||
            String(c.connected_user_id).includes(q) ||
            (connectionProfiles[c.connected_user_id]?.displayName ?? "").toLowerCase().includes(q)
        )
      : connections;

    rows = [...rows];
    if (sortKey === "recent") {
      rows.sort((a, b) => new Date(b.connected_at).getTime() - new Date(a.connected_at).getTime());
    } else {
      rows.sort((a, b) => {
        const nameA = (connectionProfiles[a.connected_user_id]?.displayName || a.connected_email).toLowerCase();
        const nameB = (connectionProfiles[b.connected_user_id]?.displayName || b.connected_email).toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }
    return rows;
  }, [connections, connectionQuery, sortKey, connectionProfiles]);

  const handleSidebarSelect = (key: NetworkSidebarKey) => {
    setSidebarActive(key);
    if (key === "connections") {
      connectionsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      followingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleRemoveConnection = async (connectedUserId: number) => {
    if (!userId) return;
    const t = toast.loading("Removing connection…");
    try {
      await removeConnection(userId, connectedUserId);
      await loadNetworkData();
      setActiveConnectionMenuId(null);
      toast.success("Connection removed", { id: t });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not remove connection", { id: t });
    }
  };

  const openProfileByUserId = async (connectedUserId: number) => {
    setActiveConnectionMenuId(null);
    try {
      await getMember(connectedUserId);
      navigate(`/profile/${connectedUserId}`);
      return;
    } catch {
      // Fall back to recruiter profile for connections that are recruiter accounts.
    }
    try {
      await getRecruiter(connectedUserId);
      navigate(`/recruiters/${connectedUserId}`);
    } catch {
      toast.error("Could not open profile");
    }
  };

  const sidebarColumn = (
    <div className="flex w-full flex-col gap-3 md:w-[252px]">
      <NetworkSidebar
        connectionsCount={connections.length}
        followingCount={followingCount}
        active={sidebarActive}
        onSelect={handleSidebarSelect}
      />
      <NetworkGrowCard />
    </div>
  );

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
    <div className="min-h-[calc(100vh-100px)] bg-[#f3f2ef] pb-8 pt-3">
      <AppShellBreakout>
        <AppShellMainRow className="flex-col gap-3.5 md:flex-row md:items-start md:gap-5">
          <div className="shrink-0 md:hidden">{sidebarColumn}</div>

          <aside className="hidden shrink-0 md:block md:w-[252px]">{sidebarColumn}</aside>

          <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
            <NetworkCard padded={false}>
              <div className="border-b border-[#e0dfdc] px-5 pt-1 md:px-6">
                <div className="flex gap-10">
                  <button
                    type="button"
                    className="-mb-px border-b-2 border-[#0a66c2] pb-2.5 pt-2 text-[16px] font-semibold leading-snug tracking-[-0.01em] text-[#0a66c2]"
                    aria-current="page"
                  >
                    My Network
                  </button>
                </div>
              </div>
            </NetworkCard>

          <NetworkCard padded={false}>
            <div className="px-5 pt-4 md:px-6">
              <NetworkCardHeader
                border
                title={
                  <h2 className="text-[18px] font-semibold leading-snug tracking-[-0.015em] text-[#222]">
                    Invitations ({visiblePending.length})
                  </h2>
                }
                action={
                  <div className="relative flex items-center gap-0.5" ref={invitationsMenuRef}>
                    <button
                      type="button"
                      className="px-2 py-1.5 text-sm font-semibold text-[#0a66c2] hover:underline"
                      onClick={() => {
                        setInvitationsMenuOpen(false);
                        navigate("/my-network/invitations");
                      }}
                    >
                      See all
                    </button>
                    <button
                      type="button"
                      className="rounded-full p-2 text-[#666] hover:bg-[#f3f2ef]"
                      aria-label="Invitations menu"
                      onClick={() => setInvitationsMenuOpen((current) => !current)}
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                    {invitationsMenuOpen ? (
                      <div className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-[#e0dfdc] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                        <button
                          type="button"
                          className="block w-full px-4 py-2.5 text-left text-sm text-[#222] hover:bg-[#f3f2ef]"
                          onClick={() => {
                            setInvitationsMenuOpen(false);
                            navigate("/my-network/invitations");
                          }}
                        >
                          Manage invitations
                        </button>
                        <button
                          type="button"
                          className="block w-full px-4 py-2.5 text-left text-sm text-[#222] hover:bg-[#f3f2ef]"
                          onClick={() => {
                            setInvitationsMenuOpen(false);
                            navigate("/my-network/invitations?tab=sent");
                          }}
                        >
                          View sent invitations
                        </button>
                      </div>
                    ) : null}
                  </div>
                }
              />
            </div>
            {visiblePending.length === 0 ? (
              <div className="px-5 pb-7 pt-1 text-center md:px-6">
                <div className="mx-auto mb-4 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-[#f5f7fa] text-[#7a8795]">
                  <MailOpen className="h-7 w-7" />
                </div>
                <p className="text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#222]">
                  No pending invitations
                </p>
                <p className="mx-auto mt-2 max-w-md text-[15px] leading-6 text-[#666]">
                  When someone invites you to connect, you&apos;ll see it here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#e0dfdc]">
                {visiblePending.map((request) => {
                  const invitation = getInvitationProfile(request);
                  const subtitle =
                    invitation.headline ||
                    ((request.direction ?? "incoming") === "incoming"
                      ? "Wants to connect with you"
                      : "Invitation sent");
                  const bundle = invitationMutuals[request.id];
                  const emails = bundle?.mutuals.map((m) => m.email) ?? [];
                  const tertiary =
                    bundle != null && bundle.count > 0 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {bundle.mutuals.length > 0 ? <MutualAvatarStack emails={emails} /> : null}
                        <span className="text-[12px] leading-snug text-[#666]">
                          {bundle.mutuals.length > 0
                            ? mutualCaptionLine(bundle.mutuals, bundle.count)
                            : `${bundle.count} mutual connection${bundle.count === 1 ? "" : "s"}`}
                        </span>
                      </div>
                    ) : undefined;

                  return (
                    <NetworkListRow
                      key={request.id}
                      avatar={
                        <button
                          type="button"
                          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#0a66c2]"
                          onClick={() =>
                            void openProfileByUserId(
                              (request.direction ?? "incoming") === "incoming" ? request.requester_id : request.receiver_id
                            )
                          }
                        >
                          {invitation.profilePhotoUrl ? (
                            <img
                              src={invitation.profilePhotoUrl}
                              alt=""
                              className="h-14 w-14 rounded-full object-cover ring-1 ring-[#e0dfdc]"
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#dce6f1] text-sm font-semibold text-[#2b5d8d] ring-1 ring-[#e0dfdc]">
                              {invitation.initials}
                            </div>
                          )}
                        </button>
                      }
                      primary={
                        <button
                          type="button"
                          className="truncate font-semibold text-left hover:underline"
                          onClick={() =>
                            void openProfileByUserId(
                              (request.direction ?? "incoming") === "incoming" ? request.requester_id : request.receiver_id
                            )
                          }
                        >
                          {invitation.name}
                        </button>
                      }
                      secondary={<span className="line-clamp-2 text-[#666]">{subtitle}</span>}
                      tertiary={tertiary}
                      actions={
                        (request.direction ?? "incoming") === "incoming" ? (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              className="rounded-full border border-[#666] bg-transparent px-4 py-2 text-sm font-semibold text-[#666] hover:bg-[#f3f2ef] hover:text-[#222]"
                              onClick={() => void handleReject(request.id)}
                            >
                              Ignore
                            </Button>
                            <Button
                              type="button"
                              className="rounded-full border-0 bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004182]"
                              onClick={() => void handleAccept(request.id)}
                            >
                              Accept
                            </Button>
                          </>
                        ) : (
                          <span className="text-sm font-semibold text-[#666]">Pending</span>
                        )
                      }
                    />
                  );
                })}
              </div>
            )}
          </NetworkCard>

          <div ref={connectionsListRef}>
            <NetworkCard padded={false}>
              <div className="flex flex-col gap-3.5 border-b border-[#e0dfdc] px-5 py-3.5 md:px-6 md:flex-row md:items-center md:justify-between md:gap-5">
                <h2 className="shrink-0 text-[18px] font-semibold leading-snug tracking-[-0.015em] text-[#222]">
                  Connections ({connections.length})
                </h2>
                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <div className="relative w-full min-w-0 sm:w-[320px] md:w-[320px]">
                    <Search
                      className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#7a7a7a]"
                      aria-hidden
                    />
                    <input
                      type="text"
                      value={connectionQuery}
                      onChange={(e) => setConnectionQuery(e.target.value)}
                      className="h-9 w-full rounded-[6px] border border-[#d6d6d6] bg-white !pl-12 pr-3 text-[15px] font-normal text-[#222] placeholder:text-[#757575] focus:border-[#666666] focus:outline-none focus-visible:border-[#666666]"
                      aria-label="Search connections"
                      placeholder="Search connections"
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[15px]">
                    <span className="whitespace-nowrap text-[#666]">Sort by:</span>
                    <div className="relative inline-block">
                      <select
                        value={sortKey}
                        onChange={(e) => setSortKey(e.target.value as "recent" | "name")}
                        aria-label="Sort connections"
                        className="h-9 cursor-pointer appearance-none rounded-[6px] border border-[#d6d6d6] bg-white py-2 pl-3 pr-9 text-[15px] font-semibold leading-none text-[#222] focus:border-[#0a66c2] focus:outline-none"
                      >
                        <option value="recent">Recently added</option>
                        <option value="name">First name</option>
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-2.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#666]"
                        aria-hidden
                      />
                    </div>
                  </div>
                </div>
              </div>
              {connections.length === 0 ? (
                <div className="px-5 py-9 text-center md:px-6">
                  <div className="mx-auto mb-4 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-[#f5f7fa] text-[#7a8795]">
                    <UsersRound className="h-8 w-8" />
                  </div>
                  <p className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#222]">
                    You haven’t made any connections yet
                  </p>
                  <p className="mx-auto mt-2 max-w-lg text-[15px] leading-6 text-[#666]">
                    Start building your network by connecting with people you know.
                  </p>
                  <Button
                    type="button"
                    className="mt-5 rounded-full bg-[#0a66c2] px-6 py-2.5 text-[14px] font-semibold text-white hover:bg-[#004182]"
                    onClick={() => navigate("/search")}
                  >
                    Find connections
                  </Button>
                </div>
              ) : filteredConnections.length === 0 ? (
                <p className="px-5 py-5 text-[15px] leading-snug text-[#666] md:px-6">No connections match your search.</p>
              ) : (
                <div className="divide-y divide-[#e0dfdc]">
                  {filteredConnections.map((connection) => {
                    const prof = connectionProfiles[connection.connected_user_id];
                    const displayName = prof?.displayName?.trim() || connection.connected_email;
                    const headline = prof?.headline?.trim() || null;
                    const initials = connectionInitials(displayName, connection.connected_email);
                    const showOnline = connection.connected_user_id % 7 === 0;

                    return (
                      <NetworkListRow
                        key={connection.id}
                        avatar={
                          <button
                            type="button"
                            className="relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#0a66c2]"
                            onClick={() => void openProfileByUserId(connection.connected_user_id)}
                          >
                            {prof?.profilePhotoUrl ? (
                              <img
                                src={prof.profilePhotoUrl}
                                alt=""
                                className="h-14 w-14 rounded-full object-cover ring-1 ring-[#e0dfdc]"
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#dce6f1] text-sm font-semibold text-[#2b5d8d] ring-1 ring-[#e0dfdc]">
                                {initials}
                              </div>
                            )}
                            {showOnline ? (
                              <span
                                className="absolute bottom-0.5 right-0.5 h-3 w-3.5 rounded-full border-2 border-white bg-[#057642]"
                                title="Online"
                                aria-hidden
                              />
                            ) : null}
                          </button>
                        }
                        primary={
                          <span className="truncate">
                            <button
                              type="button"
                              className="font-semibold text-[#222] hover:underline"
                              onClick={() => void openProfileByUserId(connection.connected_user_id)}
                            >
                              {displayName}
                            </button>
                            <span className="font-semibold text-[#666]"> · 1st</span>
                          </span>
                        }
                        secondary={
                          headline ? (
                            <span className="line-clamp-2 text-sm text-[#666]">{headline}</span>
                          ) : (
                            <span className="text-sm text-[#666]">Member on SkillSync</span>
                          )
                        }
                        tertiary={
                          <span className="text-[13px] text-[#666]">{formatConnectedRelative(connection.connected_at)}</span>
                        }
                        actions={
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              className="rounded-full border-[1.5px] border-[#0a66c2] bg-transparent px-4 py-2 text-sm font-semibold text-[#0a66c2] hover:bg-[#eef3f8]"
                              onClick={() => navigate(`/messages?user=${connection.connected_user_id}`)}
                            >
                              Message
                            </Button>
                            <div
                              className="relative"
                              ref={activeConnectionMenuId === connection.id ? activeConnectionMenuRef : null}
                            >
                              <button
                                type="button"
                                className="rounded-full p-2 text-[#666] hover:bg-[#f3f2ef]"
                                aria-label="Connection options"
                                onClick={() =>
                                  setActiveConnectionMenuId((current) =>
                                    current === connection.id ? null : connection.id
                                  )
                                }
                              >
                                <MoreHorizontal className="h-5 w-5" />
                              </button>
                              {activeConnectionMenuId === connection.id ? (
                                <div className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-[#e0dfdc] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                                  <button
                                    type="button"
                                    className="block w-full px-4 py-2.5 text-left text-sm text-[#222] hover:bg-[#f3f2ef]"
                                    onClick={() => void handleRemoveConnection(connection.connected_user_id)}
                                  >
                                    Remove connection
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </>
                        }
                      />
                    );
                  })}
                </div>
              )}
              <div className="flex flex-col gap-2 border-t border-[#e0dfdc] bg-[#fffdf4] px-5 py-2.5 sm:flex-row sm:items-center sm:justify-between md:px-6">
                <p className="inline-flex items-start gap-2.5 text-[13px] leading-5 text-[#6b7280] sm:items-center">
                  <Lightbulb className="mt-0.5 h-[15px] w-[15px] shrink-0 text-[#b08900] sm:mt-0" />
                  Tip: Personalize your invitation to increase acceptance rates.
                </p>
                <button
                  type="button"
                  className="shrink-0 self-start text-left text-[13px] font-semibold text-[#0a66c2] hover:underline sm:self-auto sm:text-right"
                  onClick={() => navigate("/search")}
                >
                  Learn how
                </button>
              </div>
            </NetworkCard>
          </div>

          <div ref={followingSectionRef} className="h-px scroll-mt-[88px] w-full" aria-hidden />
        </div>

        <div className="hidden w-0 shrink-0 xl:block" aria-hidden />
        </AppShellMainRow>
      </AppShellBreakout>
    </div>
  );
}
