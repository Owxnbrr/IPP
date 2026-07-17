// asset/js/services-migration.js
// Import unique des 5 cartes statiques de la section « Nos Services » de
// asset/index.html vers Appwrite. Les données ci-dessous sont le relevé exact
// du HTML réel (`.services-slider .service-card`) : titres, chemins d'images,
// textes alternatifs, prestations dans leur ordre, position d'apparition.
// Le lien identique des cartes (imprimerie.html#Do) reste codé dans le rendu
// public, la table services n'ayant pas de champ lien.
//
// IDs déterministes (valides Appwrite : lettres/chiffres/tirets, ≤ 36 car.) :
// l'import est idempotent, un F5 ne crée jamais de doublon. Le NOM du fichier
// envoyé est normalisé avec l'extension correspondant au type MIME réel
// (ex. legacy-service-1-cover.png).

import {
  tablesDB,
  storage,
  AppwriteException,
} from './appwrite-client.js';

import {
  APPWRITE_DATABASE_ID,
  APPWRITE_SERVICES_TABLE_ID,
  APPWRITE_BUCKET_ID,
} from './appwrite-config.js';

// Relevé exact de asset/index.html (ordre d'apparition dans la page).
export const LEGACY_SERVICES = [
  {
    id: 'legacy-service-1',
    fileId: 'legacy-service-1-cover',
    title: 'Création Graphique',
    path: 'img/02.png',
    altText: 'Service 2',
    items: ['Logo', 'Identité visuelle', 'Catalogues'],
    position: 0,
  },
  {
    id: 'legacy-service-2',
    fileId: 'legacy-service-2-cover',
    title: 'Impression',
    path: 'img/IMG_1682.png',
    altText: 'Service 3',
    items: ['Flyers', 'Affiches', 'Cartes de visite'],
    position: 1,
  },
  {
    id: 'legacy-service-3',
    fileId: 'legacy-service-3-cover',
    title: 'Signalétique & Evénementiel',
    path: 'img/95f1dc0e6fd46c0a927da82141e1.jpeg',
    altText: 'Service 1',
    items: ['Bâches promotionnelles', 'Panneaux extérieurs', 'Autocollants personnalisées'],
    position: 2,
  },
  {
    id: 'legacy-service-4',
    fileId: 'legacy-service-4-cover',
    title: 'Goodies & Textiles',
    path: 'img/4.jpeg',
    altText: 'Service 3',
    items: ['T-shirt personnalisé', 'EcoCup', 'Stylos'],
    position: 3,
  },
  {
    id: 'legacy-service-5',
    fileId: 'legacy-service-5-cover',
    title: 'Particuliers',
    path: 'img/des-cartes-d-invitation-de-mariage-d-epoque-elegantes.jpg',
    altText: 'Service 3',
    items: ['Invitations', 'Faire-part de mariage', 'Menu'],
    position: 4,
  },
];

const MIME_BY_EXTENSION = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
};

const EXTENSION_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

function isNotFound(err) {
  return err instanceof AppwriteException && err.code === 404;
}

function isAlreadyExists(err) {
  return err instanceof AppwriteException && err.code === 409;
}

async function rowExists(rowId) {
  try {
    await tablesDB.getRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_SERVICES_TABLE_ID,
      rowId,
    });
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

async function fileExists(fileId) {
  try {
    await storage.getFile({ bucketId: APPWRITE_BUCKET_ID, fileId });
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

// Récupère l'image statique et la convertit en File dont le nom et
// l'extension sont normalisés d'après le type MIME réel de la réponse.
async function fetchStaticImageAsFile(service) {
  const response = await fetch('./' + encodeURI(service.path));
  if (!response.ok) {
    throw new Error(`Image statique introuvable (${response.status}) : ${service.path}`);
  }
  const blob = await response.blob();
  const pathExtension = service.path.split('.').pop().toLowerCase();
  const mimeType = blob.type && blob.type.startsWith('image/')
    ? blob.type
    : (MIME_BY_EXTENSION[pathExtension] || 'application/octet-stream');
  const extension = EXTENSION_BY_MIME[mimeType] || pathExtension;
  return new File([blob], `${service.fileId}.${extension}`, { type: mimeType });
}

async function ensureFile(service) {
  if (await fileExists(service.fileId)) return false;
  const file = await fetchStaticImageAsFile(service);
  try {
    await storage.createFile({
      bucketId: APPWRITE_BUCKET_ID,
      fileId: service.fileId,
      file,
    });
    return true;
  } catch (err) {
    if (isAlreadyExists(err)) return false;
    throw err;
  }
}

async function importOneService(service) {
  if (await rowExists(service.id)) {
    return 'skipped';
  }

  const fileCreatedNow = await ensureFile(service);

  try {
    await tablesDB.createRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_SERVICES_TABLE_ID,
      rowId: service.id,
      data: {
        title: service.title,
        imageId: service.fileId,
        altText: service.altText,
        items: service.items,
        position: service.position,
        isActive: true,
      },
    });
    return 'imported';
  } catch (err) {
    if (isAlreadyExists(err)) return 'skipped';
    if (fileCreatedNow) {
      try {
        await storage.deleteFile({ bucketId: APPWRITE_BUCKET_ID, fileId: service.fileId });
      } catch (cleanupErr) {
        console.error('[migration services] nettoyage impossible :', cleanupErr);
      }
    }
    throw err;
  }
}

/**
 * Importe les services statiques manquants vers Appwrite.
 * Retourne { total, imported, skipped, failures } ; une erreur de session
 * (401) interrompt l'import et est propagée à l'appelant.
 */
export async function migrateStaticServices(onProgress) {
  const result = {
    total: LEGACY_SERVICES.length,
    imported: 0,
    skipped: 0,
    failures: [],
  };

  for (let i = 0; i < LEGACY_SERVICES.length; i++) {
    const service = LEGACY_SERVICES[i];
    if (typeof onProgress === 'function') {
      onProgress(i + 1, LEGACY_SERVICES.length);
    }
    try {
      const outcome = await importOneService(service);
      if (outcome === 'imported') result.imported++;
      else result.skipped++;
    } catch (err) {
      console.error(`[migration services] import impossible pour « ${service.title} » :`, err);
      if (err instanceof AppwriteException && err.code === 401) {
        throw err;
      }
      result.failures.push({ service, error: err });
    }
  }

  return result;
}
