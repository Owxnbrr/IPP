// asset/js/admin.js
// Tableau de bord de l'administration IPP (page protégée).
// La connexion se fait sur ./login.html : ici, toute absence de session valide
// provoque une redirection immédiate. La session est gérée par le SDK Appwrite,
// rien n'est stocké manuellement (pas de localStorage).

import {
  account,
  tablesDB,
  storage,
  Query,
  ID,
  AppwriteException,
  logNetworkDiagnostic,
} from './appwrite-client.js';

import {
  APPWRITE_DATABASE_ID,
  APPWRITE_CAROUSEL_TABLE_ID,
  APPWRITE_BUCKET_ID,
} from './appwrite-config.js';

import { migrateStaticCarousel } from './carousel-migration.js';

const LOGIN_PAGE = './login.html';

const loadingEl = document.getElementById('adminLoading');
const dashboardView = document.getElementById('dashboardView');
const logoutBtn = document.getElementById('logoutBtn');
const userEmailEl = document.getElementById('adminUserEmail');
const dashboardMessage = document.getElementById('dashboardMessage');

let isAuthenticated = false;

/* ---------- Garde de session ---------- */

function redirectToLogin() {
  isAuthenticated = false;
  window.location.replace(LOGIN_PAGE);
}

function isSessionError(err) {
  return err instanceof AppwriteException && err.code === 401;
}

// Session expirée pendant une opération : on arrête tout et on repart au login.
function handleSessionExpired() {
  redirectToLogin();
}

// Écran global « Vérification de la session… ».
// Le style inline double l'attribut hidden : même si un ancien admin.css en
// cache force encore display:flex, l'écran disparaît sans laisser d'espace.
function setSessionLoading(visible) {
  loadingEl.hidden = !visible;
  loadingEl.style.display = visible ? '' : 'none';
}

function showDashboard(user) {
  isAuthenticated = true;
  setSessionLoading(false);
  dashboardView.hidden = false;
  userEmailEl.textContent = user && user.email ? user.email : '';
  loadSlides();
}

function showDashboardMessage(message) {
  dashboardMessage.textContent = message;
  dashboardMessage.hidden = !message;
}

// Le tableau de bord n'est jamais affiché avant la validation de la session,
// et l'écran de vérification ne reste jamais affiché en même temps que lui :
// session valide → chargement masqué puis dashboard ; sinon → redirection.
async function checkSession() {
  setSessionLoading(true);
  try {
    const user = await account.get();
    showDashboard(user);
  } catch (err) {
    // Session absente/expirée ou erreur réseau : on ne laisse pas l'écran
    // tourner indéfiniment, on repart sur la page de connexion.
    logNetworkDiagnostic(err);
    redirectToLogin();
  }
}

/* ---------- Déconnexion ---------- */

logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  showDashboardMessage('');
  try {
    await account.deleteSession({ sessionId: 'current' });
  } catch (err) {
    // Session déjà expirée ou erreur : on repart quand même au login.
    console.error('[admin] déconnexion :', err);
  }
  redirectToLogin();
});

/* ==========================================================================
   Gestion du carrousel (table carousel_slides + bucket Storage)
   ========================================================================== */

const slideAddBtn = document.getElementById('slideAddBtn');
const slideForm = document.getElementById('slideForm');
const slideFormTitle = document.getElementById('slideFormTitle');
const slideImageInput = document.getElementById('slideImage');
const slideImageHint = document.getElementById('slideImageHint');
const slidePreviewWrap = document.getElementById('slidePreviewWrap');
const slidePreview = document.getElementById('slidePreview');
const slideTitleInput = document.getElementById('slideTitle');
const slideSubtitleInput = document.getElementById('slideSubtitle');
const slideAltInput = document.getElementById('slideAlt');
const slideLinkInput = document.getElementById('slideLink');
const slideActiveInput = document.getElementById('slideActive');
const slideSaveBtn = document.getElementById('slideSaveBtn');
const slideCancelBtn = document.getElementById('slideCancelBtn');
const carouselMessage = document.getElementById('carouselMessage');
const carouselLoading = document.getElementById('carouselLoading');
const carouselEmpty = document.getElementById('carouselEmpty');
const carouselList = document.getElementById('carouselList');

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_IMAGE_SIZE_MB = 10;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const SLIDES_LIMIT = 100;

