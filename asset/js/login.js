// asset/js/login.js
// Page de connexion de l'administration IPP.
// Session déjà valide → redirection immédiate vers ./admin.html.
// Connexion réussie → redirection vers ./admin.html.
// Rien n'est stocké manuellement (pas de localStorage) : la session est gérée
// par le SDK Appwrite.

import { account, AppwriteException, logNetworkDiagnostic } from './appwrite-client.js';

const ADMIN_PAGE = './admin.html';

const loadingEl = document.getElementById('loginLoading');
const loginView = document.getElementById('loginView');
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('loginEmail');
const passwordInput = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');

let submitting = false;

function showForm() {
  loadingEl.hidden = true;
  loginView.hidden = false;
  emailInput.focus();
}

function showError(message) {
  loginError.textContent = message;
  loginError.hidden = false;
}

function clearError() {
  loginError.textContent = '';
  loginError.hidden = true;
}

function friendlyLoginError(err) {
  if (err instanceof AppwriteException) {
    if (err.code === 401 || err.type === 'user_invalid_credentials') {
      return 'E-mail ou mot de passe incorrect.';
    }
    if (err.code === 429) {
      return 'Trop de tentatives. Réessaie dans quelques minutes.';
    }
    if (err.type === 'user_blocked') {
      return 'Ce compte est bloqué. Contacte le responsable du site.';
    }
    if (err.code >= 500) {
      return 'Le serveur est momentanément indisponible. Réessaie plus tard.';
    }
    return 'La connexion a échoué. Vérifie tes identifiants et réessaie.';
  }
  return 'Impossible de contacter le serveur. Vérifie ta connexion internet.';
}

/* ---------- Session déjà ouverte ? ---------- */

async function checkExistingSession() {
  try {
    await account.get();
    // Session valide : on ne montre jamais le formulaire.
    window.location.replace(ADMIN_PAGE);
  } catch (err) {
    logNetworkDiagnostic(err);
    showForm();
  }
}

/* ---------- Connexion ---------- */

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (submitting) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  passwordInput.value = ''; // le mot de passe ne reste jamais dans le champ

  clearError();

  if (!email || !password) {
    showError('Merci de renseigner l’e-mail et le mot de passe.');
    return;
  }

  submitting = true;
  loginBtn.disabled = true;
  loginBtn.textContent = 'Connexion…';

  try {
    await account.createEmailPasswordSession({ email, password });
    window.location.replace(ADMIN_PAGE);
    // Pas de réactivation du bouton : la page est en cours de remplacement.
  } catch (err) {
    console.error('[login] connexion impossible :', err);
    logNetworkDiagnostic(err);
    showError(friendlyLoginError(err));
    submitting = false;
    loginBtn.disabled = false;
    loginBtn.textContent = 'Se connecter';
  }
});

/* ---------- Démarrage ---------- */

checkExistingSession();
