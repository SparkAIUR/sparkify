import { cn } from "@mintlify/components";

interface ApiOperationHeaderProps {
  method: string;
  path: string;
  playgroundHref?: string;
}

const methodColor: Record<string, string> = {
  GET: "text-emerald-700 bg-emerald-100",
  POST: "text-blue-700 bg-blue-100",
  PUT: "text-amber-700 bg-amber-100",
  PATCH: "text-orange-700 bg-orange-100",
  DELETE: "text-red-700 bg-red-100"
};

export default function ApiOperationHeader({ method, path, playgroundHref }: ApiOperationHeaderProps) {
  const upperMethod = method.toUpperCase();
  const badgeClass = methodColor[upperMethod] ?? "text-stone-700 bg-stone-100";
  const pathSegments = path.split(/(\{[^}]+\})/g).filter(Boolean);

  return (
    <div className="mt-5 rounded-2xl border border-stone-200 bg-white px-3 py-2 flex items-center gap-2 flex-wrap">
      <span className={cn("rounded-lg px-2.5 py-1 text-sm font-semibold", badgeClass)}>{upperMethod}</span>
      <code className="text-[1.05rem] text-stone-700 inline-flex items-center gap-1">
        {pathSegments.map((segment, index) =>
          segment.startsWith("{") && segment.endsWith("}") ? (
            <span
              key={`${segment}-${index}`}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-700"
            >
              {segment}
            </span>
          ) : (
            <span key={`${segment}-${index}`}>{segment}</span>
          )
        )}
      </code>
      {playgroundHref ? (
        <a
          href={playgroundHref}
          className="ml-auto rounded-xl bg-emerald-500 px-3 py-1.5 text-white font-semibold text-sm hover:bg-emerald-600"
        >
          Try It
        </a>
      ) : null}
    </div>
  );
}
