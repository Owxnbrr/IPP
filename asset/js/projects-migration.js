// asset/js/projects-migration.js
// Import unique des 5 réalisations statiques de asset/index.html (section
// #customInsertZone) vers Appwrite. Les données ci-dessous sont le relevé
// exact du HTML réel : ordre d'apparition, images (la première devient la
// cover, les suivantes la galerie), textes alternatifs, titres, descriptions.
// Le HTML ne contient aucune catégorie → category reste null.
// Le CTA « Demander un devis » (tarifs.html#devis) est identique sur toutes
// les cartes : il reste codé dans le rendu public, pas dans les données.
//
// IDs déterministes (lettres/chiffres/tirets, ≤ 36 caractères, valides pour
// Appwrite) : l'import est idempotent, un F5 ne crée jamais de doublon.

import {
  tablesDB,
  storage,
  AppwriteException,
} from './appwrite-client.js';

import {
  APPWRITE_DATABASE_ID,
  APPWRITE_PROJECTS_TABLE_ID,
  APPWRITE_BUCKET_ID,
} from './appwrite-config.js';

// Relevé exact de asset/index.html (ordre d'apparition dans la page).
export const LEGACY_PROJECTS = [
  {
    id: 'legacy-project-1', // data-id="service1"
    title: "Pose d'adhésif micro-perforé pour vitrine commerciale",
    description: "Pose d'adhésif micro-perforé sur la vitrine Krys, assurant visibilité extérieure, transparence intérieure et lumière naturelle optimisée.",
    category: null,
    position: 0,
    images: [
      { fileId: 'legacy-project-1-cover', path: 'img/image1.jpeg', alt: 'carte de visite 1' },
      { fileId: 'legacy-project-1-gallery-1', path: 'img/guess.jpg', alt: 'carte de visite 2' },
    ],
  },
  {
    id: 'legacy-project-2', // data-id="service2"
    title: 'Signalétique adhésive extérieure pour McDonald’s',
    description: 'Conception, impression et pose d’une signalétique adhésive pour le McDrive, claire et visible, aux couleurs de la marque.',
    category: null,
    position: 1,
    images: [
      { fileId: 'legacy-project-2-cover', path: 'img/mcdo.jpg', alt: 'autre service 1' },
      { fileId: 'legacy-project-2-gallery-1', path: 'img/mcdo1.jpeg', alt: 'autre service 2' },
      { fileId: 'legacy-project-2-gallery-2', path: 'img/macdo2.jpeg', alt: 'autre service 3' },
      { fileId: 'legacy-project-2-gallery-3', path: 'img/mcdo3.jpeg', alt: 'autre service 4' },
    ],
  },
  {
    id: 'legacy-project-3', // data-id="service3"
    title: 'Signalétique extérieure du Pôle Administratif Jean Jaurès',
    description: 'Signalétique extérieure intégrant une citation de Jean Jaurès pour inspirer visiteurs et agents. Un habillage moderne qui valorise l’image et l’accueil du pôle administratif.',
    category: null,
    position: 2,
    images: [
      { fileId: 'legacy-project-3-cover', path: 'img/pole1.jpg', alt: 'autre service 1' },
      { fileId: 'legacy-project-3-gallery-1', path: 'img/pole2.jpg', alt: 'autre service 2' },
      { fileId: 'legacy-project-3-gallery-2', path: 'img/pole3.jpg', alt: 'autre service 3' },
    ],
  },
  {
    id: 'legacy-project-4', // data-id="service5" (4e carte dans l'ordre du HTML)
    title: 'Pose d’adhésif sur véhicule avant livraison',
    description: 'Pose d’adhésif personnalisé sur véhicule utilitaire, assurant une visibilité optimale de l’identité visuelle, une finition professionnelle et une protection durable de la carrosserie avant livraison au client.',
    category: null,
    position: 3,
    images: [
      { fileId: 'legacy-project-4-cover', path: 'img/voit.jpg', alt: 'carte de visite 1' },
      { fileId: 'legacy-project-4-gallery-1', path: 'img/voit2.jpg', alt: 'carte de visite 2' },
    ],
  },
  {
    id: 'legacy-project-5', // data-id="service4" (5e carte, une seule image)
    title: 'Tote bag personnalisé « À Montdidier on a la patate ! »',
    description: 'Tote bag imaginé pour mettre en avant l’énergie et la convivialité de Montdidier. Un support original qui renforce le sentiment d’appartenance à la ville.',
    category: null,
    position: 4,
    images: [
      { fileId: 'legacy-project-5-cover', path: 'img/patate.jpg', alt: 'autre service 1' },
    ],
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
      tableId: APPWRITE_PROJECTS_TABLE_ID,
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

async function fetchStaticImageAsFile(image) {
  const response = await fetch('./' + encodeURI(image.path));
  if (!response.ok) {
    throw new Error(`Image statique introuvable (${response.status}) : ${image.path}`);
  }
  const blob = await response.blob();
  const fileName = image.path.split('/').pop();
  const extension = fileName.split('.').pop().toLowerCase();
  const mimeType = blob.type && blob.type.startsWith('image/')
    ? blob.type
    : (MIME_BY_EXTENSION[extension] || 'application/octet-stream');
  return new File([blob], fileName, { type: mimeType });
}

// Envoie le fichier s'il n'existe pas déjà. Retourne true si le fichier a été
// créé pendant cet appel (utile pour le nettoyage en cas d'échec de la ligne).
async function ensureFile(image) {
  if (await fileExists(image.fileId)) return false;
  const file = await fetchStaticImageAsFile(image);
  try {
    await storage.createFile({
      bucketId: APPWRITE_BUCKET_ID,
      fileId: image.fileId,
      file,
    });
    return true;
  } catch (err) {
    if (isAlreadyExists(err)) return false; // créé entre-temps : réutilisé
    throw err;
  }
}

async function importOneProject(project) {
  if (await rowExists(project.id)) {
    return 'skipped';
  }

  // Fichiers : cover puis galerie, dans l'ordre du HTML.
  const createdThisRun = [];
  for (const image of project.images) {
    if (await ensureFile(image)) {
      createdThisRun.push(image.fileId);
    }
  }

  const [cover, ...gallery] = project.images;

  try {
    await tablesDB.createRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_PROJECTS_TABLE_ID,
      rowId: project.id,
      data: {
        title: project.title,
        description: project.description,
        category: project.category,
        coverImageId: cover.fileId,
        coverAlt: cover.alt,
        galleryImageIds: gallery.map((img) => img.fileId),
        position: project.position,
        isActive: true,
      },
    });
    return 'imported';
  } catch (err) {
    if (isAlreadyExists(err)) return 'skipped'; // créée en parallèle
    // Ligne impossible : on ne garde pas les fichiers envoyés pendant cette passe.
    for (const fileId of new Set(createdThisRun)) {
      try {
        await storage.deleteFile({ bucketId: APPWRITE_BUCKET_ID, fileId });
      } catch (cleanupErr) {
        console.error('[migration projets] nettoyage impossible :', cleanupErr);
      }
    }
    throw err;
  }
}

/**
 * Importe les réalisations statiques manquantes vers Appwrite.
 * Retourne { total, imported, skipped, failures } ; une erreur de session
 * (401) interrompt l'import et est propagée à l'appelant.
 */
export async function migrateStaticProjects(onProgress) {
  const result = {
    total: LEGACY_PROJECTS.length,
    imported: 0,
    skipped: 0,
    failures: [],
  };

  for (let i = 0; i < LEGACY_PROJECTS.length; i++) {
    const project = LEGACY_PROJECTS[i];
    if (typeof onProgress === 'function') {
      onProgress(i + 1, LEGACY_PROJECTS.length);
    }
    try {
      const outcome = await importOneProject(project);
      if (outcome === 'imported') result.imported++;
      else result.skipped++;
    } catch (err) {
      console.error(`[migration projets] import impossible pour « ${project.title} » :`, err);
      if (err instanceof AppwriteException && err.code === 401) {
        throw err;
      }
      result.failures.push({ project, error: err });
    }
  }

  return result;
}
