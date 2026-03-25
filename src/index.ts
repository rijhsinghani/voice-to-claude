import dotenv from "dotenv";
dotenv.config({ override: true });
import pino from "pino";
import express from "express";
import { boltApp, registry } from "./bolt-app.js";
import { createHookRelay } from "./hook-relay.js";
import { clearAll } from "./pending-store.js";
import { HOOK_RELAY_PORT } from "./types.js";
import type { SocketModeReceiver } from "@slack/bolt";

const logger = pino({ name: "voice-to-claude" });

// Express app for hook relay
const relayApp = express();
relayApp.use(express.json());

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully");
  clearAll(); // Resolve all pending permission requests with deny before stopping

  try {
    await boltApp.stop();
  } catch (err) {
    logger.error({ err }, "Error stopping Bolt app");
  }
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Native hardening: catch unhandled errors so the process doesn't crash silently
// launchd will restart on crash, but logging the cause is critical for debugging
process.on("uncaughtException", (err) => {
  logger.fatal(
    { err },
    "Uncaught exception — process will exit, launchd will restart",
  );
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.error(
    { reason },
    "Unhandled promise rejection — continuing (non-fatal)",
  );
});

// Start Bolt Socket Mode connection
await boltApp.start();
logger.info("Voice to Claude bridge started — Socket Mode active");

// Log recovered sessions from disk (registry was loaded in bolt-app.ts at module init)
const recoveredSessions = registry.getAll();
logger.info(
  { sessions: recoveredSessions.length },
  "Recovered sessions from disk",
);

// Mount hook relay routes (requires boltApp.client to be available after start)
relayApp.use(createHookRelay(boltApp.client));

// Start Express relay server on localhost only (no unauthenticated public endpoints)
relayApp.listen(HOOK_RELAY_PORT, "127.0.0.1", () => {
  logger.info(
    { port: HOOK_RELAY_PORT },
    "Hook relay server listening on 127.0.0.1",
  );
});

// Periodic health log every 60 seconds: registry count + Socket Mode connection status
setInterval(() => {
  const registryCount = registry.getAll().length;
  logger.info(
    { registrySessions: registryCount },
    "Health: active sessions in registry",
  );

  // Check Socket Mode WebSocket connection health.
  // Bolt auto-reconnects natively; this just detects and logs when it happens.
  try {
    const receiver = (boltApp as unknown as { receiver: SocketModeReceiver })
      .receiver;
    const socketModeClient = receiver.client;
    const ws = (
      socketModeClient as unknown as { websocket?: { isActive(): boolean } }
    ).websocket;

    if (!ws) {
      logger.warn("Socket Mode health: WebSocket not yet initialized");
    } else if (!ws.isActive()) {
      logger.warn(
        "Socket Mode health: WebSocket is NOT active — Bolt will auto-reconnect",
      );
    } else {
      logger.info("Socket Mode health: WebSocket is active");
    }
  } catch (err) {
    logger.warn({ err }, "Socket Mode health: could not read connection state");
  }
}, 60_000);
