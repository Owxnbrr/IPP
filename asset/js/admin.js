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
  APPWRITE_PROJECTS_TABLE_ID,
  APPWRITE_BUCKET_ID,
} from './appwrite-config.js';

import { migrateStaticCarousel } from './carousel-migration.js';
import { migrateStaticProjects } from './projects-migration.js';

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
  // Chargements indépendants et non bloquants l'un pour l'autre.
  loadSlides();
  loadProjects();
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

/* ==========================================================================
   Gestion des réalisations (table projects + bucket Storage)
   ========================================================================== */

const projectAddBtn = document.getElementById('projectAddBtn');
const projectForm = document.getElementById('projectForm');
const projectFormTitle = document.getElementById('projectFormTitle');
const projectTitleInput = document.getElementById('projectTitle');
const projectDescriptionInput = document.getElementById('projectDescription');
const projectCategoryInput = document.getElementById('projectCategory');
const projectCoverInput = document.getElementById('projectCover');
const projectCoverHint = document.getElementById('projectCoverHint');
const projectCoverPreviewWrap = document.getElementById('projectCoverPreviewWrap');
const projectCoverPreview = document.getElementById('projectCoverPreview');
const projectCoverAltInput = document.getElementById('projectCoverAlt');
const projectGalleryInput = document.getElementById('projectGalleryInput');
const projectGalleryList = document.getElementById('projectGalleryList');
const projectActiveInput = document.getElementById('projectActive');
const projectSaveBtn = document.getElementById('projectSaveBtn');
const projectCancelBtn = document.getElementById('projectCancelBtn');
const projectsMessage = document.getElementById('projectsMessage');
const projectsImportRetry = document.getElementById('projectsImportRetry');
const projectsLoading = document.getElementById('projectsLoading');
const projectsLoadingText = projectsLoading.querySelector('p');
const projectsEmpty = document.getElementById('projectsEmpty');
const projectsList = document.getElementById('projectsList');

let projects = [];              // lignes triées par position croissante
let editingProject = null;      // ligne en cours de modification (null = création)
let projectSaving = false;
let projectsListBusy = false;
let projectsMigrationAttempted = false;
let coverPreviewUrl = null;
// Galerie du formulaire : tableau ordonné d'éléments
// { kind: 'existing', fileId } ou { kind: 'new', file, url }.
let galleryItems = [];

/* ---------- Messages et états ---------- */

function showProjectsMessage(kind, message) {
  projectsMessage.textContent = message;
  projectsMessage.classList.remove('admin-message-success', 'admin-message-error');
  projectsMessage.classList.add(kind === 'success' ? 'admin-message-success' : 'admin-message-error');
  projectsMessage.hidden = false;
}

function clearProjectsMessage() {
  projectsMessage.textContent = '';
  projectsMessage.hidden = true;
}

function setProjectsLoading(visible, text) {
  projectsLoading.hidden = !visible;
  projectsLoadingText.textContent = text || 'Chargement des réalisations…';
  if (visible) {
    projectsEmpty.hidden = true;
    projectsList.hidden = true;
  }
}

/* ---------- Aperçus du formulaire ---------- */

function clearCoverPreview() {
  if (coverPreviewUrl) {
    URL.revokeObjectURL(coverPreviewUrl);
    coverPreviewUrl = null;
  }
  projectCoverPreview.removeAttribute('src');
  projectCoverPreviewWrap.hidden = true;
}

function showCoverPreviewFromFile(file) {
  if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
  coverPreviewUrl = URL.createObjectURL(file);
  projectCoverPreview.src = coverPreviewUrl;
  projectCoverPreviewWrap.hidden = false;
}

function showCoverPreviewFromStorage(fileId) {
  if (coverPreviewUrl) {
    URL.revokeObjectURL(coverPreviewUrl);
    coverPreviewUrl = null;
  }
  projectCoverPreview.src = imageViewUrl(fileId);
  projectCoverPreviewWrap.hidden = false;
}

function clearGalleryItems() {
  galleryItems.forEach((item) => {
    if (item.kind === 'new' && item.url) URL.revokeObjectURL(item.url);
  });
  galleryItems = [];
  renderGalleryEditor();
}

/* ---------- Éditeur de galerie (ordre, retrait, ajouts) ---------- */