let slides = [];            // lignes triées par position croissante
let editingSlide = null;    // ligne en cours de modification (null = création)
let slideSaving = false;    // enregistrement du formulaire en cours
let slideListBusy = false;  // opération en cours sur la liste (masquer, déplacer, supprimer)
let previewObjectUrl = null;

/* ---------- Messages de la section carrousel ---------- */

function showCarouselMessage(kind, message) {
  carouselMessage.textContent = message;
  carouselMessage.classList.remove('admin-message-success', 'admin-message-error');
  carouselMessage.classList.add(kind === 'success' ? 'admin-message-success' : 'admin-message-error');
  carouselMessage.hidden = false;
}

function clearCarouselMessage() {
  carouselMessage.textContent = '';
  carouselMessage.hidden = true;
}

function friendlyOperationError(err, fallback) {
  if (err instanceof AppwriteException) {
    if (err.code === 429) return 'Trop de requêtes envoyées. Attends un instant puis réessaie.';
    if (err.code === 403) return 'Action non autorisée avec ce compte. Vérifie les permissions dans Appwrite.';
    if (err.code === 404) return 'Élément introuvable. La liste va être rechargée.';
    if (err.code === 413) return `Le fichier est trop volumineux pour le bucket. Choisis une image plus légère.`;
    if (err.code >= 500) return 'Le serveur est momentanément indisponible. Réessaie plus tard.';
    return fallback;
  }
  return 'Impossible de contacter le serveur. Vérifie ta connexion internet.';
}

/* ---------- Helpers images ---------- */

// URL publique d'un fichier du bucket, générée par le SDK (pas d'URL construite à la main).
// getFileView sert le fichier brut : compatible avec le plan gratuit d'Appwrite Cloud
// (les transformations de getFilePreview sont réservées aux plans payants).
function imageViewUrl(fileId) {
  return storage.getFileView({
    bucketId: APPWRITE_BUCKET_ID,
    fileId,
  }).toString();
}

function validateImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Format non pris en charge. Utilise une image JPG, PNG, WebP ou AVIF.';
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return `L'image dépasse ${MAX_IMAGE_SIZE_MB} Mo. Réduis son poids avant de l'envoyer.`;
  }
  return null;
}

// Lien facultatif : https://, http://, /interne, #ancre ou page relative (tarifs.html).
// Tout autre protocole (javascript:, data:, etc.) est refusé.
function validateLinkUrl(raw) {
  const value = raw.trim();
  if (!value) return { ok: true, value: '' };
  if (/^https?:\/\//i.test(value)) return { ok: true, value };
  if (value.startsWith('/') || value.startsWith('#')) return { ok: true, value };
  if (!value.includes(':')) return { ok: true, value }; // page relative
  return { ok: false, value };
}

/* ---------- Formulaire d'ajout / modification ---------- */

function clearSlidePreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  slidePreview.removeAttribute('src');
  slidePreviewWrap.hidden = true;
}

function showSlidePreviewFromFile(file) {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(file);
  slidePreview.src = previewObjectUrl;
  slidePreviewWrap.hidden = false;
}

function showSlidePreviewFromStorage(fileId) {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  slidePreview.src = imageViewUrl(fileId);
  slidePreviewWrap.hidden = false;
}

function openSlideForm(slide) {
  editingSlide = slide || null;
  slideForm.reset();
  clearSlidePreview();
  clearCarouselMessage();

  if (editingSlide) {
    slideFormTitle.textContent = 'Modifier une image';
    slideImageHint.textContent = '(laisser vide pour conserver l’image actuelle)';
    slideTitleInput.value = editingSlide.title || '';
    slideSubtitleInput.value = editingSlide.subtitle || '';
    slideAltInput.value = editingSlide.altText || '';
    slideLinkInput.value = editingSlide.linkUrl || '';
    slideActiveInput.checked = editingSlide.isActive !== false;
    if (editingSlide.imageId) showSlidePreviewFromStorage(editingSlide.imageId);
  } else {
    slideFormTitle.textContent = 'Ajouter une image';
    slideImageHint.textContent = '(obligatoire)';
    slideActiveInput.checked = true;
  }

  slideForm.hidden = false;
  slideAddBtn.hidden = true;
  slideImageInput.focus();
}

