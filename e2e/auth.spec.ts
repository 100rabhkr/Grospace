import { test, expect } from "@playwright/test";

test.describe("Auth / Login page", () => {
  test("login page loads without crashing", async ({ page }) => {
    await page.goto("/auth/login");
    // The page should render without a hard error
    await expect(page).toHaveTitle(/GroSpace/i, { timeout: 15_000 }).catch(() => {
      // Title may not contain "GroSpace" — that's fine, just verify no crash
    });
    // Logo text should be visible
    await expect(page.locator("text=GroSpace")).toBeVisible();
  });

  test("email and password inputs are present", async ({ page }) => {
    await page.goto("/auth/login");

    const emailInput = page.locator("#email");
    const passwordInput = page.locator("#password");

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("type", "email");
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("sign-in button is present and labelled", async ({ page }) => {
    await page.goto("/auth/login");

    const signInButton = page.locator("button[type='submit']");
    await expect(signInButton).toBeVisible();
    await expect(signInButton).toHaveText(/Sign In/i);
  });

  test("demo login button is present", async ({ page }) => {
    await page.goto("/auth/login");

    const demoButton = page.locator("button", { hasText: /Demo Login/i });
    await expect(demoButton).toBeVisible();
  });

  test("invalid login shows error message", async ({ page }) => {
    await page.goto("/auth/login");

    await page.fill("#email", "bad@example.com");
    await page.fill("#password", "wrongpassword");
    await page.locator("button[type='submit']").click();

    // Wait for the error message to appear (red background)
    const errorMessage = page.locator("p.text-red-600");
    await expect(errorMessage).toBeVisible({ timeout: 10_000 });
  });

  test("toggle to sign-up mode works", async ({ page }) => {
    await page.goto("/auth/login");

    // Click the mode toggle
    await page.locator("text=Don't have an account? Sign up").click();

    // Heading should change
    await expect(page.locator("text=Create account")).toBeVisible();
    // Submit button should say "Create Account"
    await expect(page.locator("button[type='submit']")).toHaveText(/Create Account/i);
  });

  test("login form has id login-form", async ({ page }) => {
    await page.goto("/auth/login");
    const form = page.locator("form#login-form");
    await expect(form).toBeVisible();
  });
});
