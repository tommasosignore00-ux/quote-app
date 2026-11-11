import { NextResponse } from 'next/server';
import {
  getRequestUser,
  unauthorizedResponse,
  forbiddenResponse,
  isOwnProfile,
} from '../../../../lib/apiAuth';
import { checkoutSessionSchema, validateRequest } from '../../../../lib/validations';
import { createSubscriptionCheckout, type CheckoutPlan } from '../../../../lib/checkout';

/** Onboarding checkout: same rules as the subscription page, plus the company name. */
export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const validation = validateRequest(checkoutSessionSchema, await req.json());
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const {
      userId: claimedUserId,
      companyName,
      priceId: requestedPlan,
    } = validation.data;
    if (!isOwnProfile(user, claimedUserId)) return forbiddenResponse();

    // Only the plan names are accepted: never a price id from the client.
    const plan = String(requestedPlan)
      .replace(/^price_/i, '')
      .toLowerCase();
    if (!user.email || !['monthly', 'yearly', 'team'].includes(plan)) {
      return NextResponse.json({ error: 'Piano non valido' }, { status: 400 });
    }

    const result = await createSubscriptionCheckout({
      userId: user.id,
      email: user.email,
      plan: plan as CheckoutPlan,
      companyName,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status }
      );
    }
    return NextResponse.json({
      url: result.url,
      sessionId: result.sessionId,
      founder: result.founder,
    });
  } catch {
    console.error('Create checkout session error');
    return NextResponse.json({ error: 'Checkout non riuscito' }, { status: 500 });
  }
}