function closeSlideForm() {
  if (!slideForm) return;
  slideForm.reset();
  slideForm.hidden = true;
  if (slideAddBtn) slideAddBtn.hidden = false;
  editingSlide = null;
  clearSlidePreview();
}

slideAddBtn.addEventListener('click', () => openSlideForm(null));
slideCancelBtn.addEventListener('click', () => closeSlideForm());

slideImageInput.addEventListener('change', () => {
  const file = slideImageInput.files && slideImageInput.files[0];
  if (!file) {
    // Champ vidé : en modification on ré-affiche l'image actuelle.
    if (editingSlide && editingSlide.imageId) {
      showSlidePreviewFromStorage(editingSlide.imageId);
    } else {
      clearSlidePreview();
    }
    return;
  }
  const problem = validateImageFile(file);
  if (problem) {
    showCarouselMessage('error', problem);
    slideImageInput.value = '';
    if (editingSlide && editingSlide.imageId) {
      showSlidePreviewFromStorage(editingSlide.imageId);
    } else {
      clearSlidePreview();
    }
    return;
  }
  clearCarouselMessage();
  showSlidePreviewFromFile(file);
});

/* ---------- Chargement et affichage de la liste ---------- */

const carouselImportRetry = document.getElementById('carouselImportRetry');
const carouselLoadingText = carouselLoading.querySelector('p');

let migrationAttempted = false; // un seul import automatique par chargement de page

function setCarouselLoading(visible, text) {
  carouselLoading.hidden = !visible;
  carouselLoadingText.textContent = text || 'Chargement des images du carrousel…';
  if (visible) {
    carouselEmpty.hidden = true;
    carouselList.hidden = true;
  }
}

// Lecture + rendu de la liste, sans logique d'import (utilisé partout).
async function fetchSlides() {
  const result = await tablesDB.listRows({
    databaseId: APPWRITE_DATABASE_ID,
    tableId: APPWRITE_CAROUSEL_TABLE_ID,
    queries: [Query.orderAsc('position'), Query.limit(SLIDES_LIMIT)],
  });
  slides = result.rows;
  renderSlides();
}

async function loadSlides() {
  if (!isAuthenticated) return;

  setCarouselLoading(true);

  try {
    await fetchSlides();

    // Table vide alors que le site public a déjà un carrousel statique :
    // import automatique unique des slides existantes.
    if (!slides.length && !migrationAttempted) {
      migrationAttempted = true;
      await runCarouselImport();
      return;
    }
  } catch (err) {
    console.error('[admin] chargement du carrousel impossible :', err);
    if (isSessionError(err)) {
      handleSessionExpired();
      return;
    }
    logNetworkDiagnostic(err);
    showCarouselMessage('error', friendlyOperationError(err, 'Le chargement des images a échoué. Recharge la page pour réessayer.'));
  } finally {
    setCarouselLoading(false);
  }
}

/* ---------- Import automatique du carrousel statique ---------- */

async function runCarouselImport() {
  if (!isAuthenticated) return;

  carouselImportRetry.hidden = true;
  clearCarouselMessage();
  setCarouselLoading(true, 'Importation du carrousel actuel…');

  let outcome = null;
  let fatalError = null;

  try {
    outcome = await migrateStaticCarousel((current, total) => {
      setCarouselLoading(true, `Importation du carrousel actuel… (image ${current} sur ${total})`);
    });
  } catch (err) {
    fatalError = err;
  }

  if (fatalError && isSessionError(fatalError)) {
    return handleSessionExpired();
  }

  // On affiche l'état réel de la table, import réussi ou non.
  try {
    await fetchSlides();
  } catch (err) {
    console.error('[admin] rechargement après import impossible :', err);
    if (isSessionError(err)) return handleSessionExpired();
  } finally {
    setCarouselLoading(false);
  }

  if (fatalError) {
    console.error('[admin] import du carrousel impossible :', fatalError);
    logNetworkDiagnostic(fatalError);
    showCarouselMessage('error',
      'L’import automatique du carrousel a échoué. Les images statiques restent visibles sur le site public. Clique sur « Réessayer l’import ».');
    carouselImportRetry.hidden = false;
    return;
  }

  if (outcome.failures.length > 0) {
    showCarouselMessage('error',
      `Import partiel : ${outcome.imported} image(s) importée(s) sur ${outcome.total}, ${outcome.failures.length} en échec. `
      + 'Les images statiques restent visibles sur le site public. Clique sur « Réessayer l’import » pour les images manquantes.');
    carouselImportRetry.hidden = false;
    return;
  }

  const detail = outcome.skipped > 0
    ? `${outcome.imported} image(s) ajoutée(s), ${outcome.skipped} déjà présente(s).`
    : `${outcome.imported} image(s) ajoutée(s).`;
  showCarouselMessage('success', `Carrousel actuel importé : ${detail}`);
}

