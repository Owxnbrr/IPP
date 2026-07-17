// asset/js/public-carousel.js
// Carrousel public de la page d'accueil : charge les slides actives depuis
// Appwrite (lecture publique, aucune authentification) et remplace le
// carrousel statique. En cas d'échec ou de table vide, le carrousel statique
// codé en dur reste affiché tel quel (fallback), sans message pour le visiteur.
//
// Dans tous les cas, ce module termine en appelant window.initCarousel()
// (défini par script_index.js) : le carrousel n'est jamais initialisé avant
// que ses slides définitives soient dans le DOM.

import { tablesDB, storage, Query, logNetworkDiagnostic } from './appwrite-client.js';

import {
  APPWRITE_DATABASE_ID,
  APPWRITE_CAROUSEL_TABLE_ID,
  APPWRITE_BUCKET_ID,
} from './appwrite-config.js';

const SLIDES_LIMIT = 100;

function imageViewUrl(fileId) {
  return storage.getFileView({
    bucketId: APPWRITE_BUCKET_ID,
    fileId,
  }).toString();
}

// Mêmes règles que l'administration : http(s), page interne, ancre ou page
// relative. Tout autre protocole (javascript:, data:, …) est ignoré.
function safeLinkUrl(raw) {
  const value = (raw || '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/') || value.startsWith('#')) return value;
  if (!value.includes(':')) return value;
  return null;
}

function buildSlide(row, index) {
  const slide = document.createElement('div');
  slide.className = 'carousel-slide' + (index === 0 ? ' active' : '');

  const img = document.createElement('img');
  img.className = 'carousel-image';
  img.src = imageViewUrl(row.imageId);
  img.alt = row.altText || row.title || 'Image du carrousel IPP';
  img.loading = index === 0 ? 'eager' : 'lazy';
  img.decoding = 'async';

  const link = safeLinkUrl(row.linkUrl);
  if (link) {
    const a = document.createElement('a');
    a.href = link;
    a.className = 'carousel-link';
    if (/^https?:\/\//i.test(link)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    a.appendChild(img);
    slide.appendChild(a);
  } else {
    slide.appendChild(img);
  }

  // Titre / sous-titre optionnels (aucune slide actuelle n'en a : rien ne
  // change visuellement tant qu'ils ne sont pas renseignés dans l'admin).
  if (row.title || row.subtitle) {
    const caption = document.createElement('div');
    caption.className = 'carousel-caption';
    if (row.title) {
      const h2 = document.createElement('h2');
      h2.textContent = row.title;
      caption.appendChild(h2);
    }
    if (row.subtitle) {
      const p = document.createElement('p');
      p.textContent = row.subtitle;
      caption.appendChild(p);
    }
    slide.appendChild(caption);
  }

  return slide;
}

function buildIndicator(index) {
  const dot = document.createElement('div');
  dot.className = 'indicator' + (index === 0 ? ' active' : '');
  dot.setAttribute('role', 'button');
  dot.setAttribute('tabindex', '0');
  dot.setAttribute('aria-label', `Aller à l'image ${index + 1}`);
  const go = () => {
    if (typeof window.currentSlide === 'function') window.currentSlide(index + 1);
  };
  dot.addEventListener('click', go);
  dot.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      go();
    }
  });
  return dot;
}

// Construit tout hors du DOM puis remplace en une seule passe : pas de zone
// vide ni de slides partiellement rendues.
function renderCarousel(container, rows) {
  const track = document.createElement('div');
  track.className = 'carousel-track';
  rows.forEach((row, index) => track.appendChild(buildSlide(row, index)));

  // Badge Google : un seul exemplaire, en surimpression du carrousel entier
  // (le markup exact est repris du badge statique existant).
  const existingBadge = container.querySelector('.google-rating');
  if (existingBadge) {
    track.appendChild(existingBadge.cloneNode(true));
  }

  const indicators = rows.map((_, index) => buildIndicator(index));

  const indicatorsWrap = container.querySelector('.carousel-indicators');
  container.querySelectorAll('.carousel-slide').forEach((el) => el.remove());
  if (indicatorsWrap) {
    indicatorsWrap.replaceChildren(...indicators);
    container.insertBefore(track, indicatorsWrap);
  } else {
    container.prepend(track);
  }
}

function finishCarouselInit() {
  if (typeof window.initCarousel === 'function') {
    window.initCarousel();
  }
}

async function loadPublicCarousel() {
  const container = document.querySelector('.carousel-container');
  if (!container) return;

  try {
    const result = await tablesDB.listRows({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_CAROUSEL_TABLE_ID,
      queries: [
        Query.equal('isActive', true),
        Query.orderAsc('position'),
        Query.limit(SLIDES_LIMIT),
      ],
    });

    if (result.rows.length > 0) {
      renderCarousel(container, result.rows);
    }
    // 0 ligne active : on conserve le carrousel statique tel quel.
  } catch (err) {
    // Fallback : le carrousel statique reste affiché, erreur en console only.
    console.error('[carousel] Chargement Appwrite impossible, carrousel statique conservé :', err);
    logNetworkDiagnostic(err);
  } finally {
    finishCarouselInit();
  }
}

loadPublicCarousel();
