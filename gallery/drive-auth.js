/* ============================================================
   gallery/drive-auth.js — Google Drive auth + Picker

   Wraps Google Identity Services (GIS) and the Picker API.
   Module-level singleton — both gallery and editor pages
   share the same token via localStorage.
   ============================================================ */

import {
  GOOGLE_CLIENT_ID,
  GOOGLE_API_KEY,
  DRIVE_SCOPE,
  STORAGE_KEYS,
  isConfigured,
} from './drive-config.js';

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const GAPI_SRC = 'https://apis.google.com/js/api.js';

let tokenClient = null;
let gisLoaded = false;
let gapiLoaded = false;
let pickerLoaded = false;

const subscribers = new Set();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing && existing.dataset.loaded === '1') return resolve();
    const s = existing || document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.addEventListener('load', () => { s.dataset.loaded = '1'; resolve(); });
    s.addEventListener('error', () => reject(new Error('Failed to load ' + src)));
    if (!existing) document.head.appendChild(s);
  });
}

async function ensureGis() {
  if (gisLoaded) return;
  if (!isConfigured()) throw new Error('Drive not configured. Edit gallery/drive-config.js.');
  await loadScript(GSI_SRC);
  gisLoaded = true;
}

async function ensureGapi() {
  if (gapiLoaded) return;
  await loadScript(GAPI_SRC);
  await new Promise((resolve) => window.gapi.load('client', resolve));
  await window.gapi.client.init({ apiKey: GOOGLE_API_KEY });
  gapiLoaded = true;
}

async function ensurePicker() {
  if (pickerLoaded) return;
  await ensureGapi();
  await new Promise((resolve) => window.gapi.load('picker', resolve));
  pickerLoaded = true;
}

function getTokenClient() {
  if (tokenClient) return tokenClient;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    prompt: '',
    callback: () => {}, // overridden per-call
  });
  return tokenClient;
}

function persistToken(token, expiresIn) {
  const expiresAt = Date.now() + (expiresIn - 60) * 1000;
  localStorage.setItem(STORAGE_KEYS.token, token);
  localStorage.setItem(STORAGE_KEYS.tokenExpiry, String(expiresAt));
}

function clearAll() {
  // Keep folderId/folderName so the last chosen folder is remembered across sessions.
  const { folderId, folderName, ...sessionKeys } = STORAGE_KEYS;
  Object.values(sessionKeys).forEach((k) => localStorage.removeItem(k));
}

function notify() {
  const state = getState();
  subscribers.forEach((cb) => {
    try { cb(state); } catch (e) { console.warn('drive-auth subscriber threw:', e); }
  });
}

function requestToken({ prompt = '' } = {}) {
  return new Promise((resolve, reject) => {
    const client = getTokenClient();
    client.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error));
      persistToken(resp.access_token, resp.expires_in);
      resolve(resp.access_token);
    };
    try {
      client.requestAccessToken({ prompt });
    } catch (e) {
      reject(e);
    }
  });
}

async function fetchProfile(token) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json();

    let picture = '';
    if (json.picture) {
      try {
        const imgRes = await fetch(json.picture);
        if (imgRes.ok) {
          const blob = await imgRes.blob();
          picture = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        }
      } catch { /* ignore */ }
    }

    return { name: json.name || '', picture };
  } catch {
    return null;
  }
}

function openFolderPicker(token) {
  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.picker) {
      return reject(new Error('Picker not loaded'));
    }
    const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder')
      .setIncludeFolders(true);

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setTitle('Choose a folder for your private templates')
      .setCallback((data) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const doc = data.docs && data.docs[0];
          if (!doc) return reject(new Error('No folder selected'));
          resolve({ id: doc.id, name: doc.name });
        } else if (data.action === window.google.picker.Action.CANCEL) {
          reject(new Error('Folder selection cancelled'));
        }
      })
      .build();
    picker.setVisible(true);
  });
}

// ---- Public API ----

export function getToken() {
  return localStorage.getItem(STORAGE_KEYS.token) || null;
}

export function isTokenLikelyValid() {
  const exp = parseInt(localStorage.getItem(STORAGE_KEYS.tokenExpiry) || '0', 10);
  return !!getToken() && Date.now() < exp;
}

export function getFolder() {
  const id = localStorage.getItem(STORAGE_KEYS.folderId);
  const name = localStorage.getItem(STORAGE_KEYS.folderName);
  return id ? { id, name: name || 'Drive folder' } : null;
}

export function getProfile() {
  const raw = localStorage.getItem(STORAGE_KEYS.profile);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function isConnected() {
  return !!(getToken() && getFolder());
}

export function getState() {
  return {
    connected: isConnected(),
    token: getToken(),
    folder: getFolder(),
    profile: getProfile(),
    configured: isConfigured(),
  };
}

export function subscribe(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export async function refreshProfileIfMissing() {
  if (getProfile() || !isTokenLikelyValid()) return;
  const profile = await fetchProfile(getToken());
  if (profile) {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
    notify();
  }
}

export async function signIn() {
  await ensureGis();
  const token = await requestToken({ prompt: 'consent' });
  const profile = await fetchProfile(token);
  if (profile) localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  notify();
  return { token, profile };
}

export async function pickFolder() {
  await ensureGis();
  await ensurePicker();
  const token = await ensureValidToken();
  const folder = await openFolderPicker(token);
  return folder;
}

export function setFolder(id, name) {
  localStorage.setItem(STORAGE_KEYS.folderId, id);
  localStorage.setItem(STORAGE_KEYS.folderName, name || 'Drive folder');
  notify();
}

// Convenience: full sign-in + pick. Kept for callers that don't need
// the "create new folder" branch.
export async function connect() {
  await signIn();
  const folder = await pickFolder();
  setFolder(folder.id, folder.name);
  return getState();
}

export async function changeFolder() {
  const folder = await pickFolder();
  setFolder(folder.id, folder.name);
  return getState();
}

export async function silentRefresh() {
  await ensureGis();
  return requestToken({ prompt: '' });
}

export async function ensureValidToken() {
  if (isTokenLikelyValid()) return getToken();
  await ensureGis();
  return silentRefresh();
}

export async function disconnect() {
  const token = getToken();
  if (token && window.google && window.google.accounts && window.google.accounts.oauth2) {
    try {
      await new Promise((resolve) => window.google.accounts.oauth2.revoke(token, resolve));
    } catch {
      // best effort
    }
  }
  clearAll();
  notify();
}
