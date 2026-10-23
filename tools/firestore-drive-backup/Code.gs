const BACKUP_CONFIG = Object.freeze({
  projectId: 'grupo-cassol-2',
  databaseId: '(default)',
  folderName: 'Grupo Cassol - Backups Firestore',
  timeZone: 'America/Sao_Paulo',
  triggerHour: 3,
  pageSize: 300,
  schemaVersion: 1,
});

/**
 * Executa um backup completo e versionado do Firestore no Google Drive.
 * Cada execução cria um .json.gz e um manifesto .json com o SHA-256; arquivos anteriores
 * nunca são substituídos nem removidos.
 */
function runFirestoreBackup() {
  const startedAt = new Date();
  try {
    const backup = exportFirestore_();
    validateBackup_(backup);

    const json = JSON.stringify(backup);
    const stamp = Utilities.formatDate(startedAt, BACKUP_CONFIG.timeZone, 'yyyy-MM-dd-HHmmss');
    const baseName = `grupo-cassol-firestore-${stamp}`;
    const gzip = Utilities.gzip(Utilities.newBlob(json, 'application/json', `${baseName}.json`));
    gzip.setName(`${baseName}.json.gz`);

    const folder = getOrCreateBackupFolder_();
    const backupFile = folder.createFile(gzip);
    const digest = sha256Hex_(gzip.getBytes());
    const manifest = {
      schemaVersion: BACKUP_CONFIG.schemaVersion,
      backupFile: backupFile.getName(),
      backupFileId: backupFile.getId(),
      sha256: digest,
      generatedAt: backup.generatedAt,
      projectId: backup.projectId,
      databaseId: backup.databaseId,
      totalDocuments: backup.summary.totalDocuments,
      collectionCounts: backup.summary.collectionCounts,
    };
    const manifestFile = folder.createFile(
      `${baseName}.manifest.json`,
      JSON.stringify(manifest, null, 2),
      MimeType.PLAIN_TEXT,
    );

    PropertiesService.getScriptProperties().setProperties({
      LAST_BACKUP_AT: backup.generatedAt,
      LAST_BACKUP_FILE_ID: backupFile.getId(),
      LAST_BACKUP_MANIFEST_ID: manifestFile.getId(),
      LAST_BACKUP_DOCUMENT_COUNT: String(backup.summary.totalDocuments),
      LAST_BACKUP_SHA256: digest,
      LAST_BACKUP_STATUS: 'success',
    });

    console.log(JSON.stringify(manifest));
    return manifest;
  } catch (error) {
    PropertiesService.getScriptProperties().setProperties({
      LAST_BACKUP_AT: new Date().toISOString(),
      LAST_BACKUP_STATUS: 'failed',
      LAST_BACKUP_ERROR: String(error && error.stack ? error.stack : error),
    });
    throw error;
  }
}

/**
 * Configura uma única execução diária na janela das 3h, horário de São Paulo.
 * O Apps Script pode iniciar o gatilho em qualquer minuto entre 03:00 e 04:00.
 */
function setupDailyBackup() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'runFirestoreBackup')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  const trigger = ScriptApp.newTrigger('runFirestoreBackup')
    .timeBased()
    .atHour(BACKUP_CONFIG.triggerHour)
    .everyDays(1)
    .inTimezone(BACKUP_CONFIG.timeZone)
    .create();

  PropertiesService.getScriptProperties().setProperty('DAILY_TRIGGER_ID', trigger.getUniqueId());
  return {
    triggerId: trigger.getUniqueId(),
    hourWindow: '03:00–04:00',
    timeZone: BACKUP_CONFIG.timeZone,
  };
}

/** Cria a pasta, executa o primeiro backup e só então ativa o gatilho diário. */
function installAndTestBackup() {
  const folder = getOrCreateBackupFolder_();
  const firstBackup = runFirestoreBackup();
  const schedule = setupDailyBackup();
  return {
    folderId: folder.getId(),
    folderUrl: folder.getUrl(),
    firstBackup,
    schedule,
  };
}

/** Retorna o estado da última execução sem alterar dados. */
function getBackupStatus() {
  return PropertiesService.getScriptProperties().getProperties();
}

function exportFirestore_() {
  const token = ScriptApp.getOAuthToken();
  const documents = [];
  const root = firestoreDocumentsRoot_();
  const topCollections = listCollectionIds_(root, token);

  topCollections.forEach((collectionId) => {
    exportCollection_(
      `${firestoreApiBase_()}/${root}/${encodeURIComponent(collectionId)}`,
      token,
      documents,
    );
  });

  const collectionCounts = {};
  documents.forEach((document) => {
    const topCollection = document.path.split('/')[0];
    collectionCounts[topCollection] = (collectionCounts[topCollection] || 0) + 1;
  });

  return {
    schemaVersion: BACKUP_CONFIG.schemaVersion,
    generatedAt: new Date().toISOString(),
    generatedTimeZone: BACKUP_CONFIG.timeZone,
    projectId: BACKUP_CONFIG.projectId,
    databaseId: BACKUP_CONFIG.databaseId,
    source: 'firestore-rest-api',
    summary: {
      totalDocuments: documents.length,
      topLevelCollections: topCollections.sort(),
      collectionCounts,
    },
    documents,
  };
}

