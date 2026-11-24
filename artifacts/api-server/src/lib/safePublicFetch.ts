import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
for (const range of [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
  "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
  "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24",
  "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
]) {
  const [address, prefix] = range.split("/");
  blocked.addSubnet(address!, Number(prefix), "ipv4");
}
for (const range of ["::/128", "::1/128", "fc00::/7", "fe80::/10", "ff00::/8", "2001:db8::/32"]) {
  const [address, prefix] = range.split("/");
  blocked.addSubnet(address!, Number(prefix), "ipv6");
}

function isPublicAddress(address: string, family: number): boolean {
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) {
    const normalized = address.toLowerCase();
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isIP(mapped[1]!) === 4 && !blocked.check(mapped[1]!, "ipv4");
    if (normalized.startsWith("::ffff:")) return false;
    return !blocked.check(address, "ipv6");
  }
  return false;
}

/**
 * Fetch a small JSON response from a public HTTPS endpoint. DNS is resolved
 * once, every returned IP must be public, and the connection is pinned to the
 * validated address so DNS rebinding cannot redirect the request to a LAN.
 * Redirects are rejected rather than followed without validation.
 */
export async function fetchPublicJson<T = unknown>(
  input: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<T> {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Only public HTTPS URLs on port 443 are allowed.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Private or local hosts are not allowed.");
  }
  const directFamily = isIP(hostname);
  const addresses = directFamily
    ? [{ address: hostname, family: directFamily }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address, a.family))) {
    throw new Error("The host does not resolve exclusively to public IP addresses.");
  }
  const selected = addresses[0]!;
  const maxBytes = options.maxBytes ?? 64 * 1024;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const req = httpsRequest(url, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "OrahDEX/1.0" },
      lookup: ((_hostname: string, _opts: unknown, callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
        callback(null, selected.address, selected.family);
      }) as any,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        res.resume();
        fail(new Error("Redirects are not followed for public-data lookups."));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        fail(new Error(`Remote server returned HTTP ${res.statusCode ?? "unknown"}.`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy(new Error("Remote response exceeded the allowed size."));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          const data = JSON.parse(body) as T;
          if (!settled) {
            settled = true;
            resolve(data);
          }
        } catch {
          fail(new Error("Remote server returned invalid JSON."));
        }
      });
    });
    req.setTimeout(options.timeoutMs ?? 4_000, () => req.destroy(new Error("Remote request timed out.")));
    req.on("error", fail);
    req.end();
  });
}
