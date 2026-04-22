import { useEffect, useState } from "react";
import {
  acceptConnection,
  listConnections,
  listPendingConnections,
  rejectConnection,
} from "../../api/connections";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { Connection, PendingConnection } from "../../types/connection";

export function ConnectionsPage() {
  const userId = authStore((state) => state.userId);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [pending, setPending] = useState<PendingConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNetworkData = async () => {
    if (!userId) return;

    const [list, pendingList] = await Promise.all([
      listConnections(userId),
      listPendingConnections(userId),
    ]);

    setConnections(list);
    setPending(pendingList);
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

  if (loading) {
    return (
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <Card>
        <h2 className="text-lg font-semibold">Manage my network</h2>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span>Connections</span>
            <span>{connections.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Pending</span>
            <span>{pending.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Following & followers</span>
            <span>0</span>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <h1 className="text-2xl font-bold">My Network</h1>

        <Card>
          <h3 className="mb-4 font-semibold">Pending invitations</h3>

          {pending.length === 0 ? (
            <p className="text-sm text-text-secondary">No pending invitations</p>
          ) : (
            <div className="space-y-3">
              {pending.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between gap-3 rounded-card p-3 hover:bg-hover"
                >
                  <div>
                    <p className="font-semibold">{request.requester_email}</p>
                    <p className="text-sm text-text-secondary">
                      {request.created_at}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => void handleReject(request.id)}
                    >
                      Ignore
                    </Button>
                    <Button onClick={() => void handleAccept(request.id)}>
                      Accept
                    </Button>
                  </div>
                </div>
              ))}
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

                <Button fullWidth variant="secondary" className="mt-4">
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