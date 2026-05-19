/* ============================================================
   src/services/DriveTemplateService.js
   Editor-facing wrapper over DriveAuth + DriveFiles.
   ============================================================ */

import * as driveAuth from './DriveAuth.js';
import * as drive from './DriveFiles.js';

export class DriveTemplateService {
  isConnected() {
    return driveAuth.isConnected();
  }

  isConfigured() {
    return driveAuth.getState().configured;
  }

  getFolder() {
    return driveAuth.getFolder();
  }

  getProfile() {
    return driveAuth.getProfile();
  }

  /**
   * Load a Drive template by file ID. Used when the editor opens with
   * `?drive=<id>` and no sessionStorage payload (e.g. user refreshed).
   */
  async load(fileId) {
    const json = await drive.getFile(fileId);
    const meta = await drive.getFileMetadata(fileId);
    return { json, meta };
  }

  /**
   * Create a new file in the user's Drive folder. Returns metadata
   * including the new file id.
   */
  async create({ name, json }) {
    const folder = driveAuth.getFolder();
    if (!folder) throw new Error('No Drive folder selected. Connect to Google Drive first.');
    return drive.createFile(folder.id, name, json);
  }

  /**
   * Update an existing Drive file (content + name).
   */
  async update({ fileId, name, json }) {
    return drive.updateFile(fileId, name, json);
  }

  async trash(fileId) {
    return drive.trashFile(fileId);
  }

  viewUrl(fileId) {
    return drive.driveViewUrl(fileId);
  }
}
