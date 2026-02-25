import type { FocusEvent } from "react";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@mintlify/components";

interface LlmsIndexMeta {
  enabled: boolean;
  siteMarkdownPath: string;
  pageMarkdownByPath: Record<string, string>;
  pageTitleByPath: Record<string, string>;
}

interface CopyMarkdownWidgetProps {
  currentPath: string;
  baseUrl: string;
  siteName: string;
  llmsIndex: LlmsIndexMeta;
}

type CopyState = "idle" | "loading-page" | "loading-site" | "success-page" | "success-site" | "error";
const HOVER_CLOSE_DELAY_MS = 150;

function normalizeCurrentPath(pathValue: string): string {
  if (!pathValue || pathValue === "/") {
    return "/";
  }

  const trimmed = pathValue.trim();
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return normalized.replace(/\/+$/, "") || "/";
}

function toLlmsMarkdownPathFromHref(href: string): string {
  if (href === "/" || href.length === 0) {
    return "/index.html.md";
  }

  return `${href.replace(/\/+$/, "")}/index.html.md`;
}

function withBase(baseUrl: string, href: string): string {
  const normalizedBase = baseUrl === "/" ? "" : baseUrl.replace(/\/+$/, "");
  const normalizedHref = href.startsWith("/") ? href : `/${href}`;
  return `${normalizedBase}${normalizedHref}`;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

async function fetchMarkdown(url: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load markdown from ${url}`);
  }
  return response.text();
}

export default function CopyMarkdownWidget({
  currentPath,
  baseUrl,
  siteName,
  llmsIndex
}: CopyMarkdownWidgetProps) {
  const [expanded, setExpanded] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isTouchPointer, setIsTouchPointer] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [message, setMessage] = useState("Paste into your AI tool or notes.");
  const closeTimerRef = useRef<number | null>(null);
  const panelId = useId();

  const normalizedCurrentPath = useMemo(() => normalizeCurrentPath(currentPath), [currentPath]);
  const pageMarkdownPath =
    llmsIndex.pageMarkdownByPath[normalizedCurrentPath] ?? toLlmsMarkdownPathFromHref(normalizedCurrentPath);

  const open = hovered || expanded || focusWithin;
  const isBusy = copyState === "loading-page" || copyState === "loading-site";

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleHoverClose() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setHovered(false);
      closeTimerRef.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  }

  function onMouseEnter() {
    clearCloseTimer();
    setHovered(true);
  }

  function onMouseLeave() {
    scheduleHoverClose();
  }

  function onTriggerClick() {
    if (!isTouchPointer) {
      return;
    }
    clearCloseTimer();
    setExpanded((value) => !value);
  }

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(hover: none), (pointer: coarse)");
    const updateTouchPointer = () => setIsTouchPointer(mediaQuery.matches);
    updateTouchPointer();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateTouchPointer);
      return () => {
        mediaQuery.removeEventListener("change", updateTouchPointer);
      };
    }

    mediaQuery.addListener(updateTouchPointer);
    return () => {
      mediaQuery.removeListener(updateTouchPointer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isTouchPointer) {
      setExpanded(false);
    }
  }, [isTouchPointer]);

  async function copyPageMarkdown() {
    try {
      setCopyState("loading-page");
      setMessage("Preparing current page markdown...");
      const markdown = await fetchMarkdown(withBase(baseUrl, pageMarkdownPath));
      await copyText(markdown);
      setCopyState("success-page");
      setMessage(`Copied page markdown (${llmsIndex.pageTitleByPath[normalizedCurrentPath] ?? normalizedCurrentPath}).`);
    } catch {
      setCopyState("error");
      setMessage("Failed to copy page markdown.");
    }
  }

  async function copySiteMarkdown() {
    try {
      setCopyState("loading-site");
      setMessage("Preparing full-site markdown...");
      const target = llmsIndex.siteMarkdownPath || "/llms-full.txt";
      const markdown = await fetchMarkdown(withBase(baseUrl, target));
      await copyText(markdown);
      setCopyState("success-site");
      setMessage(`Copied full-site markdown for ${siteName}.`);
    } catch {
      setCopyState("error");
      setMessage("Failed to copy site markdown.");
    }
  }

  function onBlurCapture(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocusWithin(false);
      setExpanded(false);
    }
  }

  return (
    <div
      data-testid="copy-markdown-widget"
      className="relative pointer-events-auto"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={onBlurCapture}
    >
      <button
        type="button"
        data-testid="copy-markdown-trigger"
        onClick={onTriggerClick}
        className="h-12 w-12 rounded-full border border-gray-200 bg-white text-gray-700 shadow-lg hover:text-gray-900"
        aria-label="Open markdown copy tools"
        aria-controls={panelId}
        aria-expanded={open}
      >
        <span className="inline-flex items-center justify-center gap-1 text-xs font-semibold">
          <Icon icon="bot" iconLibrary="lucide" size={14} />
          MD
        </span>
      </button>

      {open && (
        <div className="absolute bottom-12 right-0 w-72 pb-2" data-testid="copy-markdown-hover-bridge">
          <div
            id={panelId}
            data-testid="copy-markdown-panel"
            className="rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl"
          >
            <p className="m-0 text-sm font-semibold text-gray-900">LLM Markdown</p>
            <p className="mt-1 mb-3 text-xs text-gray-500">{message}</p>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                data-testid="copy-markdown-page-action"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => void copyPageMarkdown()}
                disabled={isBusy}
              >
                Copy Page as Markdown
              </button>
              <button
                type="button"
                data-testid="copy-markdown-site-action"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => void copySiteMarkdown()}
                disabled={isBusy}
              >
                Copy Site as Markdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