function renderGalleryEditor() {
  projectGalleryList.innerHTML = '';

  galleryItems.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'admin-gallery-item';

    const thumb = document.createElement('img');
    thumb.className = 'admin-gallery-thumb';
    thumb.loading = 'lazy';
    thumb.alt = `Image de galerie ${index + 1}`;
    thumb.src = item.kind === 'existing' ? imageViewUrl(item.fileId) : item.url;
    li.appendChild(thumb);

    const label = document.createElement('span');
    label.className = 'admin-gallery-label';
    label.textContent = item.kind === 'existing'
      ? `Image ${index + 1}`
      : `Image ${index + 1} — nouvelle (${item.file.name})`;
    li.appendChild(label);

    const actions = document.createElement('span');
    actions.className = 'admin-gallery-actions';

    [
      { action: 'gallery-up', text: 'Monter', disabled: index === 0 },
      { action: 'gallery-down', text: 'Descendre', disabled: index === galleryItems.length - 1 },
      { action: 'gallery-remove', text: 'Retirer', danger: true },
    ].forEach(({ action, text, disabled, danger }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-btn admin-btn-small ' + (danger ? 'admin-btn-danger' : 'admin-btn-secondary');
      btn.dataset.action = action;
      btn.dataset.index = String(index);
      btn.textContent = text;
      btn.disabled = Boolean(disabled);
      btn.setAttribute('aria-label', `${text} l'image de galerie ${index + 1}`);
      actions.appendChild(btn);
    });

    li.appendChild(actions);
    projectGalleryList.appendChild(li);
  });
}

projectGalleryList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn || projectSaving) return;
  const index = Number(btn.dataset.index);
  const item = galleryItems[index];
  if (!item) return;

  if (btn.dataset.action === 'gallery-up' && index > 0) {
    [galleryItems[index - 1], galleryItems[index]] = [galleryItems[index], galleryItems[index - 1]];
  } else if (btn.dataset.action === 'gallery-down' && index < galleryItems.length - 1) {
    [galleryItems[index + 1], galleryItems[index]] = [galleryItems[index], galleryItems[index + 1]];
  } else if (btn.dataset.action === 'gallery-remove') {
    if (item.kind === 'new' && item.url) URL.revokeObjectURL(item.url);
    galleryItems.splice(index, 1);
  }
  renderGalleryEditor();
});

projectGalleryInput.addEventListener('change', () => {
  const files = Array.from(projectGalleryInput.files || []);
  projectGalleryInput.value = ''; // la sélection est transférée dans la liste
  if (!files.length) return;

  const rejected = [];
  files.forEach((file) => {
    const problem = validateImageFile(file);
    if (problem) {
      rejected.push(`${file.name} (${problem})`);
    } else {
      galleryItems.push({ kind: 'new', file, url: URL.createObjectURL(file) });
    }
  });

  if (rejected.length) {
    showProjectsMessage('error', `Fichier(s) refusé(s) : ${rejected.join(' ; ')}`);
  } else {
    clearProjectsMessage();
  }
  renderGalleryEditor();
});

projectCoverInput.addEventListener('change', () => {
  const file = projectCoverInput.files && projectCoverInput.files[0];
  if (!file) {
    if (editingProject && editingProject.coverImageId) {
      showCoverPreviewFromStorage(editingProject.coverImageId);
    } else {
      clearCoverPreview();
    }
    return;
  }
  const problem = validateImageFile(file);
  if (problem) {
    showProjectsMessage('error', problem);
    projectCoverInput.value = '';
    if (editingProject && editingProject.coverImageId) {
      showCoverPreviewFromStorage(editingProject.coverImageId);
    } else {
      clearCoverPreview();
    }
    return;
  }
  clearProjectsMessage();
  showCoverPreviewFromFile(file);
});

/* ---------- Ouverture / fermeture du formulaire ---------- */

