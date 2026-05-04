import { Buffer as BufferImpl } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  (globalThis as any).Buffer = BufferImpl;
}
if (typeof (globalThis as any).global === "undefined") {
  (globalThis as any).global = globalThis;
}
if (typeof (globalThis as any).process === "undefined") {
  (globalThis as any).process = { env: {}, version: "", platform: "browser" };
}
