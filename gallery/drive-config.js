/* ============================================================
   gallery/drive-config.js — Google Cloud credentials

   SETUP REQUIRED before this feature works:

   1. Create a project in https://console.cloud.google.com
   2. Enable APIs:
        - Google Drive API
        - Google Picker API
   3. OAuth consent screen → External → add your email as test user.
   4. Create credentials:
        a) OAuth 2.0 Client ID (type: Web application)
           - Authorized JavaScript origins: add the host you serve from
             (e.g. http://localhost:8080, https://yourdomain.com).
        b) API key (no restrictions needed for dev; restrict in prod).
   5. Paste the Client ID and API key below.

   The OAuth scope is `drive.file` only — the app cannot see any of the
   user's Drive contents except files it created or files explicitly
   opened via the Google Picker. This is the non-restricted scope and
   does NOT require Google's CASA security audit.
   ============================================================ */

export const GOOGLE_CLIENT_ID = '320208085854-ariq7j3pviph3plgl9ha5bt1s983nguc.apps.googleusercontent.com';
export const GOOGLE_API_KEY = 'AIzaSyDcNHoXpgU2ClmgVATdPWzE-iwM3nFqcHY';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file profile';

export const STORAGE_KEYS = {
  token: 'zebra.drive.token',
  tokenExpiry: 'zebra.drive.token_expiry',
  folderId: 'zebra.drive.folder_id',
  folderName: 'zebra.drive.folder_name',
  profile: 'zebra.drive.profile',
};

export function isConfigured() {
  return !GOOGLE_CLIENT_ID.startsWith('__') && !GOOGLE_API_KEY.startsWith('__');
}