function openProjectForm(project) {
  editingProject = project || null;
  projectForm.reset();
  clearCoverPreview();
  clearGalleryItems();
  clearProjectsMessage();

  if (editingProject) {
    projectFormTitle.textContent = 'Modifier une réalisation';
    projectCoverHint.textContent = '(laisser vide pour conserver l’image actuelle)';
    projectTitleInput.value = editingProject.title || '';
    projectDescriptionInput.value = editingProject.description || '';
    projectCategoryInput.value = editingProject.category || '';
    projectCoverAltInput.value = editingProject.coverAlt || '';
    projectActiveInput.checked = editingProject.isActive !== false;
    if (editingProject.coverImageId) showCoverPreviewFromStorage(editingProject.coverImageId);
    galleryItems = (editingProject.galleryImageIds || []).map((fileId) => ({ kind: 'existing', fileId }));
    renderGalleryEditor();
  } else {
    projectFormTitle.textContent = 'Ajouter une réalisation';
    projectCoverHint.textContent = '(obligatoire)';
    projectActiveInput.checked = true;
  }

  projectForm.hidden = false;
  projectAddBtn.hidden = true;
  projectTitleInput.focus();
}

function closeProjectForm() {
  if (!projectForm) return;
  projectForm.reset();
  projectForm.hidden = true;
  if (projectAddBtn) projectAddBtn.hidden = false;
  editingProject = null;
  clearCoverPreview();
  clearGalleryItems();
}

projectAddBtn.addEventListener('click', () => openProjectForm(null));
projectCancelBtn.addEventListener('click', () => closeProjectForm());

/* ---------- Chargement de la liste ---------- */

async function fetchProjects() {
  const result = await tablesDB.listRows({
    databaseId: APPWRITE_DATABASE_ID,
    tableId: APPWRITE_PROJECTS_TABLE_ID,
    queries: [Query.orderAsc('position'), Query.limit(100)],
  });
  projects = result.rows;
  renderProjects();
}

async function loadProjects() {
  if (!isAuthenticated) return;

  setProjectsLoading(true);

  try {
    await fetchProjects();

    if (!projects.length && !projectsMigrationAttempted) {
      projectsMigrationAttempted = true;
      await runProjectsImport();
      return;
    }
  } catch (err) {
    console.error('[admin] chargement des réalisations impossible :', err);
    if (isSessionError(err)) {
      handleSessionExpired();
      return;
    }
    logNetworkDiagnostic(err);
    showProjectsMessage('error', friendlyOperationError(err, 'Le chargement des réalisations a échoué. Recharge la page pour réessayer.'));
  } finally {
    setProjectsLoading(false);
  }
}

/* ---------- Import automatique des réalisations statiques ---------- */

async function runProjectsImport() {
  if (!isAuthenticated) return;

  projectsImportRetry.hidden = true;
  clearProjectsMessage();
  setProjectsLoading(true, 'Importation des réalisations actuelles…');

  let outcome = null;
  let fatalError = null;

  try {
    outcome = await migrateStaticProjects((current, total) => {
      setProjectsLoading(true, `Importation des réalisations actuelles… (${current} sur ${total})`);
    });
  } catch (err) {
    fatalError = err;
  }

  if (fatalError && isSessionError(fatalError)) {
    return handleSessionExpired();
  }

  try {
    await fetchProjects();
  } catch (err) {
    console.error('[admin] rechargement après import impossible :', err);
    if (isSessionError(err)) return handleSessionExpired();
  } finally {
    setProjectsLoading(false);
  }

  if (fatalError) {
    console.error('[admin] import des réalisations impossible :', fatalError);
    logNetworkDiagnostic(fatalError);
    showProjectsMessage('error',
      'L’import automatique des réalisations a échoué. Les cartes statiques restent visibles sur le site public. Clique sur « Réessayer l’import ».');
    projectsImportRetry.hidden = false;
    return;
  }

  if (outcome.failures.length > 0) {
    showProjectsMessage('error',
      `Import partiel : ${outcome.imported} réalisation(s) importée(s) sur ${outcome.total}, ${outcome.failures.length} en échec. `
      + 'Les cartes statiques restent visibles sur le site public. Clique sur « Réessayer l’import ».');
    projectsImportRetry.hidden = false;
    return;
  }

  const detail = outcome.skipped > 0
    ? `${outcome.imported} ajoutée(s), ${outcome.skipped} déjà présente(s).`
    : `${outcome.imported} ajoutée(s).`;
  showProjectsMessage('success', `Réalisations actuelles importées : ${detail}`);
}

projectsImportRetry.addEventListener('click', () => {
  runProjectsImport();
});

/* ---------- Rendu de la liste ---------- */

