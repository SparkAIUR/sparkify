import { test, expect } from "@playwright/test";

test("fixture site renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Fixture Site");

  await page.click("text=CLI");
  await expect(page.locator("h1")).toHaveText("CLI Page");
});