function exportCollection_(collectionUrl, token, output) {
  let pageToken = '';
  do {
    const separator = collectionUrl.includes('?') ? '&' : '?';
    const pageUrl = `${collectionUrl}${separator}pageSize=${BACKUP_CONFIG.pageSize}`
      + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const response = firestoreFetch_(pageUrl, token, { method: 'get' });
    const payload = JSON.parse(response.getContentText() || '{}');

    (payload.documents || []).forEach((rawDocument) => {
      const path = rawDocument.name.split('/documents/')[1];
      output.push({
        path,
        createTime: rawDocument.createTime || null,
        updateTime: rawDocument.updateTime || null,
        fields: decodeFirestoreFields_(rawDocument.fields || {}),
      });

      const childCollections = listCollectionIds_(rawDocument.name, token);
      childCollections.forEach((childCollection) => {
        exportCollection_(`${firestoreApiBase_()}/${rawDocument.name}/${encodeURIComponent(childCollection)}`, token, output);
      });
    });

    pageToken = payload.nextPageToken || '';
  } while (pageToken);
}

function listCollectionIds_(parentResource, token) {
  const url = `${firestoreApiBase_()}/${parentResource}:listCollectionIds`;
  const collectionIds = [];
  let pageToken = '';
  do {
    const response = firestoreFetch_(url, token, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ pageSize: BACKUP_CONFIG.pageSize, pageToken }),
    });
    const payload = JSON.parse(response.getContentText() || '{}');
    collectionIds.push(...(payload.collectionIds || []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return [...new Set(collectionIds)];
}

function firestoreFetch_(url, token, options) {
  const response = UrlFetchApp.fetch(url, Object.assign({}, options, {
    headers: Object.assign({}, options.headers || {}, { Authorization: `Bearer ${token}` }),
    muteHttpExceptions: true,
  }));
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`Firestore respondeu HTTP ${status}: ${response.getContentText().slice(0, 1000)}`);
  }
  return response;
}

function decodeFirestoreFields_(fields) {
  const decoded = {};
  Object.keys(fields).forEach((key) => { decoded[key] = decodeFirestoreValue_(fields[key]); });
  return decoded;
}

function decodeFirestoreValue_(value) {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return { __type: 'timestamp', value: value.timestampValue };
  if ('stringValue' in value) return value.stringValue;
  if ('bytesValue' in value) return { __type: 'bytes', value: value.bytesValue };
  if ('referenceValue' in value) return { __type: 'reference', value: value.referenceValue };
  if ('geoPointValue' in value) return { __type: 'geoPoint', value: value.geoPointValue };
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue_);
  if ('mapValue' in value) return decodeFirestoreFields_(value.mapValue.fields || {});
  return { __type: 'unknown', value };
}

function validateBackup_(backup) {
  if (!backup || !Array.isArray(backup.documents) || backup.documents.length === 0) {
    throw new Error('Backup recusado: o Firestore retornou zero documentos.');
  }

  const dados = backup.documents.find((document) => document.path === 'dados/gc-conteudos');
  const rawContents = dados && dados.fields ? dados.fields.value : null;
  let contents = null;
  try {
    contents = typeof rawContents === 'string' ? JSON.parse(rawContents) : rawContents;
  } catch (error) {
    throw new Error(`Backup recusado: dados/gc-conteudos contém JSON inválido: ${error.message}`);
  }
  if (!dados || !Array.isArray(contents)) {
    throw new Error('Backup recusado: dados/gc-conteudos não contém a lista esperada.');
  }

  const previousCount = Number(PropertiesService.getScriptProperties().getProperty('LAST_BACKUP_DOCUMENT_COUNT') || 0);
  if (previousCount > 0 && backup.summary.totalDocuments < Math.floor(previousCount * 0.8)) {
    throw new Error(
      `Backup recusado: documentos caíram de ${previousCount} para ${backup.summary.totalDocuments}.`,
    );
  }

  backup.summary.dashboardContents = contents.length;
}

function getOrCreateBackupFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const storedId = properties.getProperty('BACKUP_FOLDER_ID');
  if (storedId) {
    try { return DriveApp.getFolderById(storedId); } catch (error) { console.warn(error); }
  }

  const folders = DriveApp.getFoldersByName(BACKUP_CONFIG.folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_CONFIG.folderName);
  properties.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}

function sha256Hex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map((byte) => (`0${(byte & 0xff).toString(16)}`).slice(-2))
    .join('');
}

function firestoreApiBase_() {
  return 'https://firestore.googleapis.com/v1';
}

function firestoreDocumentsRoot_() {
  return `projects/${BACKUP_CONFIG.projectId}/databases/${BACKUP_CONFIG.databaseId}/documents`;
}
