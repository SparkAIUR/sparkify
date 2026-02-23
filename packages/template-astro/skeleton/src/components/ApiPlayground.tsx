import { useEffect } from "react";

interface ApiPlaygroundProps {
  specUrl: string;
  proxyUrl?: string;
  serverUrl?: string;
}

let scriptLoaded = false;

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-sparkify-stoplight=\"${url}\"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load script")), { once: true });
      if (existing.dataset.loaded === "true") {
        resolve();
      }
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.dataset.sparkifyStoplight = url;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Failed to load script")), { once: true });
    document.head.appendChild(script);
  });
}

export default function ApiPlayground({ specUrl, proxyUrl, serverUrl }: ApiPlaygroundProps) {
  useEffect(() => {
    const cssId = "sparkify-stoplight-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/@stoplight/elements/styles.min.css";
      document.head.appendChild(link);
    }

    if (scriptLoaded) {
      return;
    }

    void loadScript("https://unpkg.com/@stoplight/elements/web-components.min.js")
      .then(() => {
        scriptLoaded = true;
      })
      .catch(() => {
        // noop; component still renders fallback text
      });
  }, []);

  return (
    <div className="mt-4 rounded-2xl border border-stone-200 overflow-hidden bg-white">
      {/* @ts-expect-error custom element */}
      <elements-api
        apiDescriptionUrl={specUrl}
        router="hash"
        layout="sidebar"
        hideTryIt={!serverUrl && !proxyUrl ? true : undefined}
        tryItCorsProxy={proxyUrl}
      />
    </div>
  );
}
