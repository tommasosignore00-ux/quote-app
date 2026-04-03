import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('homepage loads and shows login/register buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/QuoteApp|Quote/i);
    await expect(page.getByRole('link', { name: /register|registra/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /login|accedi/i })).toBeVisible();
  });

  test('register page loads', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('login page loads', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/auth/login');
    await page.fill('input[type="email"]', 'invalid@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    // Should show an error message or stay on login page
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('Navigation', () => {
  test('protected routes redirect to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });

  test('onboarding redirects to login without auth', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('API Health', () => {
  test('health endpoint responds', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
  });

  test('register endpoint validates input', async ({ request }) => {
    const response = await request.post('/api/auth/register', {
      data: { email: '', password: '' },
    });
    expect(response.status()).toBe(400);
  });
});
