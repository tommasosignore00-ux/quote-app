'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { euro, rememberJob, type Lavoro } from '@/lib/mobileWeb';

/** One job in a list, like the app: title, client and date, total, chevron. */
export default function JobRow({
  job,
  clientName,
}: {
  job: Lavoro & { total: number };
  clientName: string;
}) {
  const date = job.updated_at
    ? new Date(job.updated_at).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      })
    : '';
  return (
    <Link
      href={`/m/lavoro/${job.id}`}
      onClick={() => rememberJob(job.id)}
      className="flex min-h-[80px] items-center gap-3 px-4 py-3 active:bg-mv-soft"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[22px] font-bold leading-7">
          {job.title}
        </span>
        <span className="block truncate text-base font-semibold text-mv-muted">
          {[clientName, date].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="whitespace-nowrap text-xl font-bold tabular-nums">
        {euro(job.total)}
      </span>
      <ChevronRight className="h-6 w-6 shrink-0 text-mv-muted" />
    </Link>
  );
}
