/**
 * Punto 43: Webhook dispatch system for web API
 * Sends events to registered webhook endpoints
 */

import 'server-only';
import { supabaseAdmin } from './supabase-server';
import crypto from 'crypto';

interface WebhookPayload {
  event: string;
  data: Record<string, any>;
  timestamp: string;
}

export async function dispatchWebhook(profileId: string, event: string, data: Record<string, any>) {
  const { data: endpoints } = await supabaseAdmin
    .from('webhook_endpoints')
    .select('*')
    .eq('profile_id', profileId)
    .eq('active', true)
    .contains('events', [event]);

  if (!endpoints || endpoints.length === 0) return;

  const payload: WebhookPayload = {
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  const results = await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      const signature = crypto
        .createHmac('sha256', endpoint.secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      await supabaseAdmin.from('webhook_deliveries').insert({
        webhook_id: endpoint.id,
        event_type: event,
        payload,
        response_status: response.status,
        success: response.ok,
      });

      return { endpoint: endpoint.url, status: response.status };
    })
  );

  return results;
}

// Webhook event constants
export const WEBHOOK_EVENTS = {
  QUOTE_CREATED: 'quote.created',
  QUOTE_SENT: 'quote.sent',
  QUOTE_APPROVED: 'quote.approved',
  CLIENT_CREATED: 'client.created',
  JOB_CREATED: 'job.created',
  SUBSCRIPTION_CHANGED: 'subscription.changed',
} as const;
