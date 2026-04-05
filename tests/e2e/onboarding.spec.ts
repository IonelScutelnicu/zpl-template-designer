import { test, expect } from '@playwright/test';
import { setupLabelaryCacheInterceptor } from '../fixtures/labelary-cache';

// These tests use base Playwright test (NOT ../fixtures) so onboarding is NOT disabled.

test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await setupLabelaryCacheInterceptor(page);
    await page.goto('/');
});

test.describe('Onboarding Walkthrough', () => {
    test('shows walkthrough on first visit', async ({ page }) => {
        const popover = page.locator('.walkthrough-popover');
        await expect(popover).toBeVisible();
        await expect(popover.locator('[data-wt="title"]')).toHaveText('Welcome to ZPL Editor');
        await expect(popover.locator('[data-wt="counter"]')).toHaveText('1 / 9');
    });

    test('can navigate through all steps with Next button', async ({ page }) => {
        const popover = page.locator('.walkthrough-popover');
        const nextBtn = popover.locator('[data-wt="next"]');
        const title = popover.locator('[data-wt="title"]');

        await expect(popover).toBeVisible();

        // Step 1: Welcome
        await expect(title).toHaveText('Welcome to ZPL Editor');
        await expect(nextBtn).toHaveText('Get Started');
        await nextBtn.click();

        // Step 2: Add Elements
        await expect(title).toHaveText('Add Elements');
        await expect(nextBtn).toHaveText('Next');
        await nextBtn.click();

        // Step 3: Design Canvas
        await expect(title).toHaveText('Design Canvas');
        await nextBtn.click();

        // Step 4: Elements List
        await expect(title).toHaveText('Elements List');
        await nextBtn.click();

        // Step 5: Properties Panel
        await expect(title).toHaveText('Properties Panel');
        await nextBtn.click();

        // Step 6: Live ZPL Output
        await expect(title).toHaveText('Live ZPL Output');
        await nextBtn.click();

        // Step 7: Edit & Preview Modes
        await expect(title).toHaveText('Edit & Preview Modes');
        await nextBtn.click();

        // Step 8: Copy, Share & Export
        await expect(title).toHaveText('Copy, Share & Export');
        await nextBtn.click();

        // Step 9: You're All Set!
        await expect(title).toHaveText("You're All Set!");
        await expect(nextBtn).toHaveText('Done');
        await nextBtn.click();

        // Walkthrough should be dismissed
        await expect(popover).not.toBeVisible();
    });

    test('can skip the tour', async ({ page }) => {
        const popover = page.locator('.walkthrough-popover');
        await expect(popover).toBeVisible();

        await popover.locator('[data-wt="skip"]').click();
        await expect(popover).not.toBeVisible();
    });

    test('does not reappear after being completed', async ({ page }) => {
        const popover = page.locator('.walkthrough-popover');
        await expect(popover).toBeVisible();

        // Complete the tour by skipping
        await popover.locator('[data-wt="skip"]').click();
        await expect(popover).not.toBeVisible();

        // Reload and verify it doesn't come back
        await page.reload();
        await expect(popover).not.toBeVisible();
    });

    test('tour button re-triggers the walkthrough', async ({ page }) => {
        const popover = page.locator('.walkthrough-popover');
        await expect(popover).toBeVisible();

        // Skip the initial tour
        await popover.locator('[data-wt="skip"]').click();
        await expect(popover).not.toBeVisible();

        // Click the Tour button in the header
        await page.locator('#tour-btn').click();
        await expect(popover).toBeVisible();
        await expect(popover.locator('[data-wt="title"]')).toHaveText('Welcome to ZPL Editor');
    });

    test('Escape key skips the tour', async ({ page }) => {
        const popover = page.locator('.walkthrough-popover');
        await expect(popover).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(popover).not.toBeVisible();
    });

    test('Arrow keys navigate between steps', async ({ page }) => {
        const popover = page.locator('.walkthrough-popover');
        const title = popover.locator('[data-wt="title"]');
        await expect(popover).toBeVisible();

        // Go forward with ArrowRight
        await page.keyboard.press('ArrowRight');
        await expect(title).toHaveText('Add Elements');

        // Go forward again
        await page.keyboard.press('ArrowRight');
        await expect(title).toHaveText('Design Canvas');

        // Go back with ArrowLeft
        await page.keyboard.press('ArrowLeft');
        await expect(title).toHaveText('Add Elements');
    });

    test('Back button is hidden on first step', async ({ page }) => {
        const popover = page.locator('.walkthrough-popover');
        await expect(popover).toBeVisible();

        const backBtn = popover.locator('[data-wt="back"]');
        await expect(backBtn).toBeHidden();

        // Navigate to step 2 — Back button should appear
        await popover.locator('[data-wt="next"]').click();
        await expect(backBtn).toBeVisible();
    });
});
