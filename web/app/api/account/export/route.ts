import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '@/lib/apiAuth';
import { rateLimit } from '@/lib/rate-limit';
import {
  ACCOUNT_TABLES,
  listAccountFiles,
  readAccountTable,
  withoutOmitted,
} from '@/lib/accountData';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Sections other tables point at: their ids are needed to read the children. */
const PARENT_KEYS = new Set(
  ACCOUNT_TABLES.flatMap((t) => (t.parent ? [t.parent.key] : []))
);

async function* exportJson(userId: string) {
  yield `{"exportedAt":${JSON.stringify(new Date().toISOString())}`;

  const knownIds = new Map<string, string[]>();
  for (const table of ACCOUNT_TABLES) {
    yield `,${JSON.stringify(table.key)}:[`;
    let first = true;
    const ids: string[] = [];
    for await (const page of readAccountTable(table, userId, knownIds)) {
      for (const row of page) {
        if (PARENT_KEYS.has(table.key)) ids.push(String(row.id));
        yield `${first ? '' : ','}${JSON.stringify(withoutOmitted(table, row))}`;
        first = false;
      }
    }
    if (PARENT_KEYS.has(table.key)) knownIds.set(table.key, ids);
    yield ']';
  }

  yield `,"storage_files":${JSON.stringify(await listAccountFiles(userId))}}`;
}

/** Streamed: a long price list would not fit in a single serverless response. */
export async function GET(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorizedResponse();

  const limit = await rateLimit(`account-export:${user.id}`, {
    maxRequests: 5,
    windowMs: 3_600_000,
  });
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Troppe esportazioni. Riprova più tardi.' },
      { status: 429 }
    );
  }

  const encoder = new TextEncoder();
  const source = exportJson(user.id);
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await source.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (err) {
        console.error(
          'Account export failed:',
          err instanceof Error ? err.name : 'unknown'
        );
        // An error mid-stream, so that a truncated file is never taken for a full one.
        controller.error(new Error('export failed'));
      }
    },
    async cancel() {
      await source.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="quoteapp-my-data.json"',
      'Cache-Control': 'no-store',
    },
  });
}