carouselImportRetry.addEventListener('click', () => {
  runCarouselImport();
});

function slideLabel(slide) {
  return slide.title || slide.altText || 'Image sans titre';
}

function renderSlides() {
  carouselList.innerHTML = '';

  if (!slides.length) {
    carouselEmpty.hidden = false;
    carouselList.hidden = true;
    return;
  }

  carouselEmpty.hidden = true;
  carouselList.hidden = false;

  slides.forEach((slide, index) => {
    const li = document.createElement('li');
    li.className = 'admin-slide' + (slide.isActive ? '' : ' admin-slide-off');
    li.dataset.id = slide.$id;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'admin-slide-thumb';
    const thumb = document.createElement('img');
    thumb.loading = 'lazy';
    thumb.alt = slide.altText || slideLabel(slide);
    thumb.src = imageViewUrl(slide.imageId);
    thumb.addEventListener('error', () => {
      thumbWrap.classList.add('admin-slide-thumb-broken');
      thumb.remove();
    });
    thumbWrap.appendChild(thumb);

    const info = document.createElement('div');
    info.className = 'admin-slide-info';

    const name = document.createElement('p');
    name.className = 'admin-slide-name';
    name.textContent = slideLabel(slide);

    const meta = document.createElement('p');
    meta.className = 'admin-slide-meta';
    const badge = document.createElement('span');
    badge.className = 'admin-badge ' + (slide.isActive ? 'admin-badge-on' : 'admin-badge-off');
    badge.textContent = slide.isActive ? 'Visible' : 'Masquée';
    meta.appendChild(badge);
    meta.appendChild(document.createTextNode(` Position ${index + 1} sur ${slides.length}`));

    info.appendChild(name);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'admin-slide-actions';

    const buttons = [
      { action: 'up', label: 'Monter', disabled: index === 0 },
      { action: 'down', label: 'Descendre', disabled: index === slides.length - 1 },
      { action: 'edit', label: 'Modifier' },
      { action: 'toggle', label: slide.isActive ? 'Masquer' : 'Afficher' },
      { action: 'delete', label: 'Supprimer', danger: true },
    ];

    buttons.forEach(({ action, label, disabled, danger }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-btn admin-btn-small ' + (danger ? 'admin-btn-danger' : 'admin-btn-secondary');
      btn.dataset.action = action;
      btn.textContent = label;
      btn.disabled = Boolean(disabled);
      btn.setAttribute('aria-label', `${label} : ${slideLabel(slide)}`);
      actions.appendChild(btn);
    });

    li.appendChild(thumbWrap);
    li.appendChild(info);
    li.appendChild(actions);
    carouselList.appendChild(li);
  });
}

function setListBusy(busy) {
  slideListBusy = busy;
  carouselList.setAttribute('aria-busy', busy ? 'true' : 'false');
  carouselList.querySelectorAll('button').forEach((btn) => {
    btn.disabled = busy;
  });
  if (!busy) renderSlides(); // ré-applique les états disabled corrects (premier/dernier)
}

/* ---------- Enregistrement (création et modification) ---------- */

