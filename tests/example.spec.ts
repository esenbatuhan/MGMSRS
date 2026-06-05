import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Sayfanın yüklendiğini kontrol et (başlık veya belirli bir metin üzerinden)
  // title'ın ne olduğunu bilmediğim için genel bir kontrol yapıyorum
  await expect(page).toHaveTitle(/./);
});

test('login page loads', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('form')).toBeVisible();
});

test('register page loads', async ({ page }) => {
  await page.goto('/register');
  await expect(page.locator('form')).toBeVisible();
});
