// asset/js/auth.js  (type=module)
import { getSupabase } from './supabase-init.js';

const supabase = await getSupabase();

// Cible tes éléments (adapte les sélecteurs si tes IDs diffèrent)
const emailInput    = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const loginBtn      = document.querySelector('#loginBtn');   // bouton "Se connecter"
const signupBtn     = document.querySelector('#signupBtn');  // bouton "Créer un compte"

// Où rediriger après clic sur le lien de confirmation reçu par e-mail
const REDIRECT_URL = 'https://ipp-imprimerie.netlify.app/shop';

// Création de compte (envoi de l'e-mail de confirmation)
signupBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = (emailInput?.value || '').trim();
  const password = passwordInput?.value || '';

  if (!email || !password) {
    alert('Merci de renseigner un e-mail et un mot de passe.');
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: REDIRECT_URL, // <-- c'est ici que se fait la redirection finale
    },
  });

  if (error) {
    console.error(error);
    alert('Erreur lors de l’envoi de l’e-mail de confirmation : ' + error.message);
  } else {
    alert('E-mail de confirmation envoyé ! Vérifie ta boîte de réception.');
  }
});

// Connexion classique
loginBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = (emailInput?.value || '').trim();
  const password = passwordInput?.value || '';

  if (!email || !password) {
    alert('Merci de renseigner un e-mail et un mot de passe.');
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(error);
    alert('Connexion impossible : ' + error.message);
  } else {
    // connecté -> on peut renvoyer vers la boutique
    window.location.href = '/shop';
  }
});
