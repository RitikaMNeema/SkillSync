import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { getThreadsByUser, listMessages, markThreadRead, sendMessage } from "../../api/messages";
import { Alert } from "../../components/ui/Alert";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import { useWebSocket } from "../../hooks/useWebSocket";
import type { Message, Thread } from "../../types/message";
import { MessageBubble } from "../../components/messages/MessageBubble";
import { MessageInput } from "../../components/messages/MessageInput";
import { ThreadList } from "../../components/messages/ThreadList";
import { Input } from "../../components/ui/Input";

export function MessagesPage() {
  const userId = authStore((state) => state.userId);
  const websocket = useWebSocket();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    void getThreadsByUser(userId).then(
      (data) => {
        setThreads(data.threads);
        setActiveThread(data.threads[0] ?? null);
        setLoading(false);
      },
      () => {
        setError("Could not load messages.");
        setLoading(false);
      }
    );
  }, [userId]);

  useEffect(() => {
    if (!activeThread || !userId) return;
    void listMessages(activeThread.thread_id).then((data) => {
      setMessages(data.messages);
      void markThreadRead(activeThread.thread_id, userId);
    });
  }, [activeThread, userId]);

  async function handleSend(text: string) {
    if (!activeThread || !userId) return;
    const message = await sendMessage(activeThread.thread_id, userId, text);
    setMessages((current) => [...current, message]);
  }

  if (loading) {
    return (
      <div className="grid min-h-[70vh] gap-0 overflow-hidden rounded-card border bg-white md:grid-cols-[320px_minmax(0,1fr)]">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (error) return <Alert message={error} />;

  return (
    <div className="grid min-h-[70vh] gap-0 overflow-hidden rounded-card border bg-white md:grid-cols-[320px_minmax(0,1fr)]">
      <section className="border-r">
        <div className="flex items-center justify-between border-b p-4">
          <h1 className="text-xl font-semibold">Messaging</h1>
          <Pencil className="h-5 w-5 text-text-secondary" />
        </div>
        <div className="border-b p-4">
          <Input className="border-0 bg-[#eef3f8]" placeholder="Search messages" />
        </div>
        <div className="max-h-[calc(70vh-110px)] overflow-y-auto p-2">
          <ThreadList threads={threads} activeThreadId={activeThread?.thread_id ?? null} onSelect={setActiveThread} />
        </div>
      </section>
      <section className="flex min-h-[70vh] flex-col">
        <div className="border-b p-4">
          <p className="font-semibold">{activeThread ? `Thread ${activeThread.thread_id.slice(0, 8)}` : "Select a conversation"}</p>
          <p className="text-sm text-text-secondary">{websocket.reason}</p>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((message) => (
            <MessageBubble key={message.message_id} message={message} own={message.sender_id === String(userId)} />
          ))}
        </div>
        <MessageInput onSend={(text) => void handleSend(text)} />
      </section>
    </div>
  );
}
