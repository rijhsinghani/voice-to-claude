import type { HookPayload } from "./types.js";
import { CLAUDE_CHANNEL } from "./types.js";

/**
 * Build a Block Kit chat.postMessage argument object for a permission request.
 * Only stores hookId (short string) in button value, not full payload.
 * Block Kit button value is limited to 2000 characters.
 */
export function buildPermissionBlock(payload: HookPayload, hookId: string) {
  const toolLine = payload.tool_name ? `Tool: \`${payload.tool_name}\`` : "";
  const commandLine =
    payload.tool_input && typeof payload.tool_input["command"] === "string"
      ? `Command: \`${payload.tool_input["command"]}\``
      : "";

  const bodyLines = [
    "*Permission Request*",
    toolLine,
    commandLine,
    `Session: \`${payload.session_id}\``,
    `Directory: \`${payload.cwd}\``,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    channel: CLAUDE_CHANNEL,
    text: `Permission Request: ${payload.tool_name ?? "unknown tool"}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: bodyLines,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Allow", emoji: false },
            style: "primary",
            action_id: "perm_allow",
            value: hookId,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Deny", emoji: false },
            style: "danger",
            action_id: "perm_deny",
            value: hookId,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Always Allow", emoji: false },
            action_id: "perm_always",
            value: hookId,
          },
        ],
      },
    ],
  };
}

/**
 * Build a Block Kit chat.postMessage argument object for a plan approval request.
 * Displays plan content (from tool_input or message) with Approve/Cancel buttons.
 * Truncates to 2500 chars to stay within Block Kit section limits.
 */
export function buildPlanApprovalBlock(payload: HookPayload, hookId: string) {
  // Extract plan content from tool_input if available
  const planText = payload.tool_input
    ? JSON.stringify(payload.tool_input, null, 2)
    : (payload.message ?? "Plan ready for approval");

  // Truncate for Slack Block Kit (max ~3000 chars in a section)
  const truncated =
    planText.length > 2500
      ? planText.slice(0, 2500) + "\n... (truncated)"
      : planText;

  return {
    channel: CLAUDE_CHANNEL,
    text: "Plan ready for approval",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Plan Review", emoji: false },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "```" + truncated + "```",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Session: \`${payload.session_id}\` | Directory: \`${payload.cwd}\``,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Approve Plan", emoji: false },
            style: "primary",
            action_id: "plan_approve",
            value: hookId,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Modify", emoji: false },
            action_id: "plan_modify",
            value: hookId,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Cancel", emoji: false },
            style: "danger",
            action_id: "plan_cancel",
            value: hookId,
          },
        ],
      },
    ],
  };
}

/**
 * Build updated blocks where the actions block is replaced with a resolution context block.
 */
export function buildPermissionResolved(
  originalBlocks: any[],
  decision: string,
): any[] {
  const resolvedAt = new Date().toLocaleTimeString();
  const contextBlock = {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Resolved: ${decision} at ${resolvedAt}`,
      },
    ],
  };

  // Replace the last actions block with the context block
  const blocks = [...originalBlocks];
  const actionsIdx = blocks.findLastIndex((b: any) => b.type === "actions");
  if (actionsIdx >= 0) {
    blocks[actionsIdx] = contextBlock;
  } else {
    blocks.push(contextBlock);
  }
  return blocks;
}
