// asset/js/carousel-migration.js
// Import unique ("migration") du carrousel statique de asset/index.html vers
// Appwrite. Les données ci-dessous reprennent exactement les 5 slides écrites
// en dur dans index.html (chemins, alt, liens, ordre). Les identifiants
// déterministes "legacy-carousel-slide-N" (valides pour Appwrite : lettres,
// chiffres, tirets, ≤ 36 caractères) rendent l'import idempotent : un F5 ou
// une reconnexion ne crée jamais de doublon.

import {
  tablesDB,
  storage,
  AppwriteException,
} from './appwrite-client.js';

import {
  APPWRITE_DATABASE_ID,
  APPWRITE_CAROUSEL_TABLE_ID,
  APPWRITE_BUCKET_ID,
} from './appwrite-config.js';

// Relevé exact du carrousel statique de asset/index.html.
export const LEGACY_SLIDES = [
  {
    id: 'legacy-carousel-slide-1',
    path: 'img/image flyers.png',
    altText: "Image d'imprimerie 1",
    linkUrl: null,
    position: 0,
  },
  {
    id: 'legacy-carousel-slide-2',
    path: 'img/03.png',
    altText: "Image d'imprimerie 2",
    linkUrl: null,
    position: 1,
  },
  {
    id: 'legacy-carousel-slide-3',
    path: 'img/img3.png',
    altText: "Image d'imprimerie 3",
    linkUrl: null,
    position: 2,
  },
  {
    id: 'legacy-carousel-slide-4',
    path: 'img/04.png',
    altText: "Image d'imprimerie 4",
    linkUrl: 'https://ippcom-goodies.netlify.app/',
    position: 3,
  },
  {
    id: 'legacy-carousel-slide-5',
    path: 'img/05.png',
    altText: "Image d'imprimerie 5",
    linkUrl: '#poodcast',
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
      tableId: APPWRITE_CAROUSEL_TABLE_ID,
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

// Récupère l'image statique du site et la convertit en File avec son vrai
// type MIME (celui de la réponse, sinon déduit de l'extension).
async function fetchStaticImageAsFile(slide) {
  const response = await fetch('./' + encodeURI(slide.path));
  if (!response.ok) {
    throw new Error(`Image statique introuvable (${response.status}) : ${slide.path}`);
  }
  const blob = await response.blob();
  const fileName = slide.path.split('/').pop();
  const extension = fileName.split('.').pop().toLowerCase();
  const mimeType = blob.type && blob.type.startsWith('image/')
    ? blob.type
    : (MIME_BY_EXTENSION[extension] || 'application/octet-stream');
  return new File([blob], fileName, { type: mimeType });
}

async function importOneSlide(slide) {
  // 1. La ligne existe déjà → rien à faire.
  if (await rowExists(slide.id)) {
    return 'skipped';
  }

  // 2. Fichier : réutilisé s'il existe déjà (reprise après un échec partiel),
  //    sinon récupéré depuis le site puis envoyé dans le bucket.
  let fileCreatedNow = false;
  if (!(await fileExists(slide.id))) {
    const file = await fetchStaticImageAsFile(slide);
    try {
      await storage.createFile({
        bucketId: APPWRITE_BUCKET_ID,
        fileId: slide.id,
        file,
      });
      fileCreatedNow = true;
    } catch (err) {
      if (!isAlreadyExists(err)) throw err; // créé entre-temps : on le réutilise
    }
  }

  // 3. Création de la ligne avec le même identifiant déterministe.
  try {
    await tablesDB.createRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_CAROUSEL_TABLE_ID,
      rowId: slide.id,
      data: {
        title: null,
        subtitle: null,
        imageId: slide.id,
        altText: slide.altText,
        linkUrl: slide.linkUrl,
        position: slide.position,
        isActive: true,
      },
    });
    return 'imported';
  } catch (err) {
    if (isAlreadyExists(err)) return 'skipped'; // créée en parallèle (double onglet)
    // Ligne impossible à créer : on ne laisse pas d'orphelin qu'on vient d'envoyer.
    if (fileCreatedNow) {
      try {
        await storage.deleteFile({ bucketId: APPWRITE_BUCKET_ID, fileId: slide.id });
      } catch (cleanupErr) {
        console.error('[migration] nettoyage du fichier impossible :', cleanupErr);
      }
    }
    throw err;
  }
}

/**
 * Importe les slides statiques manquantes vers Appwrite.
 * Retourne { total, imported, skipped, failures } où failures liste
 * { slide, error } pour chaque slide en échec. Une erreur de session (401)
 * interrompt l'import et est propagée à l'appelant.
 */
export async function migrateStaticCarousel(onProgress) {
  const result = {
    total: LEGACY_SLIDES.length,
    imported: 0,
    skipped: 0,
    failures: [],
  };

  for (let i = 0; i < LEGACY_SLIDES.length; i++) {
    const slide = LEGACY_SLIDES[i];
    if (typeof onProgress === 'function') {
      onProgress(i + 1, LEGACY_SLIDES.length);
    }
    try {
      const outcome = await importOneSlide(slide);
      if (outcome === 'imported') result.imported++;
      else result.skipped++;
    } catch (err) {
      console.error(`[migration] import impossible pour ${slide.path} :`, err);
      if (err instanceof AppwriteException && err.code === 401) {
        throw err; // session expirée : inutile de continuer
      }
      result.failures.push({ slide, error: err });
    }
  }

  return result;
}