function readSlideFormData() {
  const link = validateLinkUrl(slideLinkInput.value);
  if (!link.ok) {
    showCarouselMessage('error', 'Le lien n’est pas valide. Utilise une adresse https://, une page interne (/page ou tarifs.html) ou une ancre (#section).');
    slideLinkInput.focus();
    return null;
  }
  return {
    title: slideTitleInput.value.trim() || null,
    subtitle: slideSubtitleInput.value.trim() || null,
    altText: slideAltInput.value.trim() || null,
    linkUrl: link.value || null,
    isActive: slideActiveInput.checked,
  };
}

function nextPosition() {
  if (!slides.length) return 0;
  return Math.max(...slides.map((s) => Number(s.position) || 0)) + 1;
}

async function uploadImage(file) {
  const created = await storage.createFile({
    bucketId: APPWRITE_BUCKET_ID,
    fileId: ID.unique(),
    file,
  });
  return created.$id;
}

async function tryDeleteFile(fileId, context) {
  try {
    await storage.deleteFile({ bucketId: APPWRITE_BUCKET_ID, fileId });
    return true;
  } catch (err) {
    console.error(`[admin] suppression du fichier ${context} impossible :`, err);
    return false;
  }
}

slideForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (slideSaving || !isAuthenticated) return;

  clearCarouselMessage();

  const data = readSlideFormData();
  if (!data) return;

  const file = slideImageInput.files && slideImageInput.files[0];

  if (!editingSlide && !file) {
    showCarouselMessage('error', 'Merci de choisir une image.');
    slideImageInput.focus();
    return;
  }

  if (file) {
    const problem = validateImageFile(file);
    if (problem) {
      showCarouselMessage('error', problem);
      return;
    }
  }

  slideSaving = true;
  slideSaveBtn.disabled = true;
  slideCancelBtn.disabled = true;
  slideSaveBtn.textContent = file ? 'Envoi de l’image…' : 'Enregistrement…';

  try {
    if (!editingSlide) {
      await createSlide(data, file);
      showCarouselMessage('success', 'Image ajoutée au carrousel.');
    } else {
      await updateSlide(editingSlide, data, file);
      showCarouselMessage('success', 'Image mise à jour.');
    }
    closeSlideForm();
    await loadSlides();
  } catch (err) {
    console.error('[admin] enregistrement de la slide impossible :', err);
    if (isSessionError(err)) {
      handleSessionExpired();
    } else {
      showCarouselMessage('error', friendlyOperationError(err, 'L’enregistrement a échoué. Réessaie.'));
    }
  } finally {
    slideSaving = false;
    slideSaveBtn.disabled = false;
    slideCancelBtn.disabled = false;
    slideSaveBtn.textContent = 'Enregistrer';
  }
});

async function createSlide(data, file) {
  const imageId = await uploadImage(file);
  try {
    await tablesDB.createRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_CAROUSEL_TABLE_ID,
      rowId: ID.unique(),
      data: { ...data, imageId, position: nextPosition() },
    });
  } catch (err) {
    // Ligne non créée : on évite de laisser un fichier orphelin dans le bucket.
    await tryDeleteFile(imageId, 'orphelin (création annulée)');
    throw err;
  }
}

async function updateSlide(slide, data, file) {
  if (!file) {
    await tablesDB.updateRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_CAROUSEL_TABLE_ID,
      rowId: slide.$id,
      data,
    });
    return;
  }

  const oldImageId = slide.imageId;
  const newImageId = await uploadImage(file);
  slideSaveBtn.textContent = 'Enregistrement…';

  try {
    await tablesDB.updateRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_CAROUSEL_TABLE_ID,
      rowId: slide.$id,
      data: { ...data, imageId: newImageId },
    });
  } catch (err) {
    // Mise à jour échouée : on supprime la nouvelle image, l'ancienne reste en place.
    await tryDeleteFile(newImageId, 'nouvellement envoyé (mise à jour annulée)');
    throw err;
  }

  // L'ancienne image n'est supprimée qu'après la réussite de la mise à jour.
  if (oldImageId && oldImageId !== newImageId) {
    const deleted = await tryDeleteFile(oldImageId, 'ancien');
    if (!deleted) {
      showCarouselMessage('error', 'Image mise à jour, mais l’ancienne image n’a pas pu être supprimée du stockage.');
    }
  }
}

/* ---------- Actions sur la liste (déléguées) ---------- */

