interface SrvNotif {
  id: string;
  type: string;
  title: string;
  body: string;
  timestamp: number;
  pair?: string;
  txid?: string;
  side?: string;
}

const queue = new Map<string, SrvNotif[]>();
let _id = 0;

export function pushNotification(
  address: string,
  notif: Omit<SrvNotif, "id" | "timestamp">,
): void {
  const key = address.toLowerCase();
  const entry: SrvNotif = { ...notif, id: `srv_${++_id}`, timestamp: Date.now() };
  const existing = queue.get(key) ?? [];
  queue.set(key, [entry, ...existing].slice(0, 50));
}

export function getNotifications(address: string, since = 0): SrvNotif[] {
  return (queue.get(address.toLowerCase()) ?? []).filter(n => n.timestamp > since);
}

export function clearNotifications(address: string): void {
  queue.delete(address.toLowerCase());
}
