// =============================================================================
// keyboard-scroll — PR #48
// =============================================================================
// Mobile browsers auto-scroll a focused <input> into view, but only when the
// input is inside the WINDOW scroller. Our app uses a nested scroll container
// (<main className="overflow-auto">), so when the on-screen keyboard slides
// up it covers the input and any typeahead suggestions underneath it.
//
// This hook listens for focusin on any editable element and:
//   1. Waits for the soft keyboard to finish animating (visualViewport resize).
//   2. Scrolls the focused element into view inside the nearest scrollable
//      ancestor, with enough room above the keyboard for the input + ~180px
//      of space underneath (room for typeahead suggestion rows).
//
// One global listener, attached once at app mount. No per-component changes.
// =============================================================================

const TEXT_INPUT_TYPES = new Set([
  "text",
  "email",
  "search",
  "tel",
  "url",
  "password",
  "number",
  "time",
  "date",
  "datetime-local",
  "month",
  "week",
]);

function isEditable(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type);
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

// Space we want visible UNDER the focused input — room for a typeahead
// suggestion popover. 180px fits ~3 suggestion rows + Add-new fallback.
const SUGGESTION_HEADROOM = 180;

// Margin we want ABOVE the input from the top of the visible viewport — gives
// the user a sense the input is "centered" rather than glued to the top.
const TOP_MARGIN = 24;

function scrollFocusedIntoView(el: HTMLElement) {
  // Use visualViewport when available (covers soft-keyboard insets correctly).
  const vv = (window as Window & { visualViewport?: VisualViewport }).visualViewport;
  const viewportTop = vv ? vv.offsetTop : 0;
  const viewportHeight = vv ? vv.height : window.innerHeight;
  const visibleBottom = viewportTop + viewportHeight;

  const rect = el.getBoundingClientRect();
  const desiredBottom = visibleBottom - SUGGESTION_HEADROOM;
  const desiredTop = viewportTop + TOP_MARGIN;

  let scrollDelta = 0;
  if (rect.bottom > desiredBottom) {
    // Input is covered by keyboard (or its suggestion area would be). Push up.
    scrollDelta = rect.bottom - desiredBottom;
  } else if (rect.top < desiredTop) {
    // Input is hidden above the viewport (rare on focus, possible on rotate).
    scrollDelta = rect.top - desiredTop;
  } else {
    return; // Already in a good spot.
  }

  // Walk up to the nearest scrollable ancestor and scroll it. We avoid
  // window.scrollBy because our scroller is <main className="overflow-auto">,
  // not the window.
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    const canScrollY =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight;
    if (canScrollY) {
      node.scrollBy({ top: scrollDelta, behavior: "smooth" });
      return;
    }
    node = node.parentElement;
  }
  // Fallback: window scroll. Shouldn't hit in our layout but safe.
  window.scrollBy({ top: scrollDelta, behavior: "smooth" });
}

let installed = false;

export function installKeyboardScroll(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  let pendingTarget: HTMLElement | null = null;
  let pendingTimer: number | null = null;

  function schedule(target: HTMLElement) {
    pendingTarget = target;
    if (pendingTimer != null) window.clearTimeout(pendingTimer);
    // Wait for the soft keyboard's slide-up animation. 300ms covers iOS Safari
    // (~250ms) and Android Chrome (~150ms) with a safety margin.
    pendingTimer = window.setTimeout(() => {
      pendingTimer = null;
      if (
        pendingTarget &&
        document.activeElement === pendingTarget &&
        document.body.contains(pendingTarget)
      ) {
        scrollFocusedIntoView(pendingTarget);
      }
      pendingTarget = null;
    }, 300);
  }

  document.addEventListener(
    "focusin",
    (e) => {
      const t = e.target;
      if (isEditable(t as Element)) schedule(t as HTMLElement);
    },
    { capture: true },
  );

  // Re-scroll when the visual viewport itself changes size (keyboard appears
  // or rotates). The focusin timer covers the FIRST keyboard show; this
  // handles subsequent resizes (autocorrect suggestions opening, etc.) while
  // the same input stays focused.
  const vv = (window as Window & { visualViewport?: VisualViewport }).visualViewport;
  if (vv) {
    vv.addEventListener("resize", () => {
      const active = document.activeElement;
      if (isEditable(active as Element)) {
        scrollFocusedIntoView(active as HTMLElement);
      }
    });
  }
}
