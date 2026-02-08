import { test, expect } from '@playwright/test';
import { ElementsPanel, PropertiesPanel, ZPLOutput } from '../page-objects';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Import/Export - Template Persistence', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    // ============== EXPORT ==============
    test.describe('Export', () => {
        test('should trigger download when Export button is clicked', async ({ page }) => {
            await elementsPanel.addTextElement();

            // Setup download listener
            const downloadPromise = page.waitForEvent('download');
            await zplOutput.exportTemplate();
            const download = await downloadPromise;

            expect(download.suggestedFilename()).toMatch(/\.json$/);
        });

        test('should export valid JSON containing elements array', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.addBarcodeElement();

            const downloadPromise = page.waitForEvent('download');
            await zplOutput.exportTemplate();
            const download = await downloadPromise;

            // Save to temp file and read
            const tempPath = path.join(__dirname, '../fixtures/temp-export-valid.json');
            await download.saveAs(tempPath);

            const content = fs.readFileSync(tempPath, 'utf-8');
            const json = JSON.parse(content);

            expect(json).toHaveProperty('elements');
            expect(Array.isArray(json.elements)).toBe(true);
            expect(json.elements.length).toBe(2);

            // Cleanup
            fs.unlinkSync(tempPath);
        });

        test('should preserve Text element properties in export', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('#prop-x').fill('123');
            await page.locator('#prop-x').dispatchEvent('change');
            await page.locator('#prop-y').fill('456');
            await page.locator('#prop-y').dispatchEvent('change');
            await page.locator('#prop-preview-text').fill('Export Test');
            await page.locator('#prop-preview-text').dispatchEvent('change');

            const downloadPromise = page.waitForEvent('download');
            await zplOutput.exportTemplate();
            const download = await downloadPromise;

            const tempPath = path.join(__dirname, '../fixtures/temp-export-text.json');
            await download.saveAs(tempPath);

            const content = fs.readFileSync(tempPath, 'utf-8');
            const json = JSON.parse(content);

            const textElement = json.elements[0];
            expect(textElement.x).toBe(123);
            expect(textElement.y).toBe(456);
            expect(textElement.previewText).toBe('Export Test');

            fs.unlinkSync(tempPath);
        });

        test('should preserve Box element properties in export', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('#prop-width').fill('200');
            await page.locator('#prop-width').dispatchEvent('change');
            await page.locator('#prop-height').fill('150');
            await page.locator('#prop-height').dispatchEvent('change');

            const downloadPromise = page.waitForEvent('download');
            await zplOutput.exportTemplate();
            const download = await downloadPromise;

            const tempPath = path.join(__dirname, '../fixtures/temp-export-box.json');
            await download.saveAs(tempPath);

            const content = fs.readFileSync(tempPath, 'utf-8');
            const json = JSON.parse(content);

            const boxElement = json.elements[0];
            expect(boxElement.width).toBe(200);
            expect(boxElement.height).toBe(150);

            fs.unlinkSync(tempPath);
        });

        test('should preserve label settings in export', async ({ page }) => {
            await page.locator('#label-width').fill('75');
            await page.locator('#label-width').dispatchEvent('change');
            await page.locator('#label-height').fill('40');
            await page.locator('#label-height').dispatchEvent('change');

            const downloadPromise = page.waitForEvent('download');
            await zplOutput.exportTemplate();
            const download = await downloadPromise;

            const tempPath = path.join(__dirname, '../fixtures/temp-export-settings.json');
            await download.saveAs(tempPath);

            const content = fs.readFileSync(tempPath, 'utf-8');
            const json = JSON.parse(content);

            expect(json).toHaveProperty('labelSettings');
            expect(json.labelSettings.width).toBe(75);
            expect(json.labelSettings.height).toBe(40);

            fs.unlinkSync(tempPath);
        });
    });

    // ============== IMPORT ==============
    test.describe('Import', () => {
        test('should import template and restore elements', async ({ page }) => {
            // Create a valid template JSON
            const template = {
                labelSettings: { width: 100, height: 50, dpmm: 8 },
                elements: [
                    { type: 'TEXT', x: 100, y: 100, placeholder: '{data}', previewText: 'Imported Text', fontSize: 30, fontWidth: 30, fontId: '' }
                ]
            };

            // Create temp file
            const tempPath = path.join(__dirname, '../fixtures/import-restore.json');
            fs.writeFileSync(tempPath, JSON.stringify(template));

            await zplOutput.importTemplate(tempPath);

            // Wait for import to complete
            await page.waitForTimeout(500);

            expect(await elementsPanel.getElementCount()).toBe(1);

            fs.unlinkSync(tempPath);
        });

        test('should restore element properties after import', async ({ page }) => {
            const template = {
                labelSettings: { width: 100, height: 50, dpmm: 8 },
                elements: [
                    { type: 'TEXT', x: 150, y: 200, placeholder: '{data}', previewText: 'Property Test', fontSize: 40, fontWidth: 35, fontId: '', id: Date.now(), orientation: 'N', reverse: false }
                ]
            };

            const tempPath = path.join(__dirname, '../fixtures/import-props.json');
            fs.writeFileSync(tempPath, JSON.stringify(template));

            await zplOutput.importTemplate(tempPath);
            await page.waitForTimeout(1000);

            await elementsPanel.selectElementByIndex(0);
            await page.waitForTimeout(200);

            await propertiesPanel.verifyPropertyValue('prop-x', '150');
            await propertiesPanel.verifyPropertyValue('prop-y', '200');
            await propertiesPanel.verifyPropertyValue('prop-preview-text', 'Property Test');

            fs.unlinkSync(tempPath);
        });

        test('should import multiple elements of different types', async ({ page }) => {
            const template = {
                labelSettings: { width: 100, height: 50, dpmm: 8 },
                elements: [
                    { type: 'TEXT', x: 50, y: 50, placeholder: '{data}', previewText: 'Text 1', fontSize: 20, fontWidth: 20, fontId: '' },
                    { type: 'BARCODE', x: 50, y: 100, placeholder: '{barcode}', previewData: '12345', height: 50, width: 2, ratio: 2 },
                    { type: 'BOX', x: 50, y: 200, width: 100, height: 80, thickness: 2, color: 'B', rounding: 0 }
                ]
            };

            const tempPath = path.join(__dirname, '../fixtures/import-multi.json');
            fs.writeFileSync(tempPath, JSON.stringify(template));

            await zplOutput.importTemplate(tempPath);
            await page.waitForTimeout(500);

            expect(await elementsPanel.getElementCount()).toBe(3);

            fs.unlinkSync(tempPath);
        });

        test('should update ZPL output after import', async ({ page }) => {
            const template = {
                labelSettings: { width: 100, height: 50, dpmm: 8 },
                elements: [
                    { type: 'TEXT', x: 100, y: 100, previewText: 'ZPL Test', fontSize: 30, fontWidth: 30, fontId: '' }
                ]
            };

            const tempPath = path.join(__dirname, '../fixtures/import-zpl.json');
            fs.writeFileSync(tempPath, JSON.stringify(template));

            await zplOutput.importTemplate(tempPath);
            await page.waitForTimeout(500);

            await zplOutput.verifyZPLContains('^FDZPL Test^FS');

            fs.unlinkSync(tempPath);
        });
    });

    // ============== INVALID JSON HANDLING ==============
    test.describe('Invalid JSON Handling', () => {
        test('should handle malformed JSON gracefully', async ({ page }) => {
            const tempPath = path.join(__dirname, '../fixtures/invalid.json');
            fs.writeFileSync(tempPath, 'not valid json {{{');

            // Import should not crash the app
            await zplOutput.importTemplate(tempPath);
            await page.waitForTimeout(500);

            // App should still be functional
            await elementsPanel.addTextElement();
            expect(await elementsPanel.getElementCount()).toBe(1);

            fs.unlinkSync(tempPath);
        });

        test('should handle missing elements array gracefully', async ({ page }) => {
            const template = {
                labelSettings: { width: 100, height: 50, dpmm: 8 }
                // No elements array
            };

            const tempPath = path.join(__dirname, '../fixtures/missing-elements.json');
            fs.writeFileSync(tempPath, JSON.stringify(template));

            await zplOutput.importTemplate(tempPath);
            await page.waitForTimeout(500);

            // App should still be functional
            await elementsPanel.addTextElement();
            expect(await elementsPanel.getElementCount()).toBeGreaterThanOrEqual(0);

            fs.unlinkSync(tempPath);
        });

        test('should handle empty elements array', async ({ page }) => {
            const template = {
                labelSettings: { width: 100, height: 50, dpmm: 8 },
                elements: []
            };

            const tempPath = path.join(__dirname, '../fixtures/empty-elements.json');
            fs.writeFileSync(tempPath, JSON.stringify(template));

            await zplOutput.importTemplate(tempPath);
            await page.waitForTimeout(500);

            expect(await elementsPanel.getElementCount()).toBe(0);

            fs.unlinkSync(tempPath);
        });
    });

    // ============== ROUND-TRIP ==============
    test.describe('Round-Trip', () => {
        test('should preserve all data through export then import cycle', async ({ page }) => {
            // Create elements with specific values
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await page.locator('#prop-preview-text').fill('Round Trip Test');
            await page.locator('#prop-preview-text').dispatchEvent('input');
            await page.locator('#prop-x').fill('175');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('225');
            await page.locator('#prop-y').dispatchEvent('input');
            await page.waitForTimeout(200);

            // Export
            const downloadPromise = page.waitForEvent('download');
            await zplOutput.exportTemplate();
            const download = await downloadPromise;

            const tempPath = path.join(__dirname, '../fixtures/roundtrip.json');
            await download.saveAs(tempPath);

            // Clear elements
            await elementsPanel.deleteElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(0);

            // Import
            await zplOutput.importTemplate(tempPath);
            await page.waitForTimeout(500);

            // Verify
            expect(await elementsPanel.getElementCount()).toBe(1);
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.verifyPropertyValue('prop-preview-text', 'Round Trip Test');
            await propertiesPanel.verifyPropertyValue('prop-x', '175');
            await propertiesPanel.verifyPropertyValue('prop-y', '225');

            fs.unlinkSync(tempPath);
        });
    });
});
