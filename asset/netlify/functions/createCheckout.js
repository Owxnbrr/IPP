// netlify/functions/createCheckout.js
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

// Catalogue sécurisé côté serveur (montants en centimes, devise)
const CURRENCY = process.env.CURRENCY || 'eur'
const CATALOG = {
  // id front -> { name, amount }
  p1: { name: process.env.PRODUCT_P1_NAME || 'Polo homme manches courtes à liserés contrastés', amount: Number(process.env.PRODUCT_P1_AMOUNT || 2160) },
  p2: { name: process.env.PRODUCT_P2_NAME || 'Bodywarmer matelassé homme', amount: Number(process.env.PRODUCT_P2_AMOUNT || 3840) },
  p3: { name: process.env.PRODUCT_P3_NAME || 'Sweat-shirt zippé capuche contrastée', amount: Number(process.env.PRODUCT_P3_AMOUNT || 4224) },
  p4: { name: process.env.PRODUCT_P4_NAME || 'Sweat-shirt capuche contrastée homme', amount: Number(process.env.PRODUCT_P4_AMOUNT || 3792) },
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

    // Construit les line_items avec price_data dynamique (nom + taille)
    const line_items = items.map(({ id, size, quantity }) => {
      const ref = CATALOG[id]
      if (!ref) throw new Error(`Produit inconnu: ${id}`)
      const qty = Math.max(1, Number(quantity || 1))
      const title = `${ref.name} — Taille: ${String(size || 'M').toUpperCase()}`

      return {
        quantity: qty,
        price_data: {
          currency: CURRENCY,
          unit_amount: ref.amount, // montant sécurisé côté serveur
          product_data: {
            name: title,
          },
        },
      }
    })

    // Base URL fiable (Netlify prod) ou fallback local
    const proto = event.headers['x-forwarded-proto'] || 'https'
    const host  = event.headers.host || ''
    const baseUrl = host ? `${proto}://${host}` : 'http://localhost:8888'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      customer_email: customerEmail || undefined,
      allow_promotion_codes: true,
      // On garde la taille et le panier en metadata pour le webhook / l’admin
      metadata: {
        userId: userId || '',
        cart: JSON.stringify(items),
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
