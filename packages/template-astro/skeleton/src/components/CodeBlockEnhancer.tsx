import { useEffect } from "react";

const COPY_ICON_SVG = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
</svg>
`;

function attachCopyButtons() {
  const codeBlocks = document.querySelectorAll<HTMLElement>(".mdx-content pre.astro-code");

  for (const block of codeBlocks) {
    if (block.querySelector(".spark-copy-code-btn")) {
      continue;
    }

    block.style.position = "relative";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "spark-copy-code-btn";
    button.ariaLabel = "Copy code";
    button.innerHTML = COPY_ICON_SVG;
    button.addEventListener("click", async () => {
      const value = block.innerText.replace(/\n$/, "");
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        // ignore clipboard failures
      }
    });

    block.appendChild(button);
  }
}

export default function CodeBlockEnhancer() {
  useEffect(() => {
    attachCopyButtons();
  }, []);

  return (
    <style>{`
      .spark-copy-code-btn {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        border: 1px solid rgb(229 231 235);
        background: rgb(255 255 255 / 0.95);
        color: rgb(107 114 128);
        border-radius: 0.45rem;
        width: 1.75rem;
        height: 1.75rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .spark-copy-code-btn:hover {
        color: rgb(55 65 81);
      }
    `}</style>
  );
}

