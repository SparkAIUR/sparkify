import type { NavEntry, NavPage, NavGroup } from '@mintlify/astro/helpers';
import { isNavPage, isNavGroup } from '@mintlify/astro/helpers';
import type { SidebarItemStyle, PageMetaMap } from './types';
import { SideNavItem } from './SideNavItem';
import { SidebarGroupItem } from './SidebarGroupItem';

function Divider() {
  return (
    <div className="px-1 py-3">
      <div className="h-px w-full bg-gray-100" />
    </div>
  );
}

type GroupedEntry =
  | { kind: 'pages'; pages: NavPage[] }
  | { kind: 'group'; group: NavGroup };

function groupEntries(entries: NavEntry[]): GroupedEntry[] {
  const result: GroupedEntry[] = [];

  for (const entry of entries) {
    if (isNavPage(entry)) {
      const last = result[result.length - 1];
      if (last?.kind === 'pages') {
        last.pages.push(entry);
      } else {
        result.push({ kind: 'pages', pages: [entry] });
      }
    } else if (isNavGroup(entry)) {
      result.push({ kind: 'group', group: entry });
    }
  }

  return result;
}

interface SidebarEntriesProps {
  entries: NavEntry[];
  currentPath: string;
  pageMeta?: PageMetaMap;
  sidebarItemStyle?: SidebarItemStyle;
  showDivider?: boolean;
}

function normalizeHref(href: string): string {
  if (href.length > 1 && href.endsWith('/')) {
    return href.slice(0, -1);
  }
  return href;
}

function decorateEntry(entry: NavEntry, pageMeta: PageMetaMap): NavEntry {
  if (isNavPage(entry)) {
    const meta = pageMeta[normalizeHref(entry.href)];
    if (!meta) {
      return entry;
    }
    return {
      ...entry,
      ...(meta.icon ? { icon: meta.icon } : {}),
      ...(meta.api ? { api: meta.api } : {}),
      ...(meta.deprecated ? { deprecated: true } : {})
    };
  }

  if (isNavGroup(entry)) {
    return {
      ...entry,
      pages: entry.pages.map((child) => decorateEntry(child, pageMeta))
    };
  }

  return entry;
}

export function SidebarEntries({
  entries,
  currentPath,
  pageMeta = {},
  sidebarItemStyle,
  showDivider,
}: SidebarEntriesProps) {
  const decoratedEntries = entries.map((entry) => decorateEntry(entry, pageMeta));
  const grouped = groupEntries(decoratedEntries);

  return (
    <>
      {grouped.map((item, i) => {
        const spacingClass =
          i > 0 ? (showDivider ? 'my-2' : 'mt-6 lg:mt-8') : undefined;

        if (item.kind === 'pages') {
          return (
            <ul key={item.pages[0].href} className={spacingClass}>
              {item.pages.map((page) => (
                <SideNavItem
                  key={page.href}
                  page={page}
                  currentPath={currentPath}
                  sidebarItemStyle={sidebarItemStyle}
                />
              ))}
            </ul>
          );
        }

        return (
          <div key={`${item.group.group}-${i}`}>
            {showDivider && i > 0 && <Divider />}
            <div className={spacingClass}>
              <SidebarGroupItem
                group={item.group}
                currentPath={currentPath}
                sidebarItemStyle={sidebarItemStyle}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
