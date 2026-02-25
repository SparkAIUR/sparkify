import { test, expect } from "@playwright/test";

test("fixture site renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Fixture Site");
  await expect(page.getByTestId("copy-markdown-widget")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Page as Markdown" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Copy Site as Markdown" })).toBeEnabled();

  await page.click("text=CLI");
  await expect(page.locator("h1")).toHaveText("CLI Page");
});
