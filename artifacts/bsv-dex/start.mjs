// Production entry point — referenced by artifact.toml run = ["node", "start.mjs"].
// Delegates entirely to server.mjs which owns static file serving and graceful shutdown.
import "./server.mjs";
