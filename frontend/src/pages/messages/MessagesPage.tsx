import { MoreHorizontal, Pencil, Search, Star, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  getThreadPreferences,
  getThreadsByUser,
  listMessages,
  markThreadRead,
  openThread,
  sendMessage,
  updateThreadPreferences
} from "../../api/messages";
import { getMember, searchMembers } from "../../api/members";
import { getRecruiter, searchRecruiters } from "../../api/recruiters";
import { MessageBubble } from "../../components/messages/MessageBubble";
import { MessageInput } from "../../components/messages/MessageInput";
import { ThreadList } from "../../components/messages/ThreadList";
import { Alert } from "../../components/ui/Alert";
import { Avatar } from "../../components/ui/Avatar";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { Input } from "../../components/ui/Input";
import { authStore } from "../../context/AuthContext";
import { useWebSocket } from "../../hooks/useWebSocket";
import type { Message, Thread } from "../../types/message";
import { formatDate } from "../../utils/formatDate";

function LinkedInMark() {
  return (
    <span className="inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-[2px] bg-[#0a66c2] px-[3px] text-[9px] font-bold text-white">
      in
    </span>
  );
}

export function MessagesPage() {
  type SearchTarget = { id?: number; label: string; subtitle: string; threadId?: string };
  type ParticipantProfile = {
    name: string;
    subtitle: string;
    photoUrl?: string | null;
    summary?: string | null;
    locationLine?: string | null;
  };

  const userId = authStore((state) => state.userId);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [threadLabels, setThreadLabels] = useState<Record<string, string>>({});
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const [profileByUserId, setProfileByUserId] = useState<Record<string, ParticipantProfile>>({});
  const [threadIdByUserId, setThreadIdByUserId] = useState<Record<number, string>>({});
  const [showComposer, setShowComposer] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchTarget[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [unreadCountByThread, setUnreadCountByThread] = useState<Record<string, number>>({});
  const [previewByThread, setPreviewByThread] = useState<Record<string, string>>({});
  const [inboxSearch, setInboxSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "unread" | "muted" | "archived">("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [starredThreadIds, setStarredThreadIds] = useState<Record<string, boolean>>({});
  const [archivedThreadIds, setArchivedThreadIds] = useState<Record<string, boolean>>({});
  const [mutedThreadIds, setMutedThreadIds] = useState<Record<string, boolean>>({});
  const [forceUnreadThreadIds, setForceUnreadThreadIds] = useState<Record<string, boolean>>({});
  const [hiddenThreadIds, setHiddenThreadIds] = useState<Record<string, boolean>>({});
  const menuRef = useRef<HTMLDivElement | null>(null);

  const dedupeTargets = useCallback((items: SearchTarget[]) => {
    const seen = new Set<string>();
    const sorted = [...items].sort((a, b) => Number(Boolean(b.threadId)) - Number(Boolean(a.threadId)));
    return sorted.filter((item) => {
      const key = item.threadId
        ? `thread:${item.threadId}`
        : item.id
          ? `id:${item.id}`
          : `label:${item.label.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  const getLocalMatches = useCallback(
    (keyword: string): SearchTarget[] => {
      const lowerKeyword = keyword.toLowerCase();
      const localMatches: SearchTarget[] = Object.entries(nameByUserId)
        .map(([id, label]) => ({ id: Number(id), label }))
        .filter((candidate) => !Number.isNaN(candidate.id) && candidate.id !== userId)
        .filter((candidate) => candidate.label.toLowerCase().includes(lowerKeyword))
        .map((candidate) => ({
          id: candidate.id,
          label: candidate.label,
          subtitle: threadIdByUserId[candidate.id] ? "Open existing conversation" : "Start new conversation",
          threadId: threadIdByUserId[candidate.id]
        }));

      const threadMatches: SearchTarget[] = threads
        .filter((thread) => {
          const label = threadLabels[thread.thread_id] ?? "";
          return label.toLowerCase().includes(lowerKeyword);
        })
        .map((thread) => ({
          label: threadLabels[thread.thread_id] ?? `Conversation ${thread.thread_id.slice(0, 6)}`,
          subtitle: "Open existing conversation",
          threadId: thread.thread_id
        }));

      return dedupeTargets([...threadMatches, ...localMatches]);
    },
    [dedupeTargets, nameByUserId, threadIdByUserId, threads, threadLabels, userId]
  );

  const resolveUserProfile = useCallback(async (id: string): Promise<ParticipantProfile> => {
    const numericId = Number(id);
    if (Number.isNaN(numericId)) return { name: `User ${id}`, subtitle: "Conversation", photoUrl: null };
    try {
      const member = await getMember(numericId);
      const first = member.first_name?.trim();
      const last = member.last_name?.trim();
      const fullName = [first, last].filter(Boolean).join(" ").trim();
      const locationLine = [member.location_city, member.location_state, member.location_country].filter(Boolean).join(", ");
      return {
        name: fullName || `Member ${id}`,
        subtitle: member.headline?.trim() || "Member",
        photoUrl: member.profile_photo_url ?? null,
        summary: member.summary?.trim() || null,
        locationLine: locationLine || null
      };
    } catch {
      // keep trying recruiter endpoint
    }
    try {
      const recruiter = await getRecruiter(numericId);
      return {
        name: recruiter.name?.trim() || recruiter.email || `Recruiter ${id}`,
        subtitle: recruiter.role?.trim() || recruiter.company_name || "Recruiter",
        photoUrl: null,
        summary: null,
        locationLine: null
      };
    } catch {
      return { name: `User ${id}`, subtitle: "Conversation", photoUrl: null };
    }
  }, []);

  const handleRealtimeMessage = useCallback(
    (incoming: Message) => {
      if (incoming.thread_id !== activeThread?.thread_id) return;
      setMessages((current) => {
        if (current.some((message) => message.message_id === incoming.message_id)) {
          return current;
        }
        return [...current, incoming];
      });
    },
    [activeThread?.thread_id]
  );

  const websocket = useWebSocket(activeThread?.thread_id ?? null, handleRealtimeMessage);
  const activeParticipantId = activeThread?.participant_ids.find((id) => id !== String(userId)) ?? null;
  const activeParticipantProfile = activeParticipantId ? profileByUserId[activeParticipantId] : undefined;
  const activeThreadLabel =
    activeParticipantProfile?.name ??
    (activeThread ? threadLabels[activeThread.thread_id] ?? `Thread ${activeThread.thread_id.slice(0, 8)}` : "Select a conversation");
  const activeAvatarName = activeParticipantProfile?.name?.split(" ")[0] || activeThreadLabel.split(",")[0]?.trim() || "Thread";

  const threadDayBanner = useMemo(() => {
    if (!messages.length) return "TODAY";
    const first = new Date(messages[0].timestamp);
    const today = new Date();
    const sameDay =
      first.getFullYear() === today.getFullYear() &&
      first.getMonth() === today.getMonth() &&
      first.getDate() === today.getDate();
    if (sameDay) return "TODAY";
    return formatDate(messages[0].timestamp, "EEE, MMM d").toUpperCase();
  }, [messages]);

  const displayUnreadCountByThread = useMemo(
    () =>
      Object.fromEntries(
        threads.map((thread) => {
          const base = unreadCountByThread[thread.thread_id] ?? 0;
          const forced = forceUnreadThreadIds[thread.thread_id] ? 1 : 0;
          return [thread.thread_id, Math.max(base, forced)];
        })
      ),
    [forceUnreadThreadIds, threads, unreadCountByThread]
  );

  const filteredThreads = threads.filter((thread) => {
    if (hiddenThreadIds[thread.thread_id]) return false;
    const label = (threadLabels[thread.thread_id] ?? "").toLowerCase();
    const q = inboxSearch.trim().toLowerCase();
    const unreadCount = displayUnreadCountByThread[thread.thread_id] ?? 0;
    const archived = Boolean(archivedThreadIds[thread.thread_id]);
    const muted = Boolean(mutedThreadIds[thread.thread_id]);
    if (activeFilter === "archived" && !archived) return false;
    if (activeFilter !== "archived" && archived) return false;
    if (activeFilter === "unread" && unreadCount === 0) return false;
    if (activeFilter === "muted" && !muted) return false;
    return !q || label.includes(q);
  });

  useEffect(() => {
    if (!activeThread) return;
    if (!filteredThreads.some((thread) => thread.thread_id === activeThread.thread_id)) {
      setActiveThread(filteredThreads[0] ?? null);
      if (!filteredThreads.length) {
        setMessages([]);
      }
    }
  }, [activeThread, filteredThreads]);

  const loadThreads = useCallback(async () => {
    if (!userId) return;
    const data = await getThreadsByUser(userId);
    setThreads(data.threads);
    setActiveThread((current) => current ?? data.threads[0] ?? null);
    const nameEntries = new Map<string, string>();
    const profileEntries = new Map<string, ParticipantProfile>();
    const userThreadEntries = new Map<number, string>();
    const labels = await Promise.all(
      data.threads.map(async (thread) => {
        const others = thread.participant_ids.filter((id) => id !== String(userId));
        if (!others.length) return [thread.thread_id, "Saved messages"] as const;
        for (const otherId of others) {
          const asNumber = Number(otherId);
          if (!Number.isNaN(asNumber) && !userThreadEntries.has(asNumber)) {
            userThreadEntries.set(asNumber, thread.thread_id);
          }
        }
        const names = await Promise.all(
          others.slice(0, 2).map(async (id) => {
            const profile = await resolveUserProfile(id);
            profileEntries.set(id, profile);
            nameEntries.set(id, profile.name);
            return profile.name;
          })
        );
        const suffix = others.length > 2 ? ` +${others.length - 2}` : "";
        return [thread.thread_id, names.join(", ") + suffix] as const;
      })
    );

    const selfId = String(userId);
    const selfProfile = await resolveUserProfile(selfId);
    nameEntries.set(selfId, selfProfile.name);
    profileEntries.set(selfId, selfProfile);

    setThreadLabels(Object.fromEntries(labels));
    setNameByUserId(Object.fromEntries(nameEntries));
    setProfileByUserId(Object.fromEntries(profileEntries));
    setThreadIdByUserId(Object.fromEntries(userThreadEntries));

    const unreadEntries = await Promise.all(
      data.threads.map(async (thread) => {
        try {
          const messageData = await listMessages(thread.thread_id);
          const lastMessage = messageData.messages[messageData.messages.length - 1];
          const unread = messageData.messages.filter(
            (message) => message.sender_id !== String(userId) && !message.read_by.includes(String(userId))
          ).length;
          return [thread.thread_id, unread, lastMessage?.text ?? "No messages yet"] as const;
        } catch {
          return [thread.thread_id, 0, "No messages yet"] as const;
        }
      })
    );
    setUnreadCountByThread(Object.fromEntries(unreadEntries.map(([threadId, unread]) => [threadId, unread])));
    setPreviewByThread(Object.fromEntries(unreadEntries.map(([threadId, _unread, preview]) => [threadId, preview])));
  }, [resolveUserProfile, userId]);

  useEffect(() => {
    if (!userId) return;
    void loadThreads().then(
      () => setLoading(false),
      () => {
        setError("Could not load messages.");
        setLoading(false);
      }
    );
  }, [loadThreads, userId]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function handleOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [activeThread?.thread_id]);

  useEffect(() => {
    if (!userId) return;
    void getThreadPreferences()
      .then((data) => {
        const prefs = Object.values(data.preferences ?? {});
        const starred: Record<string, boolean> = {};
        const archived: Record<string, boolean> = {};
        const muted: Record<string, boolean> = {};
        const forceUnread: Record<string, boolean> = {};
        const hidden: Record<string, boolean> = {};
        for (const pref of prefs) {
          if (pref.starred) starred[pref.thread_id] = true;
          if (pref.archived) archived[pref.thread_id] = true;
          if (pref.muted) muted[pref.thread_id] = true;
          if (pref.force_unread) forceUnread[pref.thread_id] = true;
          if (pref.hidden) hidden[pref.thread_id] = true;
        }
        setStarredThreadIds(starred);
        setArchivedThreadIds(archived);
        setMutedThreadIds(muted);
        setForceUnreadThreadIds(forceUnread);
        setHiddenThreadIds(hidden);
      })
      .catch(() => {
        setStarredThreadIds({});
        setArchivedThreadIds({});
        setMutedThreadIds({});
        setForceUnreadThreadIds({});
        setHiddenThreadIds({});
      });
  }, [userId]);

  async function handleCreateThread(participantId: number) {
    if (!userId || participantId === userId) return;
    try {
      const createdThread = await openThread([userId, participantId]);
      await loadThreads();
      setActiveThread(createdThread);
      setShowComposer(false);
      setSearchQuery("");
      setSearchResults([]);
    } catch {
      setError("Could not create conversation.");
    }
  }

  async function handleSelectTarget(target: SearchTarget) {
    if (target.threadId) {
      const existing = threads.find((thread) => thread.thread_id === target.threadId);
      if (existing) {
        setActiveThread(existing);
        setShowComposer(false);
        setSearchQuery("");
        setSearchResults([]);
        return;
      }
    }
    if (target.id) {
      await handleCreateThread(target.id);
    }
  }

  async function handleSearchUsers() {
    const keyword = searchQuery.trim();
    if (!keyword || !userId) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setHasSearched(true);
    setSearchLoading(true);
    const localFallback = getLocalMatches(keyword);
    try {
      const [membersResult, recruitersResult] = await Promise.allSettled([
        searchMembers({ keyword, page: 1 }),
        searchRecruiters({ name: keyword, page: 1 })
      ]);
      const memberResults: SearchTarget[] =
        membersResult.status === "fulfilled"
          ? membersResult.value.members
              .filter((member) => member.member_id !== userId)
              .slice(0, 6)
              .map((member) => ({
                id: member.member_id,
                label: `${member.first_name} ${member.last_name}`.trim(),
                subtitle: threadIdByUserId[member.member_id] ? "Open existing conversation" : member.headline || "Start new conversation",
                threadId: threadIdByUserId[member.member_id]
              }))
          : [];
      const recruiterResults: SearchTarget[] =
        recruitersResult.status === "fulfilled"
          ? recruitersResult.value.recruiters
              .filter((recruiter) => recruiter.recruiter_id !== userId)
              .slice(0, 6)
              .map((recruiter) => ({
                id: recruiter.recruiter_id,
                label: recruiter.name,
                subtitle:
                  threadIdByUserId[recruiter.recruiter_id] ? "Open existing conversation" : recruiter.company_name || recruiter.email || "Start new conversation",
                threadId: threadIdByUserId[recruiter.recruiter_id]
              }))
          : [];
      const lowerKeyword = keyword.toLowerCase();
      const relevant = dedupeTargets([...memberResults, ...recruiterResults, ...localFallback]).filter((candidate) =>
        `${candidate.label} ${candidate.subtitle}`.toLowerCase().includes(lowerKeyword)
      );
      setSearchResults(relevant);
    } catch {
      setSearchResults(localFallback);
    } finally {
      setSearchLoading(false);
    }
  }

  useEffect(() => {
    const keyword = searchQuery.trim();
    if (!showComposer) return;
    if (!keyword) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setSearchResults(getLocalMatches(keyword));
    const timer = setTimeout(() => {
      void handleSearchUsers();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, showComposer, getLocalMatches]);

  useEffect(() => {
    if (!activeThread || !userId) return;
    void listMessages(activeThread.thread_id).then((data) => {
      setMessages(data.messages);
      void markThreadRead(activeThread.thread_id, userId);
      setUnreadCountByThread((current) => ({ ...current, [activeThread.thread_id]: 0 }));
      setForceUnreadThreadIds((current) => {
        if (!current[activeThread.thread_id]) return current;
        void updateThreadPreferences({ thread_id: activeThread.thread_id, force_unread: false });
        const next = { ...current };
        delete next[activeThread.thread_id];
        return next;
      });
    });
  }, [activeThread, userId]);

  async function handleToggleStar() {
    if (!activeThread) return;
    const threadId = activeThread.thread_id;
    const nextValue = !starredThreadIds[threadId];
    setStarredThreadIds((current) => ({ ...current, [threadId]: nextValue }));
    await updateThreadPreferences({ thread_id: threadId, starred: nextValue });
    setMenuOpen(false);
  }

  async function handleMarkUnread() {
    if (!activeThread) return;
    const threadId = activeThread.thread_id;
    setForceUnreadThreadIds((current) => ({ ...current, [threadId]: true }));
    await updateThreadPreferences({ thread_id: threadId, force_unread: true });
    setMenuOpen(false);
  }

  async function handleToggleMute() {
    if (!activeThread) return;
    const threadId = activeThread.thread_id;
    const nextValue = !mutedThreadIds[threadId];
    setMutedThreadIds((current) => ({ ...current, [threadId]: nextValue }));
    await updateThreadPreferences({ thread_id: threadId, muted: nextValue });
    setMenuOpen(false);
    toast.success(mutedThreadIds[threadId] ? "Conversation unmuted" : "Conversation muted");
  }

  async function handleToggleArchive() {
    if (!activeThread) return;
    const threadId = activeThread.thread_id;
    const willArchive = !archivedThreadIds[threadId];
    setArchivedThreadIds((current) => ({ ...current, [threadId]: !current[threadId] }));
    await updateThreadPreferences({ thread_id: threadId, archived: willArchive });
    if (willArchive) {
      setActiveThread(null);
      setMessages([]);
    }
    setMenuOpen(false);
    toast.success(willArchive ? "Conversation archived" : "Conversation moved to inbox");
  }

  async function handleDeleteConversation() {
    if (!activeThread) return;
    const threadId = activeThread.thread_id;
    setHiddenThreadIds((current) => ({ ...current, [threadId]: true }));
    await updateThreadPreferences({ thread_id: threadId, hidden: true });
    setThreads((current) => current.filter((thread) => thread.thread_id !== threadId));
    setActiveThread(null);
    setMessages([]);
    setMenuOpen(false);
    toast.success("Conversation removed from your inbox");
  }

  async function handleSend(text: string) {
    if (!activeThread || !userId) return;
    const sent = await sendMessage(activeThread.thread_id, userId, text);
    if (sent.delivery_status?.kafka === "failed" || sent.delivery_status?.realtime === "failed") {
      toast("Message saved, but background delivery is delayed. It will retry automatically.");
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-[74vh] gap-0 overflow-hidden rounded-2xl border border-[#d9dee3] bg-white shadow-card md:grid-cols-[390px_minmax(0,1fr)]">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (error) return <Alert message={error} />;

  return (
    <div className="overflow-hidden rounded-lg border border-[#d9dee3] bg-white shadow-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="shrink-0 text-2xl font-semibold">Messaging</h1>
          <div className="relative w-[320px] max-w-[42vw]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={inboxSearch}
              onChange={(event) => setInboxSearch(event.target.value)}
              placeholder="Search messages"
              className="h-10 rounded-lg bg-[#eef3f8] !pl-12 pr-3"
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setShowComposer(true);
              setSearchResults([]);
              setSearchQuery("");
            }}
            className="rounded-full p-2 text-text-secondary transition hover:bg-hover hover:text-brand"
            aria-label="Start new conversation"
          >
            <Pencil className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b px-4 py-2">
        {[
          { id: "all", label: "All" },
          { id: "unread", label: "Unread" },
          { id: "muted", label: "Muted" },
          { id: "archived", label: "Archived" }
        ].map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setActiveFilter(filter.id as "all" | "unread" | "muted" | "archived")}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              activeFilter === filter.id ? "border-[#067a46] bg-[#067a46] text-white" : "border-[#cfd6de] bg-white text-text-secondary hover:bg-[#f7f9fb]"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-[74vh] md:grid-cols-[390px_minmax(0,1fr)]">
        <section className="border-r bg-white">
          {showComposer ? (
            <div className="space-y-2 border-b p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">New message</p>
                <button
                  type="button"
                  onClick={() => {
                    setShowComposer(false);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className="rounded-full p-1 text-text-secondary hover:bg-hover"
                  aria-label="Close new message composer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Type a name or multiple names"
                className="h-10 rounded-md border"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSearchUsers();
                  }
                }}
              />
              {searchResults.length ? (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-card border p-1">
                  {searchResults.map((candidate, index) => (
                    <button
                      key={`${candidate.threadId ?? candidate.id ?? candidate.label}-${index}`}
                      type="button"
                      className="flex w-full items-start justify-between rounded-card px-3 py-2 text-left hover:bg-hover"
                      onClick={() => void handleSelectTarget(candidate)}
                    >
                      <span className="font-medium">{candidate.label}</span>
                      <span className="text-xs text-text-secondary">{candidate.subtitle}</span>
                    </button>
                  ))}
                </div>
              ) : searchQuery.trim() && !searchLoading && hasSearched ? (
                <p className="text-sm text-text-secondary">No users found.</p>
              ) : null}
            </div>
          ) : null}

          <div className="max-h-[calc(74vh-64px)] overflow-y-auto p-2">
            <ThreadList
              threads={filteredThreads}
              activeThreadId={activeThread?.thread_id ?? null}
              onSelect={setActiveThread}
              threadLabels={threadLabels}
              unreadCountByThread={displayUnreadCountByThread}
              starredThreadIds={starredThreadIds}
              previewByThread={previewByThread}
            />
          </div>
        </section>

        <section className="flex min-h-[74vh] flex-col bg-white">
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold text-[#1f1f1f]">{activeThread ? activeThreadLabel : "New message"}</p>
                <p className="mt-0.5 truncate text-sm text-text-secondary">
                  {activeThread ? activeParticipantProfile?.subtitle || websocket.reason : "Type a name or multiple names"}
                </p>
              </div>
              {activeThread ? (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className="rounded-full p-2 text-[#d49100] transition hover:bg-hover"
                    aria-label={starredThreadIds[activeThread.thread_id] ? "Unstar conversation" : "Star conversation"}
                    onClick={handleToggleStar}
                  >
                    <Star
                      className={`h-5 w-5 ${
                        starredThreadIds[activeThread.thread_id] ? "fill-[#d49100] text-[#d49100]" : "text-[#d49100]"
                      }`}
                    />
                  </button>
                  <div ref={menuRef} className="relative">
                    <button
                      type="button"
                      className="rounded-full p-2 text-text-secondary transition hover:bg-hover hover:text-text-primary"
                      aria-label="Conversation actions"
                      onClick={() => setMenuOpen((current) => !current)}
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                    {menuOpen ? (
                      <div className="absolute right-0 top-11 z-20 min-w-[220px] rounded-card border bg-white p-1 shadow-modal">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left text-sm hover:bg-hover"
                          onClick={handleMarkUnread}
                        >
                          Mark unread
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left text-sm hover:bg-hover"
                          onClick={handleToggleStar}
                        >
                          <Star className={`h-4 w-4 ${starredThreadIds[activeThread.thread_id] ? "fill-[#d49100] text-[#d49100]" : ""}`} />
                          {starredThreadIds[activeThread.thread_id] ? "Unstar" : "Star"}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left text-sm hover:bg-hover"
                          onClick={handleToggleMute}
                        >
                          {mutedThreadIds[activeThread.thread_id] ? "Unmute" : "Mute"}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left text-sm hover:bg-hover"
                          onClick={handleToggleArchive}
                        >
                          {archivedThreadIds[activeThread.thread_id] ? "Unarchive" : "Archive"}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left text-sm text-[#cc1016] hover:bg-red-50"
                          onClick={handleDeleteConversation}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete conversation
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-white">
            {!activeThread ? (
              <div className="min-h-[320px] p-4" />
            ) : (
              <div className="px-4 pb-4 pt-2">
                {activeParticipantProfile ? (
                  <div className="border-b border-[#eef3f8] pb-6 pt-2">
                    <div className="flex gap-5">
                      <Avatar alt={activeParticipantProfile.name} name={activeAvatarName} src={activeParticipantProfile.photoUrl} size="2xl" />
                      <div className="min-w-0 flex-1 pt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xl font-semibold text-[#1f1f1f]">{activeParticipantProfile.name}</span>
                          <LinkedInMark />
                        </div>
                        <p className="mt-2 text-sm leading-snug text-[#1f1f1f]">{activeParticipantProfile.subtitle}</p>
                        {activeParticipantProfile.summary ? <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-text-secondary">{activeParticipantProfile.summary}</p> : null}
                        {activeParticipantProfile.locationLine ? <p className="mt-2 text-xs text-text-tertiary">{activeParticipantProfile.locationLine}</p> : null}
                      </div>
                    </div>
                    <div className="relative mt-8">
                      <div className="border-t border-[#e0e0e0]" />
                      <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                        {threadDayBanner}
                      </span>
                    </div>
                  </div>
                ) : null}

                {messages.length ? (
                  <div className="divide-y divide-[#eef3f8]">
                    {messages.map((message) => (
                      <MessageBubble
                        key={message.message_id}
                        message={message}
                        own={message.sender_id === String(userId)}
                        senderName={nameByUserId[message.sender_id]}
                        senderAvatar={profileByUserId[message.sender_id]?.photoUrl}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-[200px] items-center justify-center px-4 py-8 text-sm text-text-secondary">
                    No messages yet. Send the first message to get started.
                  </div>
                )}
              </div>
            )}
          </div>

          {activeThread ? (
            <div className="border-t bg-[#f8fafc] p-3">
              <MessageInput onSend={(text) => void handleSend(text)} />
            </div>
          ) : (
            <div className="border-t bg-[#f8fafc] p-3">
              <div className="rounded-2xl bg-[#e9e7e3] p-4 text-[20px] text-[#5f5f5f]">Write a message...</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
