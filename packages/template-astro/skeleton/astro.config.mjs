import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  output: "static",
  integrations: [mdx()],
  site: process.env.SPARKIFY_SITE || undefined,
  base: process.env.SPARKIFY_BASE || undefined
});