carouselList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn || slideListBusy || !isAuthenticated) return;

  const li = btn.closest('li[data-id]');
  const slide = slides.find((s) => s.$id === li?.dataset.id);
  if (!slide) return;

  const action = btn.dataset.action;

  if (action === 'edit') {
    openSlideForm(slide);
    slideForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (action === 'toggle') return toggleSlide(slide);
  if (action === 'up') return moveSlide(slide, -1);
  if (action === 'down') return moveSlide(slide, 1);
  if (action === 'delete') return deleteSlide(slide);
});

async function toggleSlide(slide) {
  clearCarouselMessage();
  setListBusy(true);
  try {
    await tablesDB.updateRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_CAROUSEL_TABLE_ID,
      rowId: slide.$id,
      data: { isActive: !slide.isActive },
    });
    showCarouselMessage('success', slide.isActive ? 'Image masquée sur le site.' : 'Image affichée sur le site.');
    await loadSlides();
  } catch (err) {
    console.error('[admin] changement de visibilité impossible :', err);
    if (isSessionError(err)) return handleSessionExpired();
    showCarouselMessage('error', friendlyOperationError(err, 'Le changement de visibilité a échoué. Réessaie.'));
  } finally {
    setListBusy(false);
  }
}

async function moveSlide(slide, direction) {
  const index = slides.indexOf(slide);
  const other = slides[index + direction];
  if (!other) return;

  clearCarouselMessage();
  setListBusy(true);

  // Échange des positions. Si elles sont identiques (anciennes lignes avec la
  // valeur par défaut 0), on retombe sur les index actuels pour les distinguer.
  let posA = Number(slide.position) || 0;
  let posB = Number(other.position) || 0;
  if (posA === posB) {
    posA = index;
    posB = index + direction;
  }

  try {
    await tablesDB.updateRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_CAROUSEL_TABLE_ID,
      rowId: slide.$id,
      data: { position: posB },
    });
    try {
      await tablesDB.updateRow({
        databaseId: APPWRITE_DATABASE_ID,
        tableId: APPWRITE_CAROUSEL_TABLE_ID,
        rowId: other.$id,
        data: { position: posA },
      });
    } catch (err) {
      // Deuxième mise à jour échouée : on tente de rétablir la première.
      console.error('[admin] échange de positions incomplet :', err);
      try {
        await tablesDB.updateRow({
          databaseId: APPWRITE_DATABASE_ID,
          tableId: APPWRITE_CAROUSEL_TABLE_ID,
          rowId: slide.$id,
          data: { position: posA },
        });
      } catch (revertErr) {
        console.error('[admin] retour arrière impossible :', revertErr);
      }
      throw err;
    }
    await loadSlides();
  } catch (err) {
    if (isSessionError(err)) return handleSessionExpired();
    showCarouselMessage('error', friendlyOperationError(err, 'Le déplacement a échoué. L’ordre n’a pas été modifié.'));
    await loadSlides();
  } finally {
    setListBusy(false);
  }
}

async function deleteSlide(slide) {
  const confirmed = window.confirm(
    `Supprimer définitivement « ${slideLabel(slide)} » du carrousel ?\nCette action est irréversible.`
  );
  if (!confirmed) return;

  clearCarouselMessage();
  setListBusy(true);

  try {
    await tablesDB.deleteRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_CAROUSEL_TABLE_ID,
      rowId: slide.$id,
    });

    let message = 'Image supprimée du carrousel.';
    if (slide.imageId) {
      const fileDeleted = await tryDeleteFile(slide.imageId, 'de la slide supprimée');
      if (!fileDeleted) {
        message = 'Image retirée du carrousel, mais le fichier n’a pas pu être supprimé du stockage.';
      }
    }
    showCarouselMessage(message.includes('pas pu') ? 'error' : 'success', message);
    await loadSlides();
  } catch (err) {
    console.error('[admin] suppression de la slide impossible :', err);
    if (isSessionError(err)) return handleSessionExpired();
    showCarouselMessage('error', friendlyOperationError(err, 'La suppression a échoué. Réessaie.'));
  } finally {
    setListBusy(false);
  }
}

/* ---------- Démarrage ---------- */

checkSession();
