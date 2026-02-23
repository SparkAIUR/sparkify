import mermaid from "mermaid";

let mermaidReady = false;

async function renderMermaidBlocks(): Promise<void> {
  if (!mermaidReady) {
    mermaid.initialize({
      startOnLoad: false,
      fontFamily: "inherit",
      securityLevel: "loose"
    });
    mermaidReady = true;
  }

  const blocks = [...document.querySelectorAll(".mermaid")];
  for (const [index, block] of blocks.entries()) {
    if (!(block instanceof HTMLElement) || block.dataset.sparkifyMermaidRendered === "true") {
      continue;
    }

    const chart = (block.textContent || "").trim();
    if (!chart) {
      continue;
    }

    try {
      const id = `sparkify-mermaid-${Date.now()}-${index}`;
      const { svg } = await mermaid.render(id, chart);
      block.innerHTML = svg;
      block.dataset.sparkifyMermaidRendered = "true";
    } catch {
      // Keep raw chart text visible when Mermaid fails to parse.
    }
  }
}

function runMermaidRender(): void {
  void renderMermaidBlocks();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runMermaidRender, { once: true });
} else {
  runMermaidRender();
}

document.addEventListener("astro:page-load", runMermaidRender);
