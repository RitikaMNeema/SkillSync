export interface Connection {
  id: number;
  connected_at: string;
  connected_user_id: number;
  connected_email: string;
}

export interface PendingConnection {
  id: number;
  requester_id: number;
  receiver_id: number;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  updated_at: string;
  requester_email: string;
  receiver_email?: string;
  direction?: "incoming" | "outgoing";
  counterpart_email?: string;
}

export interface MutualConnection {
  mutual_id: number;
  email: string;
}
