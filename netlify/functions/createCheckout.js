// netlify/functions/createCheckout.js
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

const CURRENCY = process.env.CURRENCY || 'eur'
const SHIPPING_FEE = 1500 // 15,00 €

// Catalogue sécurisé côté serveur (centimes)
const CATALOG = {
  p1: { name: process.env.PRODUCT_P1_NAME || 'Polo homme manches courtes à liserés contrastés', amount: Number(process.env.PRODUCT_P1_AMOUNT || 2160) },
  p2: { name: process.env.PRODUCT_P2_NAME || 'Bodywarmer matelassé homme', amount: Number(process.env.PRODUCT_P2_AMOUNT || 3840) },
  p3: { name: process.env.PRODUCT_P3_NAME || 'Sweat-shirt zippé capuche contrastée', amount: Number(process.env.PRODUCT_P3_AMOUNT || 4220) },
  p4: { name: process.env.PRODUCT_P4_NAME || 'Sweat-shirt capuche contrastée homme', amount: Number(process.env.PRODUCT_P4_AMOUNT || 3790) },
}

// helper: interpréter “true”, “1”, etc.
function asBool(v) {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true'
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' }
    }

    const { items, customerEmail, userId, shipping } = JSON.parse(event.body || '{}')
    const shippingEnabled = asBool(shipping?.enabled)

    console.log('[createCheckout] payload', {
      itemsCount: Array.isArray(items) ? items.length : -1,
      customerEmail,
      userId,
      shippingEnabled
    })

    if (!Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: 'Panier vide.' }
    }

    const line_items = items.map(({ id, size, quantity }) => {
      const ref = CATALOG[id]
      if (!ref) throw new Error(`Produit inconnu: ${id}`)
      const qty = Math.max(1, Number(quantity || 1))
      const title = `${ref.name} — Taille: ${String(size || 'M').toUpperCase()}`
      return {
        quantity: qty,
        price_data: {
          currency: CURRENCY,
          unit_amount: ref.amount,
          product_data: { name: title },
        },
      }
    })

    if (shippingEnabled) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: SHIPPING_FEE,
          product_data: { name: 'Frais de livraison' },
        },
      })
    }

    const shippingParams = shippingEnabled
      ? { shipping_address_collection: { allowed_countries: ['FR','BE'] } }
      : {}

    const proto = event.headers['x-forwarded-proto'] || 'https'
    const host  = event.headers.host || ''
    const baseUrl = host ? `${proto}://${host}` : 'http://localhost:8888'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      customer_email: customerEmail || undefined,
      allow_promotion_codes: true,
      ...shippingParams,
      metadata: {
        userId: userId || '',
        cart: JSON.stringify(items),
        shipping_enabled: shippingEnabled ? '1' : '0',
      },
      success_url: `${baseUrl}/success`,
      cancel_url: `${baseUrl}/cancel`,
    })

    console.log('[createCheckout] session created', {
      id: session.id,
      amount_total: session.amount_total,
      shippingEnabled
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
