// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CopyMarkdownWidget from "../../skeleton/src/components/CopyMarkdownWidget";

const MATCH_MEDIA_QUERY = "(hover: none), (pointer: coarse)";

function setMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => {
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      } satisfies MediaQueryList;
    })
  );
}

function dispatchMouseOver(element: Element, relatedTarget?: EventTarget | null) {
  element.dispatchEvent(
    new MouseEvent("mouseover", {
      bubbles: true,
      relatedTarget: (relatedTarget ?? null) as Node | null
    })
  );
}

function dispatchMouseOut(element: Element, relatedTarget?: EventTarget | null) {
  element.dispatchEvent(
    new MouseEvent("mouseout", {
      bubbles: true,
      relatedTarget: (relatedTarget ?? null) as Node | null
    })
  );
}

describe("CopyMarkdownWidget interactions", () => {
  let container: HTMLDivElement;
  let root: Root;
  let clipboardWriteMock: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  function renderWidget(touchMode: boolean) {
    setMatchMedia(touchMode);
    root = createRoot(container);

    act(() => {
      root.render(
        createElement(CopyMarkdownWidget, {
          currentPath: "/",
          baseUrl: "/",
          siteName: "Fixture Site",
          llmsIndex: {
            enabled: true,
            siteMarkdownPath: "/llms-full.txt",
            pageMarkdownByPath: { "/": "/index.html.md" },
            pageTitleByPath: { "/": "Home" }
          }
        })
      );
    });
  }

  function getWidget() {
    return container.querySelector('[data-testid="copy-markdown-widget"]') as HTMLDivElement | null;
  }

  function getTrigger() {
    return container.querySelector('[data-testid="copy-markdown-trigger"]') as HTMLButtonElement | null;
  }

  function getPanel() {
    return container.querySelector('[data-testid="copy-markdown-panel"]') as HTMLDivElement | null;
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

    container = document.createElement("div");
    document.body.appendChild(container);

    clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWriteMock }
    });

    fetchMock = vi.fn().mockResolvedValue(
      new Response("# fixture markdown\n", {
        status: 200
      })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("opens on hover enter", () => {
    renderWidget(false);
    const trigger = getTrigger();
    expect(trigger).not.toBeNull();

    act(() => {
      dispatchMouseOver(trigger!);
    });

    expect(getPanel()).not.toBeNull();
  });

  it("does not close immediately on hover leave and closes after the grace delay", () => {
    vi.useFakeTimers();
    renderWidget(false);
    const trigger = getTrigger();
    const widget = getWidget();
    expect(trigger).not.toBeNull();
    expect(widget).not.toBeNull();

    act(() => {
      dispatchMouseOver(trigger!);
    });
    expect(getPanel()).not.toBeNull();

    act(() => {
      dispatchMouseOut(widget!, document.body);
    });
    expect(getPanel()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(getPanel()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(getPanel()).toBeNull();
  });

  it("keeps the menu open when pointer transfers to the expanded panel before timeout", () => {
    vi.useFakeTimers();
    renderWidget(false);
    const trigger = getTrigger();
    const widget = getWidget();
    expect(trigger).not.toBeNull();
    expect(widget).not.toBeNull();

    act(() => {
      dispatchMouseOver(trigger!);
      dispatchMouseOut(widget!, document.body);
    });

    act(() => {
      vi.advanceTimersByTime(75);
    });

    const bridge = container.querySelector('[data-testid="copy-markdown-hover-bridge"]') as HTMLDivElement | null;
    expect(bridge).not.toBeNull();

    act(() => {
      dispatchMouseOver(bridge!);
      vi.advanceTimersByTime(200);
    });

    expect(getPanel()).not.toBeNull();
  });

  it("closes after leaving the widget entirely", () => {
    vi.useFakeTimers();
    renderWidget(false);
    const trigger = getTrigger();
    const widget = getWidget();
    expect(trigger).not.toBeNull();
    expect(widget).not.toBeNull();

    act(() => {
      dispatchMouseOver(trigger!);
    });
    expect(getPanel()).not.toBeNull();

    act(() => {
      dispatchMouseOut(widget!, document.body);
      vi.advanceTimersByTime(160);
    });

    expect(getPanel()).toBeNull();
  });

  it("keeps actions clickable after hover transfer", async () => {
    vi.useFakeTimers();
    renderWidget(false);
    const trigger = getTrigger();
    const widget = getWidget();
    expect(trigger).not.toBeNull();
    expect(widget).not.toBeNull();

    act(() => {
      dispatchMouseOver(trigger!);
      dispatchMouseOut(widget!, document.body);
      vi.advanceTimersByTime(75);
    });

    const bridge = container.querySelector('[data-testid="copy-markdown-hover-bridge"]') as HTMLDivElement | null;
    expect(bridge).not.toBeNull();

    act(() => {
      dispatchMouseOver(bridge!);
    });

    const pageAction = container.querySelector('[data-testid="copy-markdown-page-action"]') as HTMLButtonElement | null;
    expect(pageAction).not.toBeNull();

    await act(async () => {
      pageAction!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/index.html.md", { cache: "no-store" });
    expect(clipboardWriteMock).toHaveBeenCalledWith("# fixture markdown\n");
  });

  it("uses click-to-toggle behavior for touch pointers", () => {
    renderWidget(true);
    expect((window.matchMedia as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(MATCH_MEDIA_QUERY);

    const trigger = getTrigger();
    expect(trigger).not.toBeNull();
    expect(getPanel()).toBeNull();

    act(() => {
      trigger!.click();
    });
    expect(getPanel()).not.toBeNull();

    act(() => {
      trigger!.click();
    });
    expect(getPanel()).toBeNull();
  });
});
