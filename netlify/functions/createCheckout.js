import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

const PRICE_MAP = {
  p1: process.env.PRICE_P1,
  p2: process.env.PRICE_P2,
  p3: process.env.PRICE_P3,
  p4: process.env.PRICE_P4,
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

    // items = [{ id, size, quantity }]
    const line_items = items.map(({ id, quantity }) => {
      const price = PRICE_MAP[id]
      if (!price) throw new Error(`Price ID manquant pour ${id}`)
      return { price, quantity: Math.max(1, Number(quantity || 1)) }
    })

    const baseUrl = process.env.URL || 'https://example.com'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      customer_email: customerEmail || undefined,
      allow_promotion_codes: true,
      // On stocke tout le panier (avec tailles) dans la metadata (récupérable au webhook)
      metadata: {
        userId: userId || '',
        cart: JSON.stringify(items), // <= tailles incluses
      },
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
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Erreur serveur' }) }
  }
}
