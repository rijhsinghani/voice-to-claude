import pino from "pino";
import { ALLOWED_USER } from "./types.js";

const logger = pino({ name: "security" });

export function isAllowedUser(userId: string): boolean {
  return userId === ALLOWED_USER;
}

// Bolt middleware that only allows messages from the allowlisted user
export async function allowlistMiddleware(args: any): Promise<void> {
  const { payload, body, next } = args;

  // Allow bot messages to pass through
  if (payload?.bot_id) {
    await next();
    return;
  }

  // Skip system subtypes
  if (payload?.subtype) {
    await next();
    return;
  }

  // Extract user ID from multiple possible locations:
  // - Message events: payload.user (string)
  // - Action events (buttons): body.user.id (string)
  // - Other events: body.event.user (string)
  const userId =
    (typeof payload?.user === "string" ? payload.user : null) ??
    body?.user?.id ??
    body?.event?.user ??
    null;

  if (!userId || !isAllowedUser(userId)) {
    logger.warn(
      { user: userId, eventType: body?.type },
      "Blocked event from unauthorized user",
    );
    return;
  }

  await next();
}
