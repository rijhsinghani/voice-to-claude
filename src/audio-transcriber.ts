import dotenv from "dotenv";
dotenv.config({ override: true });
import pino from "pino";
import { GoogleGenerativeAI } from "@google/generative-ai";

const logger = pino({ name: "audio-transcriber" });

// Max file size Gemini accepts for inline audio (25 MB)
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Map file extensions to MIME types for Gemini */
const EXTENSION_MIME: Record<string, string> = {
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  webm: "audio/webm",
  aac: "audio/aac",
  flac: "audio/flac",
};

/** Audio file extensions we handle */
export const AUDIO_EXTENSIONS = new Set(Object.keys(EXTENSION_MIME));

/** A Slack file attachment (subset of fields we use) */
export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url_private: string;
  filetype?: string;
  size?: number;
}

/**
 * Detect whether a Slack file is an audio file we can transcribe.
 */
export function isAudioFile(file: SlackFile): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTENSIONS.has(ext) || file.mimetype.startsWith("audio/");
}

/**
 * Detect MIME type from filename extension, falling back to the file's own mimetype.
 */
function detectMimeType(file: SlackFile): string {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME[ext] ?? file.mimetype ?? "audio/webm";
}

/**
 * Download a Slack private file using the bot token.
 * Slack requires Authorization: Bearer <token> for private URLs.
 */
async function downloadSlackFile(
  url: string,
  botToken: string,
): Promise<{ buffer: Buffer; sizeBytes: number }> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${botToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download Slack file: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, sizeBytes: buffer.byteLength };
}

/**
 * Transcribe an audio file from Slack using Gemini Flash.
 *
 * Requires GEMINI_API_KEY environment variable.
 *
 * @param file      Slack file metadata (name, mimetype, url_private)
 * @param botToken  SLACK_BOT_TOKEN for authenticated download
 * @returns Transcribed text, or throws on unrecoverable error
 */
export async function transcribeAudio(
  file: SlackFile,
  botToken: string,
): Promise<string> {
  const startMs = Date.now();
  const mimeType = detectMimeType(file);

  logger.info(
    { fileId: file.id, fileName: file.name, mimeType },
    "Starting audio transcription",
  );

  // Size guard — check reported size before downloading if available
  if (file.size !== undefined && file.size > MAX_AUDIO_BYTES) {
    throw new Error(
      `Audio file too large: ${Math.round(file.size / 1024 / 1024)}MB (max 25MB)`,
    );
  }

  // Download from Slack
  const { buffer, sizeBytes } = await downloadSlackFile(
    file.url_private,
    botToken,
  );

  // Double-check actual size after download
  if (sizeBytes > MAX_AUDIO_BYTES) {
    throw new Error(
      `Audio file too large after download: ${Math.round(sizeBytes / 1024 / 1024)}MB (max 25MB)`,
    );
  }

  logger.info(
    { fileId: file.id, sizeBytes, downloadMs: Date.now() - startMs },
    "Audio downloaded, sending to Gemini",
  );

  // Send to Gemini Flash for transcription
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

  const audioBase64 = buffer.toString("base64");

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: audioBase64,
      },
    },
    "Transcribe this audio exactly as spoken. Return only the transcription, no commentary.",
  ]);

  const transcription = result.response.text().trim();
  const totalMs = Date.now() - startMs;

  logger.info(
    {
      fileId: file.id,
      transcriptionLength: transcription.length,
      totalMs,
      previewChars: transcription.slice(0, 80),
    },
    "Audio transcription complete",
  );

  return transcription;
}