function truncateText(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

function renderProjects() {
  projectsList.innerHTML = '';

  if (!projects.length) {
    projectsEmpty.hidden = false;
    projectsList.hidden = true;
    return;
  }

  projectsEmpty.hidden = true;
  projectsList.hidden = false;

  projects.forEach((project, index) => {
    const li = document.createElement('li');
    li.className = 'admin-slide' + (project.isActive ? '' : ' admin-slide-off');
    li.dataset.id = project.$id;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'admin-slide-thumb';
    const thumb = document.createElement('img');
    thumb.loading = 'lazy';
    thumb.alt = project.coverAlt || project.title;
    thumb.src = imageViewUrl(project.coverImageId);
    thumb.addEventListener('error', () => {
      thumbWrap.classList.add('admin-slide-thumb-broken');
      thumb.remove();
    });
    thumbWrap.appendChild(thumb);

    const info = document.createElement('div');
    info.className = 'admin-slide-info';

    const name = document.createElement('p');
    name.className = 'admin-slide-name';
    name.textContent = project.title;

    const desc = document.createElement('p');
    desc.className = 'admin-slide-desc';
    desc.textContent = truncateText(project.description, 90);

    const meta = document.createElement('p');
    meta.className = 'admin-slide-meta';
    const badge = document.createElement('span');
    badge.className = 'admin-badge ' + (project.isActive ? 'admin-badge-on' : 'admin-badge-off');
    badge.textContent = project.isActive ? 'Visible' : 'Masquée';
    meta.appendChild(badge);
    const galleryCount = (project.galleryImageIds || []).length;
    let metaText = ` Position ${index + 1} sur ${projects.length} · ${galleryCount} image(s) de galerie`;
    if (project.category) metaText += ` · ${project.category}`;
    meta.appendChild(document.createTextNode(metaText));

    info.appendChild(name);
    if (project.description) info.appendChild(desc);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'admin-slide-actions';

    [
      { action: 'up', label: 'Monter', disabled: index === 0 },
      { action: 'down', label: 'Descendre', disabled: index === projects.length - 1 },
      { action: 'edit', label: 'Modifier' },
      { action: 'toggle', label: project.isActive ? 'Masquer' : 'Afficher' },
      { action: 'delete', label: 'Supprimer', danger: true },
    ].forEach(({ action, label, disabled, danger }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-btn admin-btn-small ' + (danger ? 'admin-btn-danger' : 'admin-btn-secondary');
      btn.dataset.action = action;
      btn.textContent = label;
      btn.disabled = Boolean(disabled);
      btn.setAttribute('aria-label', `${label} : ${project.title}`);
      actions.appendChild(btn);
    });

    li.appendChild(thumbWrap);
    li.appendChild(info);
    li.appendChild(actions);
    projectsList.appendChild(li);
  });
}

function setProjectsListBusy(busy) {
  projectsListBusy = busy;
  projectsList.setAttribute('aria-busy', busy ? 'true' : 'false');
  projectsList.querySelectorAll('button').forEach((btn) => {
    btn.disabled = busy;
  });
  if (!busy) renderProjects();
}

/* ---------- Enregistrement (création et modification) ---------- */

function nextProjectPosition() {
  if (!projects.length) return 0;
  return Math.max(...projects.map((p) => Number(p.position) || 0)) + 1;
}

projectForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (projectSaving || !isAuthenticated) return;

  clearProjectsMessage();

  const title = projectTitleInput.value.trim();
  if (!title) {
    showProjectsMessage('error', 'Merci de renseigner un titre.');
    projectTitleInput.focus();
    return;
  }

  const coverFile = projectCoverInput.files && projectCoverInput.files[0];

  if (!editingProject && !coverFile) {
    showProjectsMessage('error', 'Merci de choisir une image principale.');
    projectCoverInput.focus();
    return;
  }

  if (coverFile) {
    const problem = validateImageFile(coverFile);
    if (problem) {
      showProjectsMessage('error', problem);
      return;
    }
  }

  const data = {
    title,
    description: projectDescriptionInput.value.trim() || null,
    category: projectCategoryInput.value.trim() || null,
    coverAlt: projectCoverAltInput.value.trim() || null,
    isActive: projectActiveInput.checked,
  };

  projectSaving = true;
  projectSaveBtn.disabled = true;
  projectCancelBtn.disabled = true;
  projectSaveBtn.textContent = 'Envoi des images…';

  try {
    let cleanupFailed = false;
    if (!editingProject) {
      await createProject(data, coverFile);
      showProjectsMessage('success', 'Réalisation ajoutée.');
    } else {
      cleanupFailed = await updateProject(editingProject, data, coverFile);
      if (cleanupFailed) {
        showProjectsMessage('error', 'Réalisation mise à jour, mais certaines anciennes images n’ont pas pu être supprimées du stockage.');
      } else {
        showProjectsMessage('success', 'Réalisation mise à jour.');
      }
    }
    closeProjectForm();
    await loadProjects();
  } catch (err) {
    console.error('[admin] enregistrement de la réalisation impossible :', err);
    if (isSessionError(err)) {
      handleSessionExpired();
    } else {
      showProjectsMessage('error', friendlyOperationError(err, 'L’enregistrement a échoué. Réessaie.'));
    }
  } finally {
    projectSaving = false;
    projectSaveBtn.disabled = false;
    projectCancelBtn.disabled = false;
    projectSaveBtn.textContent = 'Enregistrer';
  }
});

