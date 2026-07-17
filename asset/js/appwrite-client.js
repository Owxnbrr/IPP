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

export { client, account, tablesDB, storage, Query, ID, AppwriteException };
