import { NextResponse } from 'next/server';
import {
  getRequestUser,
  unauthorizedResponse,
  forbiddenResponse,
  isOwnProfile,
} from '@/lib/apiAuth';
import { createSubscriptionCheckout, type CheckoutPlan } from '@/lib/checkout';

const PLANS: CheckoutPlan[] = ['monthly', 'yearly', 'team'];

export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const { userId: claimedUserId, plan } = (await req.json().catch(() => ({}))) as {
      userId?: string;
      plan?: string;
    };
    if (!isOwnProfile(user, claimedUserId)) return forbiddenResponse();
    if (!user.email || !PLANS.includes(plan as CheckoutPlan)) {
      return NextResponse.json({ error: 'Piano non valido' }, { status: 400 });
    }

    const result = await createSubscriptionCheckout({
      userId: user.id,
      email: user.email,
      plan: plan as CheckoutPlan,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status }
      );
    }
    return NextResponse.json({ url: result.url, founder: result.founder });
  } catch {
    console.error('Stripe checkout route error');
    return NextResponse.json({ error: 'Checkout non riuscito' }, { status: 500 });
  }
}
