// asset/js/public-projects.js
// Réalisations publiques de la page d'accueil.
//
// Flux :
//   1. le HTML statique (5 cartes) est présent dès le chargement (fallback) ;
//   2. ce module charge les réalisations actives depuis Appwrite (lecture
//      publique, aucune authentification) ;
//   3. s'il y a au moins une réalisation active, les cartes statiques sont
//      remplacées en une seule passe par les cartes dynamiques (construites
//      hors DOM), sans toucher à l'élément #lightbox partagé ;
//   4. la galerie et la lightbox fonctionnent via les fonctions globales et
//      la délégation d'événements de script_index.js — aucune ré-initialisation
//      n'est nécessaire, l'événement `ipp:projects-rendered` est émis pour info.
//
// En cas d'échec Appwrite ou de table vide : les cartes statiques restent
// affichées telles quelles, erreur en console uniquement.

import { tablesDB, storage, Query, logNetworkDiagnostic } from './appwrite-client.js';

import {
  APPWRITE_DATABASE_ID,
  APPWRITE_PROJECTS_TABLE_ID,
  APPWRITE_BUCKET_ID,
} from './appwrite-config.js';

// Lien CTA réel des cartes actuelles (identique sur les 5 cartes statiques).
const CTA_URL = 'tarifs.html#devis';
const CTA_LABEL = 'Demander un devis';

function imageViewUrl(fileId) {
  return storage.getFileView({
    bucketId: APPWRITE_BUCKET_ID,
    fileId,
  }).toString();
}

// Images d'une réalisation : cover d'abord, puis la galerie, sans doublons.
function projectImageIds(row) {
  const ids = [row.coverImageId, ...(row.galleryImageIds || [])].filter(Boolean);
  return [...new Set(ids)];
}

function buildCard(row) {
  const imageIds = projectImageIds(row);
  const several = imageIds.length > 1;

  const card = document.createElement('div');
  card.className = 'service-card1';
  card.dataset.id = row.$id;

  /* --- Zone image + mini-galerie (markup identique aux cartes statiques) --- */
  const container = document.createElement('div');
  container.className = 'service-image-container';

  imageIds.forEach((fileId, index) => {
    const img = document.createElement('img');
    img.className = 'service-image1' + (index === 0 ? ' active' : '');
    img.dataset.index = String(index);
    img.src = imageViewUrl(fileId);
    img.alt = index === 0
      ? (row.coverAlt || row.title)
      : `${row.title} — image ${index + 1}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    container.appendChild(img);
  });

  if (several) {
    // Flèches et points : mêmes attributs onclick que le markup statique,
    // pour réutiliser exactement les fonctions globales de script_index.js.
    const arrows = document.createElement('div');
    arrows.className = 'image-arrows';
    const prev = document.createElement('div');
    prev.className = 'image-arrow prev';
    prev.setAttribute('onclick', 'prevImage(this)');
    prev.innerHTML = '&lt;';
    const next = document.createElement('div');
    next.className = 'image-arrow next';
    next.setAttribute('onclick', 'nextImage(this)');
    next.innerHTML = '&gt;';
    arrows.appendChild(prev);
    arrows.appendChild(next);
    container.appendChild(arrows);

    const nav = document.createElement('div');
    nav.className = 'image-nav';
    imageIds.forEach((_, index) => {
      const dot = document.createElement('div');
      dot.className = 'image-dot' + (index === 0 ? ' active' : '');
      dot.setAttribute('onclick', `showImage(this.parentNode.parentNode, ${index})`);
      nav.appendChild(dot);
    });
    container.appendChild(nav);
  }

  /* --- Contenu texte --- */
  const content = document.createElement('div');
  content.className = 'service-content1';

  const title = document.createElement('h3');
  title.className = 'service-title1';
  title.textContent = row.title;
  content.appendChild(title);

  if (row.description) {
    const desc = document.createElement('p');
    desc.className = 'service-description1';
    desc.textContent = row.description;
    content.appendChild(desc);
  }

  const footer = document.createElement('div');
  footer.className = 'service-footer1';
  const cta = document.createElement('a');
  cta.href = CTA_URL;
  cta.className = 'cta-btn';
  cta.textContent = CTA_LABEL;
  footer.appendChild(cta);
  content.appendChild(footer);

  card.appendChild(container);
  card.appendChild(content);
  return card;
}

// Remplacement en une seule passe : les nouvelles cartes sont insérées à la
// place de la première carte statique, puis les statiques sont retirées.
// L'élément #lightbox (partagé) n'est jamais touché.
function renderProjects(rows) {
  const staticCards = Array.from(document.querySelectorAll('#customInsertZone .service-card1'));
  if (!staticCards.length) return;

  const parent = staticCards[0].parentNode;
  const fragment = document.createDocumentFragment();
  rows.forEach((row) => fragment.appendChild(buildCard(row)));

  parent.insertBefore(fragment, staticCards[0]);
  staticCards.forEach((card) => card.remove());

  document.dispatchEvent(new CustomEvent('ipp:projects-rendered', {
    detail: { count: rows.length },
  }));
}

async function loadPublicProjects() {
  if (!document.getElementById('customInsertZone')) return;

  try {
    const result = await tablesDB.listRows({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_PROJECTS_TABLE_ID,
      queries: [
        Query.equal('isActive', true),
        Query.orderAsc('position'),
        Query.limit(100),
      ],
    });

    if (result.rows.length > 0) {
      renderProjects(result.rows);
    }
    // 0 réalisation active : les cartes statiques restent affichées.
  } catch (err) {
    console.error('[réalisations] Chargement Appwrite impossible, cartes statiques conservées :', err);
    logNetworkDiagnostic(err);
  }
}

loadPublicProjects();
