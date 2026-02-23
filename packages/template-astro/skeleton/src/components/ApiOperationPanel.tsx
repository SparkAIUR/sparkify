import { useMemo } from "react";
import { Icon } from "@mintlify/components";

export interface ApiOperationInfo {
  method: string;
  path: string;
  summary: string;
  serverUrl?: string;
  responseStatus?: string;
  responseExample?: string;
}

interface ApiOperationPanelProps {
  operation: ApiOperationInfo;
  variant?: "sidebar" | "inline";
}

function buildCurl(operation: ApiOperationInfo): string {
  const base = operation.serverUrl ?? "https://api.example.com";
  return [
    `curl --request ${operation.method.toUpperCase()} \\`,
    `  --url ${base}${operation.path}`
  ].join("\n");
}

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // ignore clipboard failures
  }
}

export default function ApiOperationPanel({
  operation,
  variant = "sidebar"
}: ApiOperationPanelProps) {
  const curl = useMemo(() => buildCurl(operation), [operation]);
  const response = operation.responseExample ?? "{}";
  const statusCode = operation.responseStatus ?? "200";
  const topSectionClass =
    variant === "sidebar"
      ? "shrink-0 rounded-2xl border border-stone-200 bg-white overflow-hidden"
      : "rounded-2xl border border-stone-200 bg-white overflow-hidden";
  const bottomSectionClass =
    variant === "sidebar"
      ? "min-h-0 flex-1 flex flex-col rounded-2xl border border-stone-200 bg-white overflow-hidden"
      : "rounded-2xl border border-stone-200 bg-white overflow-hidden";
  const bottomBodyClass =
    variant === "sidebar"
      ? "bg-white px-4 py-4 overflow-x-auto overflow-y-auto min-h-0"
      : "bg-white px-4 py-4 overflow-x-auto";

  const panelContent = (
    <>
      <section className={topSectionClass}>
        <header className="h-11 border-b border-stone-200 bg-stone-50/80 px-4 flex items-center justify-between">
          <p className="m-0 text-sm font-medium text-stone-700 truncate">{operation.summary}</p>
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <Icon icon="file-code-2" iconLibrary="lucide" size={12} />
            <span>cURL</span>
            <button
              type="button"
              onClick={() => copy(curl)}
              className="ml-1 p-1 rounded hover:bg-stone-200/60"
              aria-label="Copy cURL example"
            >
              <Icon icon="copy" iconLibrary="lucide" size={15} />
            </button>
          </div>
        </header>
        <div className="bg-white px-4 py-4 overflow-x-auto">
          <pre className="m-0 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm leading-6">
            <code>{curl}</code>
          </pre>
        </div>
      </section>

      <section className={bottomSectionClass}>
        <header className="h-11 border-b border-stone-200 bg-stone-50/80 px-4 flex items-center justify-between">
          <span className="text-sm font-medium text-(--primary) border-b-2 border-(--primary) pb-1">{statusCode}</span>
          <button
            type="button"
            onClick={() => copy(response)}
            className="p-1 rounded hover:bg-stone-200/60"
            aria-label="Copy response example"
          >
            <Icon icon="copy" iconLibrary="lucide" size={15} />
          </button>
        </header>
        <div className={bottomBodyClass}>
          <pre className="m-0 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm leading-6">
            <code>{response}</code>
          </pre>
        </div>
      </section>
    </>
  );

  if (variant === "inline") {
    return <div className="xl:hidden mt-4 space-y-4">{panelContent}</div>;
  }

  return (
    <aside className="hidden xl:flex w-[28rem] shrink-0 sticky top-32 h-[calc(100vh-9rem)] flex-col gap-5">
      {panelContent}
    </aside>
  );
}
