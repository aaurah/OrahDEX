// Cloudflare Workers entry: runs the full Express app inside a Worker
// using the nodejs_compat httpServerHandler bridge.
import http from "node:http";
import { httpServerHandler } from "cloudflare:node";
import app from "../src/app";

const server = http.createServer(app);
export default httpServerHandler(server);
