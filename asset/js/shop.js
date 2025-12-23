// Boutique + panier + checkout Stripe (tailles + livraison 15€ + collecte adresse)
import { getSupabase } from './supabase-init.js'

// --- Catalogue (prix en centimes) ---
const PRODUCTS = [
  { id: 'p1',
    name: 'Polo homme manches courtes à liserés contrastés',
    price: 2160,
    image: '/img/shop/Polo homme manches courtes à liserés contrastés.png'
  },
  { id: 'p2',
    name: 'Bodywarmer matelassé homme',
    price: 3840,
    image: '/img/shop/Bodywarmer matelassé homme.png'
  },
  { id: 'p3',
    name: 'Sweat-shirt zippé capuche contrastée',
    price: 4220,
    image: '/img/shop/Sweat-shirt zippé capuche contrastée.png'
  },
  { id: 'p4',
    name: 'Sweat-shirt capuche contrastée homme',
    price: 3790,
    image: '/img/shop/Sweat-shirt capuche contrastée homme.png'
  },
]

const SIZES = ['XS','S','M','L','XL','XXL','3XL','4XL']
const fmt = (cents) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

// --- Livraison ---
const SHIPPING_FEE = 1500 // 15,00 €
let wantShipping = false

// --- DOM ---
const productsEl  = document.getElementById('products')
const cartList    = document.getElementById('cartList')
const cartTotal   = document.getElementById('cartTotal')
const checkoutBtn = document.getElementById('checkoutBtn')
const authGuard   = document.getElementById('authGuard')
const authLink    = document.getElementById('authLink')
const logoutBtn   = document.getElementById('logoutBtn')
const shippingToggle = document.getElementById('shippingToggle')

// --- Etat ---
/** Le panier contient des lignes { id, size, quantity } */
let cart = []
let currentUser = null

function renderProducts() {
  productsEl.innerHTML = PRODUCTS.map(p => {
    const sizeOptions = SIZES.map(s => `<option value="${s}">${s}</option>`).join('')
    return `
      <div class="shop-card">
        <img src="${p.image}" alt="${p.name}" />
        <div class="shop-row">
          <strong>${p.name}</strong>
          <span class="shop-price">${fmt(p.price)}</span>
        </div>

        <div class="shop-row">
          <label for="size-${p.id}" style="opacity:.9;">Taille</label>
          <select id="size-${p.id}" class="shop-qty" style="width:100%">
            ${sizeOptions}
          </select>
        </div>

        <div class="shop-row">
          <input class="shop-qty" type="number" min="1" value="1" id="qty-${p.id}" />
          <button class="shop-btn" data-add="${p.id}">Ajouter</button>
        </div>
      </div>
    `
  }).join('')

  productsEl.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-add')
      const qty = Math.max(1, parseInt(document.getElementById(`qty-${id}`).value || '1', 10))
      const sizeSel = document.getElementById(`size-${id}`)
      const size = (sizeSel?.value || 'M').toUpperCase()
      addToCart(id, size, qty)
    })
  })
}

/** Panier */
function addToCart(id, size, qty) {
  const row = cart.find(i => i.id === id && i.size === size)
  if (row) row.quantity += qty
  else cart.push({ id, size, quantity: qty })
  renderCart()
}

function removeFromCart(id, size) {
  cart = cart.filter(i => !(i.id === id && i.size === size))
  renderCart()
}

function renderCart() {
  const itemsTotal = cart.reduce((sum, i) => {
    const p = PRODUCTS.find(p => p.id === i.id)
    return sum + (p.price * i.quantity)
  }, 0)

  const grandTotal = itemsTotal + (wantShipping ? SHIPPING_FEE : 0)
  cartTotal.textContent = fmt(grandTotal)

  cartList.innerHTML = cart.map(i => {
    const p = PRODUCTS.find(p => p.id === i.id)
    return `
      <li>
        <span>${p.name} (${i.size}) × ${i.quantity}</span>
        <button class="shop-btn secondary" data-remove="${i.id}" data-size="${i.size}">Retirer</button>
      </li>
    `
  }).join('')

  cartList.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.getAttribute('data-remove'), btn.getAttribute('data-size')))
  })
}

// --- Auth UI ---
async function syncAuthUI() {
  const supabase = await getSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  currentUser = session?.user || null
  authGuard.style.display = currentUser ? 'none' : 'block'
  authLink.style.display  = currentUser ? 'none' : 'inline-flex'
  logoutBtn.style.display = currentUser ? 'inline-flex' : 'none'
}

logoutBtn?.addEventListener('click', async () => {
  const supabase = await getSupabase()
  await supabase.auth.signOut()
  await syncAuthUI()
})

// --- Livraison checkbox ---
shippingToggle?.addEventListener('change', () => {
  wantShipping = !!shippingToggle.checked
  renderCart()
})

// --- Paiement Stripe ---
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
      body: JSON.stringify({
        items: cart,
        customerEmail: email,
        userId: session?.user?.id,
        shipping: { enabled: wantShipping } // <= IMPORTANT
      }),
    })

    const text = await res.text()
    let json = {}
    try { json = text ? JSON.parse(text) : {} } catch(_) {}

    if (!res.ok) {
      throw new Error(json?.error || `Fonction indisponible (HTTP ${res.status}). Réponse: ${text.slice(0,180)}`)
    }
    if (!json?.url) throw new Error('La fonction n’a pas renvoyé d’URL de Checkout.')
    window.location.href = json.url
  } catch (e) {
    alert(e.message)
    console.error(e)
  }
})

renderProducts()
renderCart()
syncAuthUI()
