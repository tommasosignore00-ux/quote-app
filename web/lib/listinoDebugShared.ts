import fs from 'fs/promises';
import path from 'path';

const DEBUG_SERVER_FALLBACK_URL = 'http://127.0.0.1:7777/event';

export function getActiveDebugSessionId() {
  return (
    String(process.env.PDF_RULE_DEBUG_SESSION_ID || '').trim() ||
    String(process.env.DEBUG_SESSION_ID || '').trim() ||
    'listino-upload'
  );
}

export function getActiveDebugRunId(prefix = 'run') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function reportDebugEvent(event: {
  runId: string;
  hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E';
  location: string;
  msg: string;
  data?: Record<string, unknown>;
}) {
  if (process.env.NODE_ENV === 'production') return;
  const debugSessionId = getActiveDebugSessionId();
  let debugServerUrl = DEBUG_SERVER_FALLBACK_URL;

  try {
    const candidates = [
      path.resolve(process.cwd(), '.dbg', `${debugSessionId}.env`),
      path.resolve(process.cwd(), '..', '.dbg', `${debugSessionId}.env`),
    ];

    for (const candidate of candidates) {
      try {
        const envContents = await fs.readFile(candidate, 'utf-8');
        const matchedUrl = envContents.match(/^DEBUG_SERVER_URL=(.+)$/m)?.[1]?.trim();
        if (matchedUrl) {
          debugServerUrl = matchedUrl;
          break;
        }
      } catch {}
    }
  } catch {}

  try {
    await fetch(debugServerUrl, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: debugSessionId,
        runId: event.runId,
        hypothesisId: event.hypothesisId,
        location: event.location,
        msg: event.msg,
        data: event.data || {},
        ts: Date.now(),
      }),
    });
  } catch {}
}
