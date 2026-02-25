import { useEffect, useMemo, useState } from "react";
import { Icon } from "@mintlify/components";
import searchIndex from "../generated/search-index.json";
import { withBase } from "../lib/links";

const SEARCH_OPEN_EVENT = "open-search";

interface SearchItem {
  id: string;
  href: string;
  title: string;
  content: string;
}

export function openSearch() {
  window.dispatchEvent(new CustomEvent(SEARCH_OPEN_EVENT));
}

function toScore(query: string, item: SearchItem): number {
  const lowerQuery = query.toLowerCase();
  const title = item.title.toLowerCase();
  const content = item.content.toLowerCase();
  if (title === lowerQuery) {
    return 100;
  }
  if (title.startsWith(lowerQuery)) {
    return 80;
  }
  if (title.includes(lowerQuery)) {
    return 60;
  }
  if (content.includes(lowerQuery)) {
    return 25;
  }
  return 0;
}

export function SearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    const onOpen = () => setOpen(true);

    window.addEventListener("keydown", onKey);
    window.addEventListener(SEARCH_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SEARCH_OPEN_EVENT, onOpen);
    };
  }, []);

  const items = useMemo(() => {
    const list = searchIndex as SearchItem[];
    if (!query.trim()) {
      return list.slice(0, 8);
    }

    return list
      .map((item) => ({ item, score: toScore(query, item) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 12)
      .map((entry) => entry.item);
  }, [query]);

  return (
    <>
      <button
        type="button"
        className="w-full rounded-[1rem] border border-gray-200 bg-white/85 h-10 px-4 text-sm text-gray-500 flex items-center justify-between gap-3 hover:text-gray-700 hover:border-gray-300"
        onClick={() => setOpen(true)}
        aria-label="Search"
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <Icon icon="search" iconLibrary="lucide" size={15} color="currentColor" />
          <span className="truncate">Search...</span>
        </span>
        <span className="text-xs text-gray-400">⌘K</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[90]">
          <div className="absolute inset-0 bg-black/25" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 top-[12vh] -translate-x-1/2 w-[min(40rem,92vw)] rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-3 py-2.5">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search docs"
                className="w-full bg-transparent px-2 py-2 outline-none text-gray-900"
              />
            </div>
            <ul className="max-h-[60vh] overflow-y-auto px-2 py-2">
              {items.map((item) => (
                <li key={item.id}>
                  <a
                    href={withBase(item.href)}
                    className="block rounded-lg px-3 py-2 hover:bg-gray-50"
                    onClick={() => setOpen(false)}
                  >
                    <p className="m-0 text-sm font-medium text-gray-900">{item.title}</p>
                    {item.content ? (
                      <p className="m-0 mt-0.5 text-xs text-gray-500 line-clamp-2">{item.content}</p>
                    ) : null}
                  </a>
                </li>
              ))}
              {items.length === 0 && (
                <li className="px-3 py-4 text-sm text-gray-500">No matches found.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
