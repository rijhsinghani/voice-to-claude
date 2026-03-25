/**
 * Tests for intent-detector.ts
 *
 * Covers new intents: idea_capture, recording_start
 * Plus regression coverage for all existing intents.
 */

import { describe, it, expect } from "vitest";
import { detectIntent } from "./intent-detector.js";

describe("idea_capture intent", () => {
  it('detects "idea about" phrase', () => {
    const result = detectIntent("I have an idea about n8n automation");
    expect(result.type).toBe("idea_capture");
    expect(result.ideaCaptureText).toBe("I have an idea about n8n automation");
  });

  it('detects "content idea" phrase', () => {
    const result = detectIntent("content idea: how to automate onboarding");
    expect(result.type).toBe("idea_capture");
    expect(result.ideaCaptureText).toBe(
      "content idea: how to automate onboarding",
    );
  });

  it('detects "I want to make a video about" phrase', () => {
    const result = detectIntent("I want to make a video about Slack bots");
    expect(result.type).toBe("idea_capture");
    expect(result.ideaCaptureText).toBe(
      "I want to make a video about Slack bots",
    );
  });

  it('detects "have an idea" phrase', () => {
    const result = detectIntent("I have an idea for a tutorial");
    expect(result.type).toBe("idea_capture");
    expect(result.ideaCaptureText).toBe("I have an idea for a tutorial");
  });

  it("is case-insensitive", () => {
    const result = detectIntent("IDEA ABOUT automation workflows");
    expect(result.type).toBe("idea_capture");
  });
});

describe("recording_start intent", () => {
  it('detects "about to record" phrase', () => {
    const result = detectIntent("about to record the n8n tutorial");
    expect(result.type).toBe("recording_start");
    expect(result.recordingTopic).toBe("the n8n tutorial");
  });

  it('detects "recording [topic]" phrase', () => {
    const result = detectIntent("recording client onboarding automation");
    expect(result.type).toBe("recording_start");
    expect(result.recordingTopic).toBe("client onboarding automation");
  });

  it("is case-insensitive", () => {
    const result = detectIntent("ABOUT TO RECORD the tutorial");
    expect(result.type).toBe("recording_start");
    expect(result.recordingTopic).toBe("the tutorial");
  });
});

describe("precedence: publish_content is NOT shadowed by idea_capture", () => {
  it("publish a post about n8n routes to publish_content", () => {
    const result = detectIntent("publish a post about n8n");
    expect(result.type).toBe("publish_content");
  });
});

describe("existing intents (regression)", () => {
  it("delivery_query still works", () => {
    const result = detectIntent("where are Patel's photos?");
    expect(result.type).toBe("delivery_query");
  });

  it("ship still works", () => {
    const result = detectIntent("ship the PR");
    expect(result.type).toBe("ship");
  });

  it("retry still works", () => {
    const result = detectIntent("try again");
    expect(result.type).toBe("retry");
  });

  it("today_briefing still works", () => {
    const result = detectIntent("/today");
    expect(result.type).toBe("today_briefing");
  });

  it("vault_add still works", () => {
    const result = detectIntent("vault add decision use TypeScript everywhere");
    expect(result.type).toBe("vault_add");
  });

  it("pipeline_status still works", () => {
    const result = detectIntent("pipeline status");
    expect(result.type).toBe("pipeline_status");
  });

  it("publish_content still works", () => {
    const result = detectIntent("publish about automation");
    expect(result.type).toBe("publish_content");
  });

  it("session_context still works", () => {
    const result = detectIntent("what are you working on");
    expect(result.type).toBe("session_context");
  });

  it("passthrough still works for unmatched text", () => {
    const result = detectIntent("hello world");
    expect(result.type).toBe("passthrough");
  });
});
