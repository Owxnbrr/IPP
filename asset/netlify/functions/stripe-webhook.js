// netlify/functions/stripe-webhook.js
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

// Supabase (service role) — côté serveur uniquement
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const sig = event.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET')
    return { statusCode: 500, body: 'Server misconfigured' }
  }

  let stripeEvent
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return { statusCode: 400, body: `Webhook Error: ${err.message}` }
  }

  try {
    if (stripeEvent.type === 'checkout.session.completed') {
      const sessionId = stripeEvent.data.object.id

      // Récupère la session complète (avec line_items)
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['line_items']
      })

      // Panier tel qu'envoyé depuis le front : [{ id, size, quantity }]
      let cart = []
      try { cart = JSON.parse(session.metadata?.cart || '[]') } catch (_) {}

      const userId = session.metadata?.userId || null
      const totalCents = session.amount_total ?? 0

      // 1) Créer la commande
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          status: 'paid',
          total_cents: totalCents,
          stripe_session_id: session.id
        })
        .select()
        .single()
      if (orderErr) throw orderErr

      // 2) Insérer chaque ligne avec la taille
      // On essaye d'associer un prix unitaire depuis Stripe line_items
      const lineItems = session.line_items?.data || []
      const getUnitPrice = (row, idx) => {
        // simple: si autant de lignes que d'items, on aligne par index
        if (lineItems[idx]?.price?.unit_amount != null) return lineItems[idx].price.unit_amount
        // fallback: premier line item
        return lineItems[0]?.price?.unit_amount ?? 0
      }

      const rows = cart.map((row, idx) => ({
        order_id: order.id,
        product_id: row.id,
        quantity: row.quantity,
        unit_price_cents: getUnitPrice(row, idx),
        size: (row.size || null)
      }))

      const { error: itemsErr } = await supabase.from('order_items').insert(rows)
      if (itemsErr) throw itemsErr
    }

    return { statusCode: 200, body: 'ok' }
  } catch (err) {
    console.error('Webhook processing error:', err)
    return { statusCode: 500, body: 'Internal Error' }
  }
}
