export interface Thread {
  thread_id: string;
  participant_ids: string[];
  created_at: string;
  last_message_at: string;
}

export interface ThreadListResponse {
  threads: Thread[];
  total: number;
  page: number;
  page_size: number;
}

export interface Message {
  message_id: string;
  thread_id: string;
  sender_id: string;
  text: string;
  timestamp: string;
  read_by: string[];
  delivery_status?: {
    kafka: "sent" | "failed";
    realtime: "sent" | "failed";
  };
}

export interface MessageListResponse {
  messages: Message[];
  total: number;
  page: number;
  page_size: number;
}


export interface ThreadPreference {
  thread_id: string;
  user_id: string;
  starred?: boolean;
  muted?: boolean;
  archived?: boolean;
  force_unread?: boolean;
  hidden?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ThreadPreferencesResponse {
  preferences: Record<string, ThreadPreference>;
}
