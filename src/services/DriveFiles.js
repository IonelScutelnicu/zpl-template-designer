/* ============================================================
   src/services/DriveFiles.js — Low-level Drive REST CRUD client

   All calls go through `driveFetch` which auto-retries once on
   401 after a silent token refresh.
   ============================================================ */

import { ensureValidToken, silentRefresh, getToken, signIn } from './DriveAuth.js';

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

async function driveFetch(url, opts = {}, retried = false) {
  const token = await ensureValidToken();
  const headers = Object.assign({}, opts.headers || {}, {
    Authorization: `Bearer ${token}`,
  });
  const res = await fetch(url, Object.assign({}, opts, { headers }));
  if (res.status === 401 && !retried) {
    await silentRefresh();
    return driveFetch(url, opts, true);
  }
  if (res.status === 403 && !retried) {
    const body = await res.text().catch(() => '');
    if (body.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || body.includes('insufficientPermissions')) {
      // Stale token with wrong scopes — force full re-consent.
      await signIn();
      return driveFetch(url, opts, true);
    }
    throw new Error(`Drive API 403: ${body || res.statusText}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive API ${res.status}: ${text || res.statusText}`);
  }
  return res;
}

function buildMultipartBody(metadata, jsonContent, boundary) {
  const delim = `\r\n--${boundary}\r\n`;
  const close = `\r\n--${boundary}--`;
  return [
    delim,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    delim,
    'Content-Type: application/json\r\n\r\n',
    typeof jsonContent === 'string' ? jsonContent : JSON.stringify(jsonContent, null, 2),
    close,
  ].join('');
}

export async function listFiles(folderId) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false and (mimeType='application/json' or mimeType='text/plain' or mimeType='application/octet-stream') and name contains '.json'`,
    fields: 'files(id,name,modifiedTime,createdTime)',
    orderBy: 'modifiedTime desc',
    pageSize: '200',
  });
  const res = await driveFetch(`${DRIVE_BASE}/files?${params}`);
  const json = await res.json();
  return json.files || [];
}

export async function getFile(fileId) {
  const res = await driveFetch(`${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?alt=media`);
  return res.json();
}

export async function getFileMetadata(fileId) {
  const params = new URLSearchParams({ fields: 'id,name,modifiedTime,createdTime,parents' });
  const res = await driveFetch(`${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?${params}`);
  return res.json();
}

export async function createFile(folderId, name, jsonContent) {
  const boundary = '-------zebra' + Math.random().toString(16).slice(2);
  const metadata = {
    name: ensureJsonExt(name),
    mimeType: 'application/json',
    parents: [folderId],
  };
  const body = buildMultipartBody(metadata, jsonContent, boundary);
  const res = await driveFetch(
    `${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,modifiedTime,createdTime`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  return res.json();
}

export async function updateFile(fileId, name, jsonContent) {
  const boundary = '-------zebra' + Math.random().toString(16).slice(2);
  const metadata = { name: ensureJsonExt(name) };
  const body = buildMultipartBody(metadata, jsonContent, boundary);
  const res = await driveFetch(
    `${UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,modifiedTime`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  return res.json();
}

export async function createFolder(name, parentId) {
  const body = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) body.parents = [parentId];
  const res = await driveFetch(`${DRIVE_BASE}/files?fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function findFolderByName(name, { inRoot = false } = {}) {
  let q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (inRoot) q += ` and 'root' in parents`;
  const params = new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '10' });
  const res = await driveFetch(`${DRIVE_BASE}/files?${params}`);
  const json = await res.json();
  return (json.files && json.files[0]) || null;
}

export async function trashFile(fileId) {
  const res = await driveFetch(
    `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?fields=id,trashed`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    }
  );
  return res.json();
}

function ensureJsonExt(name) {
  return /\.json$/i.test(name) ? name : `${name}.json`;
}

export function driveViewUrl(fileId) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}
