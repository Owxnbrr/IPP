// Netlify Function: Create Stripe Checkout Session
// Dossier: netlify/functions/createCheckout.js

import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
})

// Associe les IDs "produit" côté front aux price IDs Stripe
// ⚠️ Remplacez les valeurs par vos vrais price IDs créés dans Stripe
const PRICE_MAP = {
  p1: process.env.PRICE_P1 || 'price_xxx_p1',
  p2: process.env.PRICE_P2 || 'price_xxx_p2',
  p3: process.env.PRICE_P3 || 'price_xxx_p3',
  p4: process.env.PRICE_P4 || 'price_xxx_p4',
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' }
    }

    const { items, customerEmail, userId } = JSON.parse(event.body || '{}')

    if (!Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: 'Panier vide.' }
    }

    // Transforme les items en line_items Stripe
    const line_items = items.map(({ id, quantity }) => {
      const price = PRICE_MAP[id]
      if (!price) throw new Error(`Price ID manquant pour ${id}`)
      return {
        price,
        quantity: Math.max(1, Number(quantity || 1)),
      }
    })

    const baseUrl = process.env.URL || 'http://localhost:8888'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      customer_email: customerEmail || undefined,
      allow_promotion_codes: true,
      metadata: { userId: userId || '' },
      success_url: `${baseUrl}/success`,
      cancel_url: `${baseUrl}/cancel`,
    })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    }
  } catch (err) {
    console.error('Stripe Checkout error:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Erreur serveur' }),
    }
  }
}
