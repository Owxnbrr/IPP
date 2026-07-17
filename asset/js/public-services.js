// asset/js/public-services.js
// Section « Nos Services » de la page d'accueil.
//
// Flux :
//   1. les 5 cartes statiques (fallback) sont présentes dès le chargement ;
//   2. ce module charge les services actifs depuis Appwrite (lecture publique) ;
//   3. s'il y a au moins un service actif, les cartes statiques du
//      `.services-slider` sont remplacées en une seule passe par les cartes
//      dynamiques (mêmes classes CSS, même markup, lien identique) ;
//   4. en cas d'échec ou de table vide, les cartes statiques restent affichées
//      (erreur en console uniquement, rien pour le visiteur).
//
// Seules les cartes du slider « Nos Services » sont remplacées : le titre de
// section et la section « Nos services digitaux » (.services-grid) ne sont
// jamais touchés.

import { tablesDB, storage, Query, logNetworkDiagnostic } from './appwrite-client.js';

import {
  APPWRITE_DATABASE_ID,
  APPWRITE_SERVICES_TABLE_ID,
  APPWRITE_BUCKET_ID,
} from './appwrite-config.js';

// Lien réel des cartes statiques actuelles (identique sur les 5).
const CARD_LINK = 'imprimerie.html#Do';

function imageViewUrl(fileId) {
  return storage.getFileView({
    bucketId: APPWRITE_BUCKET_ID,
    fileId,
  }).toString();
}

function buildCard(row) {
  const card = document.createElement('a');
  card.href = CARD_LINK;
  card.className = 'service-card';

  const img = document.createElement('img');
  img.className = 'service-img';
  img.src = imageViewUrl(row.imageId);
  img.alt = row.altText || row.title;
  img.loading = 'lazy';
  img.decoding = 'async';
  card.appendChild(img);

  const title = document.createElement('h3');
  title.className = 'service-title';
  title.textContent = row.title;
  card.appendChild(title);

  const items = (row.items || []).filter(Boolean);
  if (items.length) {
    const list = document.createElement('ul');
    list.className = 'service-list';
    items.forEach((item) => {
      const li = document.createElement('li');
      const p = document.createElement('p');
      p.textContent = item;
      li.appendChild(p);
      list.appendChild(li);
    });
    card.appendChild(list);
  }

  return card;
}

function renderServices(rows) {
  const staticCards = Array.from(document.querySelectorAll('.services-slider .service-card'));
  if (!staticCards.length) return;

  const parent = staticCards[0].parentNode;
  const fragment = document.createDocumentFragment();
  rows.forEach((row) => fragment.appendChild(buildCard(row)));

  // Construction hors DOM puis remplacement en une seule passe.
  parent.insertBefore(fragment, staticCards[0]);
  staticCards.forEach((card) => card.remove());
}

async function loadPublicServices() {
  if (!document.querySelector('.services-slider')) return;

  try {
    const result = await tablesDB.listRows({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_SERVICES_TABLE_ID,
      queries: [
        Query.equal('isActive', true),
        Query.orderAsc('position'),
        Query.limit(100),
      ],
    });

    if (result.rows.length > 0) {
      renderServices(result.rows);
    }
    // 0 service actif : les cartes statiques restent affichées.
  } catch (err) {
    console.error('[services] Chargement Appwrite impossible, cartes statiques conservées :', err);
    logNetworkDiagnostic(err);
  }
}

loadPublicServices();
