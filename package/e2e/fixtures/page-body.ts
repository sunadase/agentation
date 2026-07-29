// =============================================================================
// Shared fixture page body
// =============================================================================
//
// Every E2E page — legacy React oracle, framework-free browser runtime, React
// lifecycle adapter and Solid lifecycle adapter — renders THIS DOM and nothing
// else. The parity specs compare the four pages against each other, so the
// markup lives in one module: a second copy would let the pages drift and the
// comparison would silently stop meaning anything.
//
// The body is deterministic on purpose. No dates, no random ids, no network
// images, no web fonts, fixed pixel sizes. Anything that could differ between
// two loads would show up as a screenshot diff.
// =============================================================================

/** Ids the specs address. Exported so a typo fails the build, not a test. */
export const IDS = {
  root: "page",
  heading: "page-heading",
  paragraph: "page-paragraph",
  button: "page-button",
  card: "page-card",
  cardTitle: "page-card-title",
  cardBody: "page-card-body",
  cardBadge: "page-card-badge",
  input: "page-input",
  pasteTarget: "page-paste-target",
  cssAnimation: "page-css-animation",
  waapiAnimation: "page-waapi-animation",
  video: "page-video",
  emptyRegion: "page-empty-region",
  shadowHost: "page-shadow-host",
} as const;

/**
 * 640 characters of stable prose. The runtime trims captured selection to 500
 * characters, so the paragraph has to be longer than the limit for the
 * truncation behaviour to be reachable through real text selection.
 */
const PARAGRAPH_TEXT =
  "Agentation collects structured visual feedback for coding agents. " +
  "A reviewer points at a button, types a sentence, and the toolbar turns that " +
  "gesture into a markdown report naming the element, its position, its " +
  "accessible name and the surrounding copy. The report is deterministic: the " +
  "same annotation on the same page always produces the same bytes, which is " +
  "what makes an agent able to act on it without guessing. This paragraph is " +
  "deliberately long so that a selection can exceed the five hundred character " +
  "capture limit and exercise the truncation path end to end, and so that " +
  "nearby-text extraction has something real to find.";

const STYLE = `
  #${IDS.root} {
    box-sizing: border-box;
    width: 900px;
    margin: 0;
    padding: 24px;
    font: 16px/1.5 "DejaVu Sans", "Liberation Sans", Arial, sans-serif;
    color: #111827;
    background: #ffffff;
  }
  #${IDS.root} * { box-sizing: border-box; }
  #${IDS.heading} { margin: 0 0 16px; font-size: 28px; line-height: 34px; }
  #${IDS.paragraph} { margin: 0 0 16px; max-width: 720px; }
  #${IDS.button} {
    display: inline-block;
    height: 40px;
    padding: 0 20px;
    border: 1px solid #1d4ed8;
    border-radius: 6px;
    background: #2563eb;
    color: #ffffff;
    font: inherit;
    cursor: pointer;
  }
  #${IDS.card} {
    margin: 16px 0;
    padding: 16px;
    width: 360px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: #f9fafb;
  }
  #${IDS.cardTitle} { margin: 0 0 8px; font-size: 18px; line-height: 24px; }
  #${IDS.cardBody} { margin: 0; }
  #${IDS.cardBadge} {
    display: inline-block;
    margin-top: 8px;
    padding: 2px 8px;
    border-radius: 999px;
    background: #e5e7eb;
    font-size: 12px;
  }
  #${IDS.input} {
    display: block;
    margin: 16px 0;
    width: 320px;
    height: 36px;
    padding: 0 8px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font: inherit;
  }
  #${IDS.pasteTarget} {
    display: block;
    margin: 16px 0;
    width: 320px;
    height: 72px;
    padding: 8px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font: inherit;
  }
  #${IDS.cssAnimation} {
    width: 48px;
    height: 48px;
    background: #f97316;
    animation: fixture-spin 2s linear infinite;
  }
  @keyframes fixture-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  #${IDS.waapiAnimation} {
    width: 48px;
    height: 48px;
    margin-top: 12px;
    background: #10b981;
  }
  #${IDS.video} {
    display: block;
    margin-top: 12px;
    width: 160px;
    height: 90px;
    background: #111827;
  }
  /* 21x21 clears the runtime's 20x20 minimum for annotating an empty region. */
  #${IDS.emptyRegion} {
    margin-top: 12px;
    width: 21px;
    height: 21px;
    border: 0;
    background: #fef3c7;
  }
  #${IDS.shadowHost} { display: block; margin-top: 12px; }
`;

/**
 * Builds the fixture DOM inside `host`, replacing whatever was there.
 *
 * Returns nothing: the specs address the result by the ids above, never by a
 * handle handed back from here.
 */
export function renderPageBody(host: HTMLElement): void {
  host.id = IDS.root;
  host.replaceChildren();

  const style = document.createElement("style");
  style.textContent = STYLE;

  const heading = document.createElement("h1");
  heading.id = IDS.heading;
  heading.textContent = "Fixture page";

  const paragraph = document.createElement("p");
  paragraph.id = IDS.paragraph;
  paragraph.textContent = PARAGRAPH_TEXT;

  const button = document.createElement("button");
  button.id = IDS.button;
  button.type = "button";
  button.textContent = "Primary action";
  // A real page handler, so the click-blocking / pass-through contract is
  // observable: with blocking on this must never run.
  button.addEventListener("click", () => {
    button.dataset.pageClicks = String(Number(button.dataset.pageClicks ?? "0") + 1);
  });

  const card = document.createElement("section");
  card.id = IDS.card;
  const cardTitle = document.createElement("h2");
  cardTitle.id = IDS.cardTitle;
  cardTitle.textContent = "Nested card";
  const cardBody = document.createElement("p");
  cardBody.id = IDS.cardBody;
  cardBody.textContent = "A card with nested elements inside it.";
  const cardBadge = document.createElement("span");
  cardBadge.id = IDS.cardBadge;
  cardBadge.textContent = "badge";
  card.append(cardTitle, cardBody, cardBadge);

  const input = document.createElement("input");
  input.id = IDS.input;
  input.type = "text";
  input.setAttribute("aria-label", "Page text field");

  const pasteTarget = document.createElement("textarea");
  pasteTarget.id = IDS.pasteTarget;
  pasteTarget.setAttribute("aria-label", "Paste target");

  const cssAnimation = document.createElement("div");
  cssAnimation.id = IDS.cssAnimation;

  const waapi = document.createElement("div");
  waapi.id = IDS.waapiAnimation;
  // Started here rather than from a spec so all four pages animate identically.
  waapi.animate(
    [{ transform: "translateX(0px)" }, { transform: "translateX(120px)" }],
    { duration: 2000, iterations: Infinity },
  );

  const video = document.createElement("video");
  video.id = IDS.video;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;

  const emptyRegion = document.createElement("div");
  emptyRegion.id = IDS.emptyRegion;

  // One nested open shadow root: the runtime pierces it when targeting, so it
  // has to be present on the pages the targeting specs use.
  const shadowHost = document.createElement("div");
  shadowHost.id = IDS.shadowHost;
  const shadow = shadowHost.attachShadow({ mode: "open" });
  const inner = document.createElement("button");
  inner.id = "shadow-button";
  inner.type = "button";
  inner.textContent = "Inside shadow";
  shadow.append(inner);

  host.append(
    style,
    heading,
    paragraph,
    button,
    card,
    input,
    pasteTarget,
    cssAnimation,
    waapi,
    video,
    emptyRegion,
    shadowHost,
  );
}
