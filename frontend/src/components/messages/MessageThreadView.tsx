import { format, isSameDay, parseISO } from "date-fns";
import { Check } from "lucide-react";
import { useMemo } from "react";
import type { Message } from "../../types/message";
import { Avatar } from "../ui/Avatar";

function parseMessageDate(ts: string) {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(ts) ? ts : `${ts}Z`;
  return parseISO(normalized);
}

/** Clock time consistent with day grouping; omits invalid/unparseable timestamps. */
function formatMessageClock(ts: string): string | null {
  try {
    const d = parseMessageDate(ts);
    if (Number.isNaN(d.getTime())) return null;
    return format(d, "p");
  } catch {
    return null;
  }
}

function daySeparatorLabel(d: Date) {
  const today = new Date();
  if (isSameDay(d, today)) return "TODAY";
  return format(d, "EEE, MMM d").toUpperCase();
}

type DayBreak = { kind: "day"; key: string; label: string };
type MessageGroup = { kind: "group"; key: string; senderId: string; own: boolean; messages: Message[] };
type ThreadRow = DayBreak | MessageGroup;

function buildThreadRows(messages: Message[], uid: string): ThreadRow[] {
  const rows: ThreadRow[] = [];
  let lastDayKey: string | null = null;
  let pending: Message[] | null = null;

  function flushGroup() {
    if (!pending?.length) return;
    const first = pending[0];
    rows.push({
      kind: "group",
      key: `g-${first.message_id}`,
      senderId: first.sender_id,
      own: first.sender_id === uid,
      messages: pending
    });
    pending = null;
  }

  for (const message of messages) {
    const d = parseMessageDate(message.timestamp);
    const dayKey = format(d, "yyyy-MM-dd");
    if (dayKey !== lastDayKey) {
      flushGroup();
      lastDayKey = dayKey;
      rows.push({ kind: "day", key: `d-${dayKey}`, label: daySeparatorLabel(d) });
    }
    if (pending && pending[0].sender_id === message.sender_id) {
      pending.push(message);
    } else {
      flushGroup();
      pending = [message];
    }
  }
  flushGroup();
  return rows;
}

export function MessageThreadView({
  messages,
  userId,
  nameByUserId,
  profileByUserId,
  activeParticipantId
}: {
  messages: Message[];
  userId: number;
  nameByUserId: Record<string, string>;
  profileByUserId: Record<string, { photoUrl?: string | null }>;
  activeParticipantId: string | null;
}) {
  const uid = String(userId);
  const rows = useMemo(() => buildThreadRows(messages, uid), [messages, uid]);

  const lastOwnMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].sender_id === uid) return messages[i];
    }
    return null;
  }, [messages, uid]);

  const seenByOther =
    Boolean(lastOwnMessage && activeParticipantId && lastOwnMessage.read_by.includes(activeParticipantId));
  const seenClock = lastOwnMessage ? formatMessageClock(lastOwnMessage.timestamp) : null;

  if (!messages.length) {
    return (
      <div className="flex min-h-[200px] items-center justify-center px-4 py-10 text-sm text-[#666a73]">
        No messages yet. Send the first message to get started.
      </div>
    );
  }

  return (
    <div className="space-y-1 px-1 pb-2 pt-1">
      {rows.map((row) => {
        if (row.kind === "day") {
          return (
            <div key={row.key} className="flex items-center gap-3 py-4">
              <div className="h-px flex-1 bg-[#e8e8e8]" />
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#666a73]">{row.label}</span>
              <div className="h-px flex-1 bg-[#e8e8e8]" />
            </div>
          );
        }

        const { messages: group, senderId, own } = row;
        const first = group[0];
        const displayName = nameByUserId[senderId] || `User ${senderId}`;
        const avatarName = displayName.split(" ")[0] || senderId;
        const photoUrl = profileByUserId[senderId]?.photoUrl ?? null;
        const groupTime = formatMessageClock(first.timestamp);

        if (own) {
          return (
            <div key={row.key} className="flex justify-end pt-1">
              <div className="max-w-[min(100%,520px)]">
                {groupTime ? <p className="mb-1 text-right text-[11px] text-[#666a73]">{groupTime}</p> : null}
                <div className="space-y-1">
                  {group.map((m) => (
                    <div
                      key={m.message_id}
                      className="rounded-2xl rounded-br-md bg-[#d9ebfd] px-3.5 py-2 text-sm leading-relaxed text-[#1f1f1f] shadow-sm"
                    >
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={row.key} className="flex gap-2 pt-1">
            <div className="w-10 shrink-0 pt-0.5">
              <Avatar alt={displayName} name={avatarName} src={photoUrl} size="sm" />
            </div>
            <div className="min-w-0 max-w-[min(100%,560px)] flex-1">
              <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0">
                <span className="text-sm font-semibold text-[#1f1f1f]">{displayName}</span>
                {groupTime ? <span className="text-xs text-[#666a73]">{groupTime}</span> : null}
              </div>
              <div className="space-y-1">
                {group.map((m) => (
                  <div
                    key={m.message_id}
                    className="rounded-2xl rounded-bl-md bg-[#f2f2f2] px-3.5 py-2 text-sm leading-relaxed text-[#1f1f1f]"
                  >
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {seenByOther && lastOwnMessage ? (
        <p className="flex items-center justify-end gap-1 pr-1 pt-2 text-xs text-[#666a73]">
          <Check className="h-3.5 w-3.5 shrink-0 text-[#0a66c2]" strokeWidth={2.5} aria-hidden />
          <span>
            {seenClock ? (
              <>
                Seen <span className="tabular-nums">{seenClock}</span>
              </>
            ) : (
              "Seen"
            )}
          </span>
        </p>
      ) : null}
    </div>
  );
}
