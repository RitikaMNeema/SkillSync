import { MoreHorizontal, Search, Shield, Star, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { MessageThreadView } from "../../components/messages/MessageThreadView";
import { MessageInput } from "../../components/messages/MessageInput";
import { ThreadList } from "../../components/messages/ThreadList";
import { Alert } from "../../components/ui/Alert";
import { Avatar } from "../../components/ui/Avatar";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { Input } from "../../components/ui/Input";
import { authStore } from "../../context/AuthContext";
import { useWebSocket } from "../../hooks/useWebSocket";
import type { Message, Thread } from "../../types/message";

/** Flat illustration for inbox search empty state (LinkedIn-style). */
function SearchInboxEmptyIllustration() {
  return (
    <svg className="mx-auto h-[140px] w-[180px] text-[#b4c6d9]" viewBox="0 0 180 140" aria-hidden>
      <ellipse cx="90" cy="128" rx="52" ry="6" className="fill-[#e8eef4]" />
      <rect x="48" y="72" width="84" height="48" rx="4" className="fill-[#dce8f5]" stroke="#c5d7ea" strokeWidth="1" />
      <rect x="56" y="78" width="68" height="34" rx="2" className="fill-white" />
      <circle cx="72" cy="94" r="6" className="fill-[#0a66c2]/25" />
      <rect x="84" y="90" width="32" height="4" rx="1" className="fill-[#dce8f5]" />
      <rect x="84" y="98" width="24" height="3" rx="1" className="fill-[#eef3f8]" />
      <circle cx="118" cy="46" r="22" className="fill-[#f0d5b8]" />
      <path
        d="M108 38c4-8 14-12 22-8 8 4 12 14 8 24-2 5-8 9-14 10"
        className="fill-none stroke-[#8b6914] stroke-[2.5] stroke-linecap-round"
      />
      <rect x="94" y="58" width="48" height="40" rx="6" className="fill-[#5b8fd8]" />
      <rect x="60" y="100" width="60" height="14" rx="2" className="fill-[#c49a6c]" />
      <path d="M38 112h104" className="stroke-[#a08060] stroke-[1.5]" />
      <circle cx="34" cy="102" r="10" className="fill-[#7cb87c]" />
      <path d="M34 96v12M28 102h12" className="stroke-[#5a9a5a] stroke-[1.5]" />
    </svg>
  );
}

function SearchInboxEmptyState() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-6 pb-8 pt-4 text-center">
      <SearchInboxEmptyIllustration />
      <h2 className="mt-6 text-xl font-semibold text-[#1f1f1f]">Search inbox</h2>
      <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-[#666a73]">
        Search by recipient name, message content, or conversation name
      </p>
    </div>
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
    profileSlug?: string | null;
    recruiterId?: number | null;
    skills?: string[] | null;
  };

  const userId = authStore((state) => state.userId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const [profileAboutExpanded, setProfileAboutExpanded] = useState(false);
  const [starredThreadIds, setStarredThreadIds] = useState<Record<string, boolean>>({});
  const [archivedThreadIds, setArchivedThreadIds] = useState<Record<string, boolean>>({});
  const [mutedThreadIds, setMutedThreadIds] = useState<Record<string, boolean>>({});
  const [forceUnreadThreadIds, setForceUnreadThreadIds] = useState<Record<string, boolean>>({});
  const [hiddenThreadIds, setHiddenThreadIds] = useState<Record<string, boolean>>({});
  const menuRef = useRef<HTMLDivElement | null>(null);
  const handledDeepLinkRef = useRef<string | null>(null);

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
        locationLine: locationLine || null,
        profileSlug: member.profile_slug ?? null,
        recruiterId: null,
        skills: member.skills ?? null
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
        locationLine: null,
        profileSlug: null,
        recruiterId: recruiter.recruiter_id
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
    const preview = (previewByThread[thread.thread_id] ?? "").toLowerCase();
    const q = inboxSearch.trim().toLowerCase();
    const matchesInboxSearch = !q || label.includes(q) || preview.includes(q);
    const unreadCount = displayUnreadCountByThread[thread.thread_id] ?? 0;
    const archived = Boolean(archivedThreadIds[thread.thread_id]);
    const muted = Boolean(mutedThreadIds[thread.thread_id]);

    // Unread should surface every unread thread, including archived ones.
    if (activeFilter === "unread") {
      if (unreadCount === 0) return false;
      return matchesInboxSearch;
    }

    // Muted should surface every muted thread, including archived ones.
    if (activeFilter === "muted") {
      if (!muted) return false;
      return matchesInboxSearch;
    }

    if (activeFilter === "archived" && !archived) return false;
    if (activeFilter !== "archived" && archived) return false;
    return matchesInboxSearch;
  });

  const showInboxSearchEmptyState = Boolean(inboxSearch.trim()) && filteredThreads.length === 0;

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
    const targetUserIdRaw = searchParams.get("user");
    if (!targetUserIdRaw || !userId) return;
    if (handledDeepLinkRef.current === targetUserIdRaw) return;
    const targetUserId = Number(targetUserIdRaw);
    if (!Number.isFinite(targetUserId) || targetUserId <= 0 || targetUserId === userId) return;

    const existingThreadId = threadIdByUserId[targetUserId];
    if (existingThreadId) {
      const existing = threads.find((thread) => thread.thread_id === existingThreadId);
      if (existing) {
        setActiveThread(existing);
        setShowComposer(false);
        handledDeepLinkRef.current = targetUserIdRaw;
        return;
      }
    }

    handledDeepLinkRef.current = targetUserIdRaw;
    void handleCreateThread(targetUserId);
  }, [handleCreateThread, searchParams, threadIdByUserId, threads, userId]);

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
    setProfileAboutExpanded(false);
  }, [activeParticipantId]);

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

  function handleOpenActiveProfile() {
    if (!activeParticipantProfile) return;
    if (activeParticipantProfile.profileSlug) {
      navigate(`/in/${activeParticipantProfile.profileSlug}`);
      return;
    }
    if (activeParticipantProfile.recruiterId) {
      navigate(`/profile/${activeParticipantProfile.recruiterId}?type=recruiter`);
      return;
    }
    toast("Profile page is not available for this user yet.");
  }

  if (loading) {
    return (
      <div className="grid min-h-[74vh] grid-cols-1 gap-0 overflow-hidden rounded-lg border border-[#d9dee3] bg-white shadow-card lg:grid-cols-[minmax(260px,28%)_minmax(0,1fr)_minmax(260px,26%)]">
        <CardSkeleton />
        <CardSkeleton />
        <div className="hidden lg:block">
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (error) return <Alert message={error} />;

  const profileForPanel = activeParticipantProfile;
  const aboutText = profileForPanel?.summary?.trim();
  const aboutLong = Boolean(aboutText && aboutText.length > 180);

  return (
    <div className="overflow-hidden rounded-lg border border-[#d9dee3] bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e8e8] px-4 py-3.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
          <h1 className="shrink-0 text-xl font-semibold tracking-tight text-[#1f1f1f] sm:text-2xl">Messaging</h1>
          <div className="relative flex min-h-10 min-w-[180px] max-w-2xl flex-1 items-center rounded-md border border-transparent bg-[#eef3f8] transition-colors focus-within:border-[#0a66c2] focus-within:bg-white focus-within:shadow-[0_0_0_1px_#0a66c2]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#666a73]" />
            <Input
              value={inboxSearch}
              onChange={(event) => setInboxSearch(event.target.value)}
              placeholder="Search messages"
              aria-label="Search inbox"
              className={`h-10 flex-1 rounded-md border-0 bg-transparent !pl-10 text-[15px] shadow-none placeholder:text-[#666a73] focus:ring-0 ${inboxSearch ? "!pr-10" : "!pr-3"}`}
            />
            {inboxSearch ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[#666a73] transition hover:bg-black/5 hover:text-[#1f1f1f]"
                aria-label="Clear search"
                onClick={() => setInboxSearch("")}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[#e8e8e8] px-4 py-2.5">
        {(
          [
            { id: "all", label: "All" },
            { id: "unread", label: "Unread" },
            { id: "muted", label: "Muted" },
            { id: "archived", label: "Archived" }
          ] as const
        ).map((filter) => {
          const id = filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(id)}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                activeFilter === id ? "border-[#067a46] bg-[#067a46] text-white shadow-sm" : "border-[#cfd6de] bg-white text-[#666a73] hover:border-[#b4c6d9] hover:bg-[#f7f9fb]"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <div className="grid min-h-[74vh] grid-cols-1 lg:grid-cols-[minmax(260px,27%)_minmax(0,1fr)_minmax(260px,26%)]">
        <section className="flex min-h-0 flex-col border-b border-[#e8e8e8] bg-white lg:border-b-0 lg:border-r lg:border-[#e8e8e8]">
          {showComposer ? (
            <div className="shrink-0 space-y-2 border-b border-[#e8e8e8] bg-[#fafafa] p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[#1f1f1f]">New message</p>
                <button
                  type="button"
                  onClick={() => {
                    setShowComposer(false);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className="rounded-full p-1.5 text-[#666a73] transition hover:bg-[#e8e8e8]"
                  aria-label="Close new message composer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Type a name or multiple names"
                className="h-10 rounded-md border border-[#cfcfcf] bg-white text-sm shadow-sm"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSearchUsers();
                  }
                }}
              />
              {searchResults.length ? (
                <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-[#e8e8e8] bg-white p-1 shadow-sm">
                  {searchResults.map((candidate, index) => (
                    <button
                      key={`${candidate.threadId ?? candidate.id ?? candidate.label}-${index}`}
                      type="button"
                      className="flex w-full items-start justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-[#f3f6f8]"
                      onClick={() => void handleSelectTarget(candidate)}
                    >
                      <span className="font-semibold text-[#1f1f1f]">{candidate.label}</span>
                      <span className="shrink-0 text-xs text-[#666a73]">{candidate.subtitle}</span>
                    </button>
                  ))}
                </div>
              ) : searchQuery.trim() && !searchLoading && hasSearched ? (
                <p className="text-sm text-[#666a73]">No users found.</p>
              ) : null}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {showInboxSearchEmptyState ? (
              <SearchInboxEmptyState />
            ) : (
              <ThreadList
                threads={filteredThreads}
                activeThreadId={activeThread?.thread_id ?? null}
                onSelect={setActiveThread}
                threadLabels={threadLabels}
                unreadCountByThread={displayUnreadCountByThread}
                starredThreadIds={starredThreadIds}
                previewByThread={previewByThread}
                onStartNewMessage={() => {
                  setShowComposer(true);
                  setSearchQuery("");
                  setSearchResults([]);
                  setHasSearched(false);
                }}
              />
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col bg-white">
          <div className="shrink-0 border-b border-[#e8e8e8] bg-white px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-lg font-semibold leading-tight text-[#1f1f1f]">
                    {activeThread ? (
                      <button type="button" onClick={handleOpenActiveProfile} className="truncate text-left hover:text-[#0a66c2] hover:underline">
                        {activeThreadLabel}
                      </button>
                    ) : (
                      "New message"
                    )}
                  </p>
                </div>
                <p className="mt-1 truncate text-sm text-[#666a73]">
                  {activeThread ? activeParticipantProfile?.subtitle || websocket.reason : "Type a name or multiple names"}
                </p>
              </div>
              {activeThread ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    className="rounded-full p-2 text-[#d49100] transition hover:bg-[#f3f6f8]"
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
                      className="rounded-full p-2 text-[#666a73] transition hover:bg-[#f3f6f8] hover:text-[#1f1f1f]"
                      aria-label="Conversation actions"
                      onClick={() => setMenuOpen((current) => !current)}
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                    {menuOpen ? (
                      <div className="absolute right-0 top-11 z-20 min-w-[220px] rounded-lg border border-[#e8e8e8] bg-white p-1 shadow-lg">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-[#f3f6f8]"
                          onClick={handleMarkUnread}
                        >
                          Mark unread
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-[#f3f6f8]"
                          onClick={handleToggleStar}
                        >
                          <Star className={`h-4 w-4 ${starredThreadIds[activeThread.thread_id] ? "fill-[#d49100] text-[#d49100]" : ""}`} />
                          {starredThreadIds[activeThread.thread_id] ? "Unstar" : "Star"}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-[#f3f6f8]"
                          onClick={handleToggleMute}
                        >
                          {mutedThreadIds[activeThread.thread_id] ? "Unmute" : "Mute"}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-[#f3f6f8]"
                          onClick={handleToggleArchive}
                        >
                          {archivedThreadIds[activeThread.thread_id] ? "Unarchive" : "Archive"}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[#cc1016] hover:bg-red-50"
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

          <div className="flex min-h-0 flex-1 flex-col bg-[#fafafa] lg:bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 lg:px-5">
              {!activeThread ? (
                <div className="flex min-h-[280px] items-center justify-center px-4 text-sm text-[#666a73]">Select a conversation from the list</div>
              ) : userId ? (
                <MessageThreadView
                  messages={messages}
                  userId={userId}
                  nameByUserId={nameByUserId}
                  profileByUserId={profileByUserId}
                  activeParticipantId={activeParticipantId}
                />
              ) : null}
            </div>

            {activeThread && userId ? (
              <MessageInput onSend={(text) => void handleSend(text)} />
            ) : (
              <div className="shrink-0 border-t border-[#e8e8e8] bg-white px-4 py-3">
                <div className="rounded-xl border border-dashed border-[#cfcfcf] bg-[#fafafa] px-4 py-3 text-sm text-[#666a73]">Write a message…</div>
              </div>
            )}
          </div>
        </section>

        <aside className="hidden min-h-0 flex-col overflow-y-auto border-t border-[#e8e8e8] bg-white lg:flex lg:border-l lg:border-t-0 lg:border-[#e8e8e8]">
          {!activeThread ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center text-sm text-[#666a73]">
              <p className="max-w-[200px] leading-relaxed">Select a conversation to see profile details</p>
            </div>
          ) : profileForPanel ? (
            <div className="flex flex-col gap-0 p-5">
              <div className="flex flex-col items-center border-b border-[#eef3f8] pb-6 text-center">
                <Avatar alt={profileForPanel.name} name={activeAvatarName} src={profileForPanel.photoUrl} size="xl" />
                <h2 className="mt-4 text-center text-lg font-semibold text-[#1f1f1f]">{profileForPanel.name}</h2>
                <p className="mt-2 text-sm font-medium leading-snug text-[#1f1f1f]">{profileForPanel.subtitle}</p>
                {profileForPanel.locationLine ? (
                  <p className="mt-2 text-xs text-[#666a73]">{profileForPanel.locationLine}</p>
                ) : null}
              </div>

              {aboutText ? (
                <div className="border-b border-[#eef3f8] py-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#666a73]">About</h3>
                  <p className={`mt-2 text-sm leading-relaxed text-[#1f1f1f] ${profileAboutExpanded ? "" : "line-clamp-4"}`}>{aboutText}</p>
                  {aboutLong ? (
                    <button
                      type="button"
                      onClick={() => setProfileAboutExpanded((v) => !v)}
                      className="mt-2 text-sm font-semibold text-[#0a66c2] hover:underline"
                    >
                      {profileAboutExpanded ? "Show less" : "Show more"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {profileForPanel.skills?.length ? (
                <div className="border-b border-[#eef3f8] py-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#666a73]">Skills</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profileForPanel.skills.slice(0, 16).map((skill) => (
                      <span key={skill} className="rounded-full border border-[#e8e8e8] bg-[#f3f6f8] px-2.5 py-1 text-xs font-medium text-[#1f1f1f]">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="pt-5">
                <button
                  type="button"
                  onClick={handleOpenActiveProfile}
                  className="w-full rounded-full border-2 border-[#0a66c2] bg-white py-2.5 text-sm font-semibold text-[#0a66c2] shadow-sm transition hover:bg-[#f3f9ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a66c2]"
                >
                  View profile
                </button>
              </div>

              <div className="mt-8 flex gap-2 border-t border-[#eef3f8] pt-5 text-xs leading-snug text-[#666a73]">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#0a66c2]" aria-hidden />
                <span>Direct conversation on SkillSync. Only you and this contact can read these messages.</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <Avatar alt={activeThreadLabel} name={activeAvatarName} size="lg" />
              <p className="mt-4 text-sm font-semibold text-[#1f1f1f]">{activeThreadLabel}</p>
              <p className="mt-2 text-xs text-[#666a73]">Profile details will load when available.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
