const SCHEME_PREFIX = /^[A-Za-z][A-Za-z\d+\-.]*:/;

export function normalizeBaseUrl(baseUrl: string | undefined): string {
  const raw = (baseUrl ?? "/").trim();
  if (!raw || raw === "/") {
    return "/";
  }

  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function splitPathAndSuffix(href: string): { path: string; suffix: string } {
  const queryIndex = href.indexOf("?");
  const hashIndex = href.indexOf("#");
  let splitIndex = -1;

  if (queryIndex === -1) {
    splitIndex = hashIndex;
  } else if (hashIndex === -1) {
    splitIndex = queryIndex;
  } else {
    splitIndex = Math.min(queryIndex, hashIndex);
  }

  if (splitIndex === -1) {
    return { path: href, suffix: "" };
  }

  return {
    path: href.slice(0, splitIndex),
    suffix: href.slice(splitIndex)
  };
}

function isExternalHref(href: string): boolean {
  if (href.startsWith("//")) {
    return true;
  }
  return SCHEME_PREFIX.test(href);
}

export function withBaseUrl(baseUrl: string | undefined, href: string | undefined): string {
  const base = normalizeBaseUrl(baseUrl);
  const basePrefix = base === "/" ? "" : base.slice(0, -1);
  const rawHref = (href ?? "").trim();

  if (!rawHref || rawHref === "." || rawHref === "./" || rawHref === "index" || rawHref === "/") {
    return base;
  }

  if (rawHref.startsWith("#")) {
    return rawHref;
  }

  if (rawHref.startsWith("?")) {
    return `${base}${rawHref}`;
  }

  if (isExternalHref(rawHref)) {
    return rawHref;
  }

  const { path, suffix } = splitPathAndSuffix(rawHref);
  const normalizedPath = path.replace(/^\.\//, "").replace(/^\/+/, "");

  if (!normalizedPath || normalizedPath === "index") {
    return `${base}${suffix}`;
  }

  const absolutePath = `/${normalizedPath}`;
  if (basePrefix && (absolutePath === basePrefix || absolutePath.startsWith(`${basePrefix}/`))) {
    return `${absolutePath}${suffix}`;
  }

  return `${basePrefix}${absolutePath}${suffix}`;
}

export function withBase(href: string | undefined): string {
  return withBaseUrl(import.meta.env.BASE_URL, href);
}