async function createProject(data, coverFile) {
  const uploaded = [];
  try {
    const coverImageId = await uploadImage(coverFile);
    uploaded.push(coverImageId);

    const galleryImageIds = [];
    for (const item of galleryItems) {
      if (item.kind !== 'new') continue;
      const id = await uploadImage(item.file);
      uploaded.push(id);
      galleryImageIds.push(id);
    }

    projectSaveBtn.textContent = 'Enregistrement…';

    await tablesDB.createRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_PROJECTS_TABLE_ID,
      rowId: ID.unique(),
      data: { ...data, coverImageId, galleryImageIds, position: nextProjectPosition() },
    });
  } catch (err) {
    // Aucune ligne partielle : on supprime tout ce qui vient d'être envoyé.
    for (const fileId of new Set(uploaded)) {
      await tryDeleteFile(fileId, 'orphelin (création de réalisation annulée)');
    }
    throw err;
  }
}

// Retourne true si le nettoyage des anciens fichiers a partiellement échoué.
async function updateProject(project, data, coverFile) {
  const newUploads = [];
  let coverImageId = project.coverImageId;
  let galleryImageIds;

  try {
    if (coverFile) {
      coverImageId = await uploadImage(coverFile);
      newUploads.push(coverImageId);
    }

    galleryImageIds = [];
    for (const item of galleryItems) {
      if (item.kind === 'existing') {
        galleryImageIds.push(item.fileId);
      } else {
        const id = await uploadImage(item.file);
        newUploads.push(id);
        galleryImageIds.push(id);
      }
    }

    projectSaveBtn.textContent = 'Enregistrement…';

    await tablesDB.updateRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_PROJECTS_TABLE_ID,
      rowId: project.$id,
      data: { ...data, coverImageId, galleryImageIds },
    });
  } catch (err) {
    // Mise à jour échouée : les nouveaux fichiers sont supprimés,
    // les anciens restent intacts.
    for (const fileId of new Set(newUploads)) {
      await tryDeleteFile(fileId, 'nouveau (mise à jour de réalisation annulée)');
    }
    throw err;
  }

  // Suppression des anciens fichiers retirés, uniquement après la réussite de
  // la mise à jour. Le Set "keep" protège la cover et toute image encore
  // utilisée (y compris une cover présente aussi dans la galerie).
  const keep = new Set([coverImageId, ...galleryImageIds]);
  const candidates = new Set();
  if (project.coverImageId && !keep.has(project.coverImageId)) {
    candidates.add(project.coverImageId);
  }
  (project.galleryImageIds || []).forEach((fileId) => {
    if (fileId && !keep.has(fileId)) candidates.add(fileId);
  });

  let cleanupFailed = false;
  for (const fileId of candidates) {
    const deleted = await tryDeleteFile(fileId, 'ancien (réalisation mise à jour)');
    if (!deleted) cleanupFailed = true;
  }
  return cleanupFailed;
}

/* ---------- Actions sur la liste (déléguées) ---------- */

