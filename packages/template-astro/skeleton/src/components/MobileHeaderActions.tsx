import { useEffect, useRef, useState } from 'react';
import { Icon } from '@mintlify/components';
import { openSearch } from './SearchBar';
import { GitHubPrimaryLink } from './GitHubPrimaryLink';
import { withBase } from '../lib/links';

interface HeaderLink {
  label: string;
  href: string;
}

interface HeaderPrimaryButton {
  type: 'button';
  label: string;
  href: string;
}

interface HeaderPrimaryGithub {
  type: 'github';
  href: string;
  repo?: string;
}

type HeaderPrimary = HeaderPrimaryButton | HeaderPrimaryGithub;

export function MobileActionButtons({
  navbarLinks = [],
  navbarPrimary,
}: {
  navbarLinks?: HeaderLink[];
  navbarPrimary?: HeaderPrimary;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const hasOverflowLinks = navbarLinks.length > 0 || Boolean(navbarPrimary);

  return (
    <div className="flex lg:hidden items-center gap-2 relative" ref={menuRef}>
      <button
        type="button"
        className="text-gray-500 w-8 h-8 flex items-center justify-center hover:text-gray-600"
        onClick={openSearch}
        aria-label="Search"
      >
        <Icon icon="search" iconLibrary="lucide" size={16} color="dimgray" />
      </button>

      {hasOverflowLinks ? (
        <>
          <button
            type="button"
            className="text-gray-500 w-8 h-8 flex items-center justify-center hover:text-gray-600"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <Icon icon="ellipsis-vertical" iconLibrary="lucide" size={16} color="dimgray" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border border-gray-200 bg-white shadow-lg p-2">
              {navbarLinks.map((link) => (
                <a
                  key={link.href}
                  href={withBase(link.href)}
                  className="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              {navbarPrimary?.type === 'button' ? (
                <a
                  href={withBase(navbarPrimary.href)}
                  className="mt-1 block rounded-lg bg-(--primary) px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                  onClick={() => setMenuOpen(false)}
                >
                  {navbarPrimary.label}
                </a>
              ) : navbarPrimary?.type === 'github' ? (
                <GitHubPrimaryLink
                  href={withBase(navbarPrimary.href)}
                  repo={navbarPrimary.repo}
                  className="mt-1 block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  showStars={false}
                  onClick={() => setMenuOpen(false)}
                />
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function MobileNavToggle({
  pageTitle,
  groupName,
}: {
  pageTitle: string;
  groupName?: string;
}) {
  const handleToggle = () => {
    window.dispatchEvent(new CustomEvent('toggle-mobile-sidebar'));
  };

  return (
    <button
      type="button"
      className="flex items-center h-14 py-4 lg:px-[5vw] lg:hidden focus:outline-0 w-full text-left"
      onClick={handleToggle}
    >
      <div className="flex items-center text-gray-500 hover:text-gray-600">
        <span className="sr-only">Navigation</span>
        <Icon icon="menu" iconLibrary="lucide" size={18} />
      </div>
      <div className="ml-4 flex text-sm leading-6 whitespace-nowrap min-w-0 space-x-3 overflow-hidden">
        {groupName && (
          <div className="flex items-center space-x-3 shrink-0">
            <span>{groupName}</span>
            <Icon
              icon="chevron-right"
              iconLibrary="lucide"
              size={16}
              className="text-gray-400"
            />
          </div>
        )}
        <div className="font-semibold text-gray-900 truncate min-w-0 flex-1">
          {pageTitle}
        </div>
      </div>
    </button>
  );
}
