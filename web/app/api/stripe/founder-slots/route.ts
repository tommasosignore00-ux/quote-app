import { NextResponse } from 'next/server';
import { FOUNDER_SLOTS, founderSlotsLeft } from '@/lib/checkout';

export const dynamic = 'force-dynamic';

/** How many founder places are left: only a number, no customer data. */
export async function GET() {
  try {
    return NextResponse.json({ total: FOUNDER_SLOTS, left: await founderSlotsLeft() });
  } catch {
    return NextResponse.json({ error: 'Non disponibile' }, { status: 503 });
  }
}
