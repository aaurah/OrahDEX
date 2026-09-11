#!/usr/bin/env node
// Kill any process holding a TCP listener on the given port.
// Pure Linux /proc walk — no external tools (no fuser, lsof, ss) required.
// Usage: node scripts/kill-port.mjs <port>

import { readdirSync, readFileSync, readlinkSync } from "node:fs";

const port = Number(process.argv[2] ?? process.env.PORT ?? 0);
if (!port || Number.isNaN(port)) {
  console.error("kill-port: missing or invalid <port>");
  process.exit(0); // non-fatal
}

const portHex = port.toString(16).toUpperCase().padStart(4, "0");

function listenerInodes() {
  const inodes = new Set();
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let txt;
    try { txt = readFileSync(file, "utf8"); } catch { continue; }
    for (const line of txt.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 10) continue;
      const local = cols[1];
      const state = cols[3];
      const inode = cols[9];
      if (state !== "0A") continue;          // 0A = LISTEN
      const colon = local.lastIndexOf(":");
      if (colon < 0) continue;
      if (local.slice(colon + 1) === portHex) inodes.add(inode);
    }
  }
  return inodes;
}

const wanted = listenerInodes();
if (wanted.size === 0) process.exit(0);

const myPid = String(process.pid);
const pids = new Set();
for (const pid of readdirSync("/proc")) {
  if (!/^\d+$/.test(pid) || pid === myPid) continue;
  let fds;
  try { fds = readdirSync(`/proc/${pid}/fd`); } catch { continue; }
  for (const fd of fds) {
    let target;
    try { target = readlinkSync(`/proc/${pid}/fd/${fd}`); } catch { continue; }
    const m = target.match(/^socket:\[(\d+)\]$/);
    if (m && wanted.has(m[1])) { pids.add(Number(pid)); break; }
  }
}

for (const pid of pids) {
  try { process.kill(pid, "SIGKILL"); console.error(`kill-port: killed PID ${pid} on :${port}`); }
  catch (e) { console.error(`kill-port: could not kill ${pid}: ${e.message}`); }
}
