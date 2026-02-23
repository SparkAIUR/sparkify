import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const mintlifyComponentsProviderPath = fileURLToPath(
  new URL("./src/components/mintlify-components-provider.tsx", import.meta.url)
);

export default defineConfig({
  output: "static",
  integrations: [react(), mdx()],
  markdown: {
    shikiConfig: {
      theme: "github-light-default"
    }
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@mintlify/astro/components": mintlifyComponentsProviderPath
      }
    }
  },
  site: process.env.SPARKIFY_SITE || undefined,
  base: process.env.SPARKIFY_BASE || undefined
});
