import express from "express";
import pino from "pino";
import { WebClient } from "@slack/web-api";
import { HookPayloadSchema } from "./types.js";
import { waitForDecision, getPendingCount } from "./pending-store.js";
import { buildPermissionBlock, buildPlanApprovalBlock } from "./slack-ui.js";

const logger = pino({ name: "hook-relay" });

/**
 * Create the Express router that handles Claude Code HTTP hooks.
 *
 * Non-2xx responses cause Claude to auto-allow the action.
 * All error paths return 200 with a deny decision to be safe.
 *
 * Handles: PermissionRequest, Notification, and plan-approval (ExitPlanMode) events.
 */
export function createHookRelay(slackClient: WebClient): express.Router {
  const router = express.Router();

  // POST /hooks/permission — auto-allow all permissions
  // All bridge-spawned sessions get instant approval. No Slack buttons needed.
  // Safety is enforced via system prompt constraints.
  router.post("/hooks/permission", async (req, res) => {
    try {
      const parsed = HookPayloadSchema.safeParse(req.body);
      const tool = parsed.success ? parsed.data.tool_name : "unknown";
      logger.info({ tool }, "Permission auto-allowed");
    } catch {
      // log best-effort
    }
    res.json({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" },
      },
    });
  });

  // POST /hooks/notification — fire-and-forget informational events
  // Only log to server — do NOT post every notification to Slack (causes spam)
  router.post("/hooks/notification", async (req, res) => {
    try {
      const parsed = HookPayloadSchema.safeParse(req.body);
      const eventName = parsed.success
        ? parsed.data.hook_event_name
        : "unknown";
      logger.info(
        { eventName },
        "Notification hook received (not posted to Slack)",
      );
    } catch (err) {
      logger.warn({ err }, "Error handling notification hook");
    }

    // Always return 200 immediately — informational hooks must not block Claude
    res.status(200).json({ ok: true });
  });

  // POST /hooks/plan-approval — blocking plan approval relay
  // Receives ExitPlanMode PreToolUse hook, posts plan to Slack, waits for Approve/Cancel.
  // PreToolUse hooks return { decision: "allow" | "deny" } (not the PermissionRequest format).
  //
  // Non-2xx responses cause Claude to auto-allow. All error paths return 200 + deny.
  router.post("/hooks/plan-approval", async (req, res) => {
    try {
      const parsed = HookPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        logger.warn(
          { errors: parsed.error.issues },
          "Invalid plan-approval hook payload",
        );
        // Return deny so Claude does not proceed with the plan on bad payload
        res.json({ decision: "deny" });
        return;
      }

      const payload = parsed.data;
      const hookId = `plan:${payload.session_id}:${Date.now()}`;

      logger.info(
        { hookId, tool: payload.tool_name, cwd: payload.cwd },
        "Plan approval request received",
      );

      // Post Block Kit message with Approve/Cancel buttons
      const result = await slackClient.chat.postMessage(
        buildPlanApprovalBlock(payload, hookId),
      );

      // Wait for button tap — 300s timeout (plans need longer than permissions)
      const decision = await waitForDecision(
        hookId,
        result.ts!,
        result.channel!,
        300_000,
      );

      logger.info(
        { hookId, behavior: decision.behavior },
        "Plan approval resolved",
      );

      // PreToolUse hooks expect: { decision: "allow" | "deny" }
      res.json({ decision: decision.behavior });
    } catch (err) {
      // On any error, return 200 with deny — never 4xx/5xx
      logger.error({ err }, "Error handling plan-approval hook — auto-denying");
      res.json({ decision: "deny" });
    }
  });

  // GET /health — liveness check with pending count
  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      pending: getPendingCount(),
      uptime: process.uptime(),
    });
  });

  return router;
}
