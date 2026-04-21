import { Pencil, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getThreadsByUser, listMessages, markThreadRead, openThread, sendMessage } from "../../api/messages";
import { getMember, searchMembers } from "../../api/members";
import { getRecruiter, searchRecruiters } from "../../api/recruiters";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import { useWebSocket } from "../../hooks/useWebSocket";
import type { Message, Thread } from "../../types/message";
import { MessageBubble } from "../../components/messages/MessageBubble";
import { MessageInput } from "../../components/messages/MessageInput";
import { ThreadList } from "../../components/messages/ThreadList";
import { Input } from "../../components/ui/Input";
import { Avatar } from "../../components/ui/Avatar";

export function MessagesPage() {
  type SearchTarget = { id?: number; label: string; subtitle: string; threadId?: string };
  const userId = authStore((state) => state.userId);
  const role = authStore((state) => state.role);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [threadLabels, setThreadLabels] = useState<Record<string, string>>({});
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const [threadIdByUserId, setThreadIdByUserId] = useState<Record<number, string>>({});
  const [showComposer, setShowComposer] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchTarget[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [unreadCountByThread, setUnreadCountByThread] = useState<Record<string, number>>({});
  const [inboxSearch, setInboxSearch] = useState("");

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

  const resolveUserName = useCallback(async (id: string) => {
    const numericId = Number(id);
    if (Number.isNaN(numericId)) return `User ${id}`;
    try {
      const member = await getMember(numericId);
      const first = member.first_name?.trim();
      const last = member.last_name?.trim();
      const fullName = [first, last].filter(Boolean).join(" ").trim();
      return fullName || `Member ${id}`;
    } catch {
      // keep trying recruiter endpoint
    }
    try {
      const recruiter = await getRecruiter(numericId);
      return recruiter.name?.trim() || recruiter.email || `Recruiter ${id}`;
    } catch {
      return `User ${id}`;
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
  const activeThreadLabel = activeThread ? threadLabels[activeThread.thread_id] ?? `Thread ${activeThread.thread_id.slice(0, 8)}` : "Select a conversation";
  const activeAvatarName = activeThreadLabel.split(",")[0]?.trim() || "Thread";
  const filteredThreads = threads.filter((thread) => {
    const label = (threadLabels[thread.thread_id] ?? "").toLowerCase();
    const q = inboxSearch.trim().toLowerCase();
    return !q || label.includes(q);
  });

  const loadThreads = useCallback(async () => {
    if (!userId) return;
    const data = await getThreadsByUser(userId);
    setThreads(data.threads);
    setActiveThread((current) => current ?? data.threads[0] ?? null);
    const nameEntries = new Map<string, string>();
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
            const name = await resolveUserName(id);
            nameEntries.set(id, name);
            return name;
          })
        );
        const suffix = others.length > 2 ? ` +${others.length - 2}` : "";
        return [thread.thread_id, names.join(", ") + suffix] as const;
      })
    );
    setThreadLabels(Object.fromEntries(labels));
    setNameByUserId(Object.fromEntries(nameEntries));
    setThreadIdByUserId(Object.fromEntries(userThreadEntries));
    const unreadEntries = await Promise.all(
      data.threads.map(async (thread) => {
        try {
          const messageData = await listMessages(thread.thread_id);
          const unread = messageData.messages.filter(
            (message) => message.sender_id !== String(userId) && !message.read_by.includes(String(userId))
          ).length;
          return [thread.thread_id, unread] as const;
        } catch {
          return [thread.thread_id, 0] as const;
        }
      })
    );
    setUnreadCountByThread(Object.fromEntries(unreadEntries));
  }, [resolveUserName, userId]);

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
                subtitle: threadIdByUserId[recruiter.recruiter_id] ? "Open existing conversation" : recruiter.company_name || recruiter.email || "Start new conversation",
                threadId: threadIdByUserId[recruiter.recruiter_id]
              }))
          : [];
      const lowerKeyword = keyword.toLowerCase();
      const relevant = dedupeTargets([...memberResults, ...recruiterResults, ...localFallback]).filter((candidate) =>
        `${candidate.label} ${candidate.subtitle}`.toLowerCase().includes(lowerKeyword)
      );
      setSearchResults(relevant);
    } catch {
      // Always keep local-name search usable even if backend search endpoints fail.
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
    });
  }, [activeThread, userId]);

  async function handleSend(text: string) {
    if (!activeThread || !userId) return;
    const sent = await sendMessage(activeThread.thread_id, userId, text);
    if (sent.delivery_status?.kafka === "failed" || sent.delivery_status?.realtime === "failed") {
      toast("Message saved, but background delivery is delayed. It will retry automatically.");
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-[74vh] gap-0 overflow-hidden rounded-2xl border border-[#d9dee3] bg-white shadow-card md:grid-cols-[340px_minmax(0,1fr)]">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (error) return <Alert message={error} />;

  return (
    <div className="grid min-h-[74vh] gap-0 overflow-hidden rounded-2xl border border-[#d9dee3] bg-white shadow-card md:grid-cols-[340px_minmax(0,1fr)]">
      <section className="border-r bg-[#fcfcfd]">
        <div className="flex items-center justify-between border-b bg-white p-4">
          <div>
            <h1 className="text-xl font-semibold">{role === "recruiter" ? "Recruiter Inbox" : "Messaging"}</h1>
            <p className="text-xs text-text-secondary">
              {role === "recruiter" ? "Candidate threads and follow-ups" : "Direct conversations"}
            </p>
          </div>
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
        <div className="border-b bg-white px-3 py-2.5">
          <Input
            value={inboxSearch}
            onChange={(event) => setInboxSearch(event.target.value)}
            placeholder="Search conversations"
            className="h-9 bg-[#f3f6f8]"
          />
        </div>
        {showComposer ? (
          <div className="space-y-2 border-b bg-white p-3">
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
            <p className="text-xs text-text-secondary">Search and pick a person to start a new conversation.</p>
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search candidates by name"
                className="border bg-white"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSearchUsers();
                  }
                }}
              />
              <Button variant="secondary" className="px-3" onClick={() => void handleSearchUsers()} disabled={!searchQuery.trim() || searchLoading}>
                {searchLoading ? "..." : "Find"}
              </Button>
            </div>
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
        <div className="max-h-[calc(74vh-112px)] overflow-y-auto p-2">
          <ThreadList
            threads={filteredThreads}
            activeThreadId={activeThread?.thread_id ?? null}
            onSelect={setActiveThread}
            threadLabels={threadLabels}
            unreadCountByThread={unreadCountByThread}
          />
        </div>
      </section>
      <section className="flex min-h-[74vh] flex-col bg-[#f7f9fb]">
        <div className="border-b bg-white p-4">
          <div className="flex items-center gap-3">
            {activeThread ? <Avatar alt="Active thread" name={activeAvatarName} size="sm" /> : null}
            <div>
              <p className="font-semibold">{activeThreadLabel}</p>
              <p className="text-xs text-text-secondary">{websocket.reason}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto bg-[#f3f2ef] p-4">
          {!activeThread ? (
            <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-text-secondary">
              Select a conversation or start a new one.
            </div>
          ) : messages.length ? (
            messages.map((message) => (
              <MessageBubble key={message.message_id} message={message} own={message.sender_id === String(userId)} senderName={nameByUserId[message.sender_id]} />
            ))
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-text-secondary">
              No messages yet. Send the first message to get started.
            </div>
          )}
        </div>
        {activeThread ? <MessageInput onSend={(text) => void handleSend(text)} /> : null}
      </section>
    </div>
  );
}
