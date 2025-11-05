// Logique boutique + panier + checkout Stripe
// ⚠️ Configurez vos env vars sur Netlify (voir README)

import { getSupabase } from './supabase-init.js'

const PRODUCTS = [
  { id: 'p1', name: 'Produit 1', price: 1999, image: 'https://images.unsplash.com/photo-1512295767273-ac109ac3acfa?q=80&w=800&auto=format&fit=crop' },
  { id: 'p2', name: 'Produit 2', price: 2999, image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=800&auto=format&fit=crop' },
  { id: 'p3', name: 'Produit 3', price: 3999, image: 'https://images.unsplash.com/photo-1515169067865-5387ec356754?q=80&w=800&auto=format&fit=crop' },
  { id: 'p4', name: 'Produit 4', price: 4999, image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop' },
]

const fmt = (cents) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

const productsEl = document.getElementById('products')
const cartList = document.getElementById('cartList')
const cartTotal = document.getElementById('cartTotal')
const checkoutBtn = document.getElementById('checkoutBtn')
const authGuard = document.getElementById('authGuard')
const authLink = document.getElementById('authLink')
const logoutBtn = document.getElementById('logoutBtn')

let cart = []
let currentUser = null

function renderProducts() {
  productsEl.innerHTML = PRODUCTS.map(p => `
    <div class=\"shop-card\">
      <img src=\"${p.image}\" alt=\"${p.name}\" />
      <div class=\"shop-row\"><strong>${p.name}</strong><span class=\"shop-price\">${fmt(p.price)}</span></div>
      <div class=\"shop-row\">
        <input class=\"shop-qty\" type=\"number\" min=\"1\" value=\"1\" id=\"qty-${p.id}\" />
        <button class=\"shop-btn\" data-add=\"${p.id}\">Ajouter</button>
      </div>
    </div>
  `).join('')

  productsEl.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-add')
      const qty = Math.max(1, parseInt(document.getElementById(`qty-${id}`).value || '1', 10))
      addToCart(id, qty)
    })
  })
}

function addToCart(id, qty) {
  const item = cart.find(i => i.id === id)
  if (item) item.quantity += qty
  else cart.push({ id, quantity: qty })
  renderCart()
}

function removeFromCart(id) { cart = cart.filter(i => i.id !== id); renderCart() }

function renderCart() {
  const total = cart.reduce((sum, i) => {
    const p = PRODUCTS.find(p => p.id === i.id)
    return sum + (p.price * i.quantity)
  }, 0)
  cartTotal.textContent = fmt(total)

  cartList.innerHTML = cart.map(i => {
    const p = PRODUCTS.find(p => p.id === i.id)
    return `<li><span>${p.name} × ${i.quantity}</span><button class=\"shop-btn secondary\" data-remove=\"${i.id}\">Retirer</button></li>`
  }).join('')

  cartList.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.getAttribute('data-remove')))
  })
}

async function syncAuthUI() {
  const supabase = await getSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  currentUser = session?.user || null
  authGuard.style.display = currentUser ? 'none' : 'block'
  authLink.style.display = currentUser ? 'none' : 'inline-flex'
  logoutBtn.style.display = currentUser ? 'inline-flex' : 'none'
}

logoutBtn?.addEventListener('click', async () => {
  const supabase = await getSupabase()
  await supabase.auth.signOut()
  await syncAuthUI()
})

checkoutBtn.addEventListener('click', async () => {
  if (!currentUser) return alert('Veuillez vous connecter avant de payer.')
  if (cart.length === 0) return alert('Votre panier est vide.')

  try {
    const supabase = await getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const email = session?.user?.email

    const res = await fetch('/.netlify/functions/createCheckout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart, customerEmail: email, userId: session?.user?.id }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Impossible de créer la session')
    window.location.href = json.url
  } catch (e) {
    alert(e.message)
  }
})

renderProducts(); renderCart(); syncAuthUI()