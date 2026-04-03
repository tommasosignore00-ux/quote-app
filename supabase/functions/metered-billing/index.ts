import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || ''
const STRIPE_PRICE_OVERAGE = Deno.env.get('STRIPE_PRICE_OVERAGE') || ''
const STRIPE_PRICE_EXTRA_MEMBER = Deno.env.get('STRIPE_PRICE_EXTRA_MEMBER') || ''
const TEAM_MEMBERS_INCLUDED = 5

interface OverageRecord {
  profile_id: string
  overage_count: number
  period_start: string
  period_end: string
  stripe_subscription_id: string | null
}

serve(async (req) => {
  // Allow manual trigger via POST or automated trigger via cron (GET/POST)
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    if (!STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY not configured')
    }
    if (!STRIPE_PRICE_OVERAGE) {
      throw new Error('STRIPE_PRICE_OVERAGE not configured')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Calculate the previous billing period (last month)
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const periodStartStr = periodStart.toISOString().split('T')[0]

    // Fetch users with overage in the previous period, joined with their stripe info
    const { data: overageUsers, error: queryError } = await supabase
      .from('quote_usage')
      .select(`
        profile_id,
        overage_count,
        period_start,
        period_end
      `)
      .eq('period_start', periodStartStr)
      .gt('overage_count', 0)

    if (queryError) {
      throw new Error(`Failed to query quote_usage: ${queryError.message}`)
    }

    if (!overageUsers || overageUsers.length === 0) {
      return new Response(JSON.stringify({ message: 'No overage records found', processed: 0 }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Fetch stripe_subscription_id for each user from profiles
    const profileIds = overageUsers.map((u: OverageRecord) => u.profile_id)
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, stripe_subscription_id, stripe_customer_id')
      .in('id', profileIds)
      .not('stripe_subscription_id', 'is', null)

    if (profileError) {
      throw new Error(`Failed to query profiles: ${profileError.message}`)
    }

    const profileMap = new Map(
      (profiles || []).map((p: { id: string; stripe_subscription_id: string; stripe_customer_id: string }) => [p.id, p])
    )

    const results: Array<{ profile_id: string; status: string; overage: number; error?: string }> = []

    for (const usage of overageUsers as OverageRecord[]) {
      const profile = profileMap.get(usage.profile_id)
      if (!profile || !profile.stripe_subscription_id) {
        results.push({
          profile_id: usage.profile_id,
          status: 'skipped',
          overage: usage.overage_count,
          error: 'No active Stripe subscription',
        })
        continue
      }

      try {
        // 1. Get the subscription to find or create the metered item
        const subRes = await fetch(
          `https://api.stripe.com/v1/subscriptions/${profile.stripe_subscription_id}`,
          {
            headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
          }
        )
        const subscription = await subRes.json()

        if (subscription.error) {
          results.push({
            profile_id: usage.profile_id,
            status: 'error',
            overage: usage.overage_count,
            error: `Stripe sub fetch: ${subscription.error.message}`,
          })
          continue
        }

        // 2. Find existing metered subscription item, or add it
        let meteredItemId: string | null = null

        for (const item of subscription.items?.data || []) {
          if (item.price?.id === STRIPE_PRICE_OVERAGE) {
            meteredItemId = item.id
            break
          }
        }

        if (!meteredItemId) {
          // Add the metered price to the subscription
          const addItemRes = await fetch('https://api.stripe.com/v1/subscription_items', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              subscription: profile.stripe_subscription_id,
              price: STRIPE_PRICE_OVERAGE,
            }),
          })
          const addedItem = await addItemRes.json()

          if (addedItem.error) {
            results.push({
              profile_id: usage.profile_id,
              status: 'error',
              overage: usage.overage_count,
              error: `Add metered item: ${addedItem.error.message}`,
            })
            continue
          }
          meteredItemId = addedItem.id
        }

        // 3. Report usage to Stripe
        const usageRes = await fetch(
          `https://api.stripe.com/v1/subscription_items/${meteredItemId}/usage_records`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              quantity: String(usage.overage_count),
              action: 'set',
              timestamp: String(Math.floor(new Date(usage.period_end).getTime() / 1000)),
            }),
          }
        )
        const usageRecord = await usageRes.json()

        if (usageRecord.error) {
          results.push({
            profile_id: usage.profile_id,
            status: 'error',
            overage: usage.overage_count,
            error: `Usage report: ${usageRecord.error.message}`,
          })
          continue
        }

        results.push({
          profile_id: usage.profile_id,
          status: 'reported',
          overage: usage.overage_count,
        })
      } catch (err) {
        results.push({
          profile_id: usage.profile_id,
          status: 'error',
          overage: usage.overage_count,
          error: (err as Error).message,
        })
      }
    }

    const reported = results.filter(r => r.status === 'reported').length
    const skipped = results.filter(r => r.status === 'skipped').length
    const errors = results.filter(r => r.status === 'error').length

    // Log summary for monitoring
    console.log(`Metered billing run: ${reported} reported, ${skipped} skipped, ${errors} errors`)

    // --- Extra Team Members billing ---
    const teamMemberResults: Array<{ profile_id: string; status: string; extra_members: number; error?: string }> = []

    if (STRIPE_PRICE_EXTRA_MEMBER) {
      // Find team plan users with extra members
      const { data: teamUsers, error: teamError } = await supabase
        .from('profiles')
        .select('id, stripe_subscription_id, stripe_customer_id, extra_team_members')
        .eq('subscription_status', 'team')
        .gt('extra_team_members', 0)
        .not('stripe_subscription_id', 'is', null)

      if (!teamError && teamUsers && teamUsers.length > 0) {
        for (const teamUser of teamUsers) {
          try {
            // Verify actual active member count
            const { count } = await supabase
              .from('team_members')
              .select('*', { count: 'exact', head: true })
              .eq('team_owner_id', teamUser.id)
              .eq('active', true)

            const actualExtra = Math.max(0, (count || 0) - TEAM_MEMBERS_INCLUDED)
            if (actualExtra === 0) {
              // Update profile if no extras needed
              await supabase.from('profiles').update({ extra_team_members: 0 }).eq('id', teamUser.id)
              continue
            }

            // Get or add metered subscription item for extra members
            const subRes = await fetch(
              `https://api.stripe.com/v1/subscriptions/${teamUser.stripe_subscription_id}`,
              { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
            )
            const subscription = await subRes.json()
            if (subscription.error) {
              teamMemberResults.push({ profile_id: teamUser.id, status: 'error', extra_members: actualExtra, error: subscription.error.message })
              continue
            }

            let memberItemId: string | null = null
            for (const item of subscription.items?.data || []) {
              if (item.price?.id === STRIPE_PRICE_EXTRA_MEMBER) {
                memberItemId = item.id
                break
              }
            }

            if (!memberItemId) {
              const addRes = await fetch('https://api.stripe.com/v1/subscription_items', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  subscription: teamUser.stripe_subscription_id,
                  price: STRIPE_PRICE_EXTRA_MEMBER,
                }),
              })
              const added = await addRes.json()
              if (added.error) {
                teamMemberResults.push({ profile_id: teamUser.id, status: 'error', extra_members: actualExtra, error: added.error.message })
                continue
              }
              memberItemId = added.id
            }

            // Report extra member usage
            const usageRes = await fetch(
              `https://api.stripe.com/v1/subscription_items/${memberItemId}/usage_records`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  quantity: String(actualExtra),
                  action: 'set',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                }),
              }
            )
            const usageRecord = await usageRes.json()
            if (usageRecord.error) {
              teamMemberResults.push({ profile_id: teamUser.id, status: 'error', extra_members: actualExtra, error: usageRecord.error.message })
            } else {
              // Sync profile
              await supabase.from('profiles').update({ extra_team_members: actualExtra }).eq('id', teamUser.id)
              teamMemberResults.push({ profile_id: teamUser.id, status: 'reported', extra_members: actualExtra })
            }
          } catch (err) {
            teamMemberResults.push({ profile_id: teamUser.id, status: 'error', extra_members: teamUser.extra_team_members, error: (err as Error).message })
          }
        }
      }
      console.log(`Extra members billing: ${teamMemberResults.filter(r => r.status === 'reported').length} reported`)
    }

    return new Response(
      JSON.stringify({
        period: periodStartStr,
        total: overageUsers.length,
        reported,
        skipped,
        errors,
        details: results,
        extraMembers: teamMemberResults,
      }),
      {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }
    )
  } catch (err) {
    console.error('Metered billing error:', (err as Error).message)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