projectsList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn || projectsListBusy || !isAuthenticated) return;

  const li = btn.closest('li[data-id]');
  const project = projects.find((p) => p.$id === li?.dataset.id);
  if (!project) return;

  const action = btn.dataset.action;

  if (action === 'edit') {
    openProjectForm(project);
    projectForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (action === 'toggle') return toggleProject(project);
  if (action === 'up') return moveProject(project, -1);
  if (action === 'down') return moveProject(project, 1);
  if (action === 'delete') return deleteProject(project);
});

async function toggleProject(project) {
  clearProjectsMessage();
  setProjectsListBusy(true);
  try {
    await tablesDB.updateRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_PROJECTS_TABLE_ID,
      rowId: project.$id,
      data: { isActive: !project.isActive },
    });
    showProjectsMessage('success', project.isActive ? 'Réalisation masquée sur le site.' : 'Réalisation affichée sur le site.');
    await loadProjects();
  } catch (err) {
    console.error('[admin] changement de visibilité impossible :', err);
    if (isSessionError(err)) return handleSessionExpired();
    showProjectsMessage('error', friendlyOperationError(err, 'Le changement de visibilité a échoué. Réessaie.'));
  } finally {
    setProjectsListBusy(false);
  }
}

async function moveProject(project, direction) {
  const index = projects.indexOf(project);
  const other = projects[index + direction];
  if (!other) return;

  clearProjectsMessage();
  setProjectsListBusy(true);

  // Échange des positions ; si elles sont identiques (valeur par défaut 0),
  // on retombe sur les index actuels pour les distinguer.
  let posA = Number(project.position) || 0;
  let posB = Number(other.position) || 0;
  if (posA === posB) {
    posA = index;
    posB = index + direction;
  }

  try {
    await tablesDB.updateRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_PROJECTS_TABLE_ID,
      rowId: project.$id,
      data: { position: posB },
    });
    try {
      await tablesDB.updateRow({
        databaseId: APPWRITE_DATABASE_ID,
        tableId: APPWRITE_PROJECTS_TABLE_ID,
        rowId: other.$id,
        data: { position: posA },
      });
    } catch (err) {
      console.error('[admin] échange de positions incomplet :', err);
      try {
        await tablesDB.updateRow({
          databaseId: APPWRITE_DATABASE_ID,
          tableId: APPWRITE_PROJECTS_TABLE_ID,
          rowId: project.$id,
          data: { position: posA },
        });
      } catch (revertErr) {
        console.error('[admin] retour arrière impossible :', revertErr);
      }
      throw err;
    }
    await loadProjects();
  } catch (err) {
    if (isSessionError(err)) return handleSessionExpired();
    showProjectsMessage('error', friendlyOperationError(err, 'Le déplacement a échoué. L’ordre n’a pas été modifié.'));
    await loadProjects();
  } finally {
    setProjectsListBusy(false);
  }
}

async function deleteProject(project) {
  const confirmed = window.confirm(
    `Supprimer définitivement la réalisation « ${project.title} » ?\n`
    + 'La réalisation ET toutes ses images seront supprimées. Cette action est irréversible.'
  );
  if (!confirmed) return;

  clearProjectsMessage();
  setProjectsListBusy(true);

  try {
    await tablesDB.deleteRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_PROJECTS_TABLE_ID,
      rowId: project.$id,
    });

    // Fichiers à supprimer : cover + galerie, sans doublons.
    const fileIds = new Set(
      [project.coverImageId, ...(project.galleryImageIds || [])].filter(Boolean)
    );
    let filesFailed = 0;
    for (const fileId of fileIds) {
      const deleted = await tryDeleteFile(fileId, 'de la réalisation supprimée');
      if (!deleted) filesFailed++;
    }

    if (filesFailed > 0) {
      showProjectsMessage('error',
        `Réalisation supprimée, mais ${filesFailed} fichier(s) n’ont pas pu être supprimés du stockage.`);
    } else {
      showProjectsMessage('success', 'Réalisation et images supprimées.');
    }
    await loadProjects();
  } catch (err) {
    console.error('[admin] suppression de la réalisation impossible :', err);
    if (isSessionError(err)) return handleSessionExpired();
    showProjectsMessage('error', friendlyOperationError(err, 'La suppression a échoué. Réessaie.'));
  } finally {
    setProjectsListBusy(false);
  }
}

/* ---------- Démarrage ---------- */

checkSession();
