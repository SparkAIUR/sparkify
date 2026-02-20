export interface StoplightPageOptions {
  title: string;
  specUrl: string;
  proxyUrl?: string;
  serverUrl?: string;
  currentPath?: string;
  layoutImportPath?: string;
  navigationImportPath?: string;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildStoplightAstroPage(options: StoplightPageOptions): string {
  const title = escapeHtml(options.title);
  const specUrl = escapeHtml(options.specUrl);
  const proxyAttr = options.proxyUrl ? ` tryItCorsProxy="${escapeHtml(options.proxyUrl)}"` : "";
  const serverHint = options.serverUrl
    ? `<p class="hint">Default server: <code>${escapeHtml(options.serverUrl)}</code></p>`
    : '<p class="hint">No default server configured. Try It may be read-only until a server is selected.</p>';

  const currentPath = escapeHtml(options.currentPath ?? "api");
  const layoutImportPath = options.layoutImportPath ?? "../layouts/DocsLayout.astro";
  const navImportPath = options.navigationImportPath ?? "../generated/navigation.json";

  return `---
import DocsLayout from "${layoutImportPath}";
import nav from "${navImportPath}";
const currentPath = "${currentPath}";
---
<DocsLayout title="${title}" nav={nav} currentPath={currentPath}>
  <h1>${title}</h1>
  ${serverHint}
  <link rel="stylesheet" href="https://unpkg.com/@stoplight/elements/styles.min.css" />
  <script type="module" src="https://unpkg.com/@stoplight/elements/web-components.min.js"></script>
  <elements-api apiDescriptionUrl="${specUrl}" layout="stacked" router="hash"${proxyAttr}></elements-api>
</DocsLayout>

<style>
  .hint {
    margin: 0 0 1rem;
    color: #475569;
  }
</style>
`;
}

export function isSecretDependentOAuthFlow(flow: string): boolean {
  return flow === "clientCredentials" || flow === "password";
}
