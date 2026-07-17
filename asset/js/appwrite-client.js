// asset/js/appwrite-client.js
// Socle Appwrite partagé (admin + futur frontend public).
// SDK Web importé depuis un CDN en version épinglée (pas de bundler dans ce projet).

import {
  Client,
  Account,
  TablesDB,
  Storage,
  Query,
  ID,
  AppwriteException,
} from 'https://cdn.jsdelivr.net/npm/appwrite@26.2.0/+esm';

import {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
} from './appwrite-config.js';

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

const account = new Account(client);
const tablesDB = new TablesDB(client);
const storage = new Storage(client);

// Diagnostic console pour les erreurs réseau type "Failed to fetch"
// (jamais affiché dans l'interface). Cause la plus fréquente : l'origin
// courant n'est pas déclaré comme plateforme Web dans le projet Appwrite.
function logNetworkDiagnostic(err) {
  if (err instanceof AppwriteException) return;
  console.error(
    '[appwrite] Requête réseau impossible.',
    '\n  Origin actuel :', window.location.origin,
    '\n  Endpoint utilisé :', APPWRITE_ENDPOINT,
    '\n  Vérifie que le hostname de cet origin (sans https://) est déclaré',
    'comme plateforme Web dans le projet Appwrite (CORS).',
    '\n  Erreur :', err
  );
}

export { client, account, tablesDB, storage, Query, ID, AppwriteException, logNetworkDiagnostic };
