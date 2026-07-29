// =============================================================================
// Settings region
// =============================================================================
//
// Port of `components/page-toolbar-css/settings-panel` plus the three React
// components it composed (`Switch`, `Checkbox`, `HelpTooltip`). Two pages slide
// horizontally inside one retained container; `update()` only flips classes,
// attributes, text nodes and inline placement, so CSS transitions, the caret in
// the webhook field and the entrance animations all survive a re-render.
//
// Deliberate departures from the oracle, each forced or required:
//
//  * "React Components" became "Component Metadata": the native runtime accepts
//    any number of metadata adapters and must not name one framework. The help
//    text lists whatever `model.metadataAdapterIds` reports.
//  * The React `key` swaps that replayed the cycle-label and theme-icon
//    animations are reproduced with two retained slots each — toggling `hidden`
//    restarts a CSS animation without touching `innerHTML`.
//  * The webhook `<textarea>` became a labelled `<input type="url">` inside a
//    field wrapper of the original dimensions, with inline validity feedback.
// =============================================================================

import { OUTPUT_DETAIL_OPTIONS } from "../../utils/generate-output";
import type { RuntimeEnvironment } from "../environment";
import type { AgentationConfig } from "../types";
import { createIcon } from "./icons";
import { ACCENT_OPTIONS } from "./model";
import type { RuntimeViewModel, ViewDispatch, ViewRegion } from "./model";

/** Original hover delays of the shared `Tooltip` portal. */
const HELP_SHOW_DELAY = 500;
const HELP_HIDE_DELAY = 150;

/** The original tooltip sat 8 px to the left of its trigger, vertically centred. */
const HELP_GAP = 8;

/**
 * A dragged toolbar this close to the top of the viewport leaves no room above
 * it, so the panel drops below instead.
 */
const NEAR_BOTTOM_THRESHOLD = 230;

const WORDMARK_VIEW_BOX = "0 0 676 151";

/** Copied verbatim from the oracle's header SVG. */
const WORDMARK_PATH = "M79.6666 100.561L104.863 15.5213C107.828 4.03448 99.1201 -3.00582 88.7449 1.25541L3.52015 39.6065C1.48217 40.5329 0 42.7562 0 45.1647C0 48.6848 2.77907 51.4639 6.29922 51.4639C7.22558 51.4639 8.15193 51.2786 9.07829 50.9081L93.7472 12.7422C97.2674 11.0748 93.7472 8.29572 92.6356 12.1864L67.624 97.2259C66.5123 100.931 69.4767 105.193 73.7379 105.193C76.517 105.193 79.1108 103.155 79.6666 100.561ZM663.641 100.005C665.679 107.231 677.537 104.081 675.499 96.8553L666.05 66.2856C663.456 57.7631 655.489 55.7251 648.82 61.098L618.991 86.6654C617.324 87.9623 621.029 89.815 621.214 88.1476L625.846 61.6538C626.958 55.3546 624.179 50.5375 615.841 50.5375L579.158 51.0934C576.008 51.0934 578.417 53.8724 578.417 57.022C578.417 60.1716 580.825 61.6538 583.975 61.6538L616.212 60.9127C616.397 60.9127 614.544 59.6158 614.544 59.8011L609.727 88.7034C607.875 99.6344 617.694 102.784 626.031 95.7437L655.86 70.1763L654.192 69.6205L663.641 100.005ZM571.191 89.0739C555.443 88.7034 562.298 61.4685 578.787 61.8391C594.72 62.0243 587.124 89.2592 571.191 89.0739ZM571.006 100.375C601.575 100.931 611.024 51.6492 579.158 51.0934C547.847 50.5375 540.065 99.8197 571.006 100.375ZM521.909 46.4616C525.985 46.4616 529.505 42.9414 529.505 38.6802C529.505 34.4189 525.985 31.0841 521.909 31.0841C517.833 31.0841 514.127 34.6042 514.127 38.6802C514.127 42.7562 517.648 46.4616 521.909 46.4616ZM472.256 103.525C493.192 103.71 515.98 73.3259 519.13 62.3949L509.866 60.9127C505.234 73.3259 497.638 101.672 519.871 102.043C536.545 102.228 552.479 85.3685 563.595 70.1763C564.151 69.2499 564.706 68.1383 564.706 66.8414C564.706 63.6918 563.965 61.098 560.816 61.098C558.963 61.098 557.296 62.0243 556.184 63.5065C546.365 77.0313 530.802 90.9266 522.094 90.7414C511.904 90.5561 517.462 71.4732 519.871 64.9887C523.391 55.7251 512.831 53.5019 509.681 60.9127C506.531 68.6941 488.19 92.4088 475.035 92.2235C467.439 92.0383 464.29 83.8863 472.441 59.9864L486.707 17.7445C487.634 14.4097 485.41 10.519 481.334 10.519C478.741 10.519 476.517 12.1864 475.962 14.4097L461.696 56.4662C451.506 86.4801 455.211 103.155 472.256 103.525ZM447.43 42.5709L496.527 41.4593C499.306 41.4593 501.529 39.0507 501.529 36.2717C501.529 33.3073 499.306 31.0841 496.341 31.0841L447.245 32.1957C444.466 32.1957 442.242 34.4189 442.242 37.3833C442.242 40.1624 444.466 42.5709 447.43 42.5709ZM422.974 106.304C435.387 106.489 457.249 94.8173 472.441 53.8724C473.553 50.7228 472.071 48.3143 468.365 48.3143C466.142 48.3143 464.29 49.6112 463.548 51.6492C450.394 87.2212 431.682 96.1142 424.456 95.929C419.454 95.929 417.972 93.3352 418.713 85.5538C419.454 78.1429 410.376 74.9933 406.114 81.1073C401.297 87.777 394.442 94.2615 385.549 94.0763C370.172 93.891 376.471 67.0267 399.815 67.3972C408.338 67.5825 414.452 71.4732 417.045 76.6608C417.786 78.3282 419.454 79.6251 421.492 79.6251C424.271 79.6251 426.679 77.2166 426.679 74.4375C426.679 73.6964 426.494 72.9553 426.124 72.2143C421.862 63.6918 412.414 57.3926 400 57.2073C363.502 56.6515 353.497 104.451 383.326 104.822C397.036 105.193 410.005 94.0763 413.34 85.9243C412.599 86.8507 408.338 86.6654 408.523 84.4422C407.411 97.4111 410.931 106.119 422.974 106.304ZM335.897 104.266C335.897 115.012 347.569 117.606 347.569 103.34C347.569 89.0739 358.5 54.4282 361.464 45.1647L396.666 43.6825C405.929 43.1267 404.262 33.1221 397.036 33.3073L364.984 34.4189L368.875 22.7469C369.801 20.1531 370.542 17.9298 370.542 16.2624C370.542 13.4833 368.504 11.8159 365.911 11.8159C362.946 11.8159 360.352 12.7422 357.573 21.0794L352.942 35.16L330.153 36.0864C326.263 36.4569 323.483 38.1244 323.483 41.6445C323.483 45.5352 326.448 47.0174 330.709 46.8321L349.421 45.9058C345.901 56.6515 335.897 90.7414 335.897 104.266ZM186.939 78.6988C193.979 56.4662 212.877 54.984 212.877 62.9507C212.877 68.3236 203.984 77.0313 186.939 78.6988ZM113.942 150.955C142.844 152.437 159.704 111.492 160.63 80.5515C161.556 73.3259 153.96 70.3616 148.773 75.7344C141.918 83.1453 129.505 93.1499 119.685 93.1499C103.011 93.1499 116.165 59.8011 143.956 59.8011C149.514 59.8011 153.59 61.6538 156.184 64.0623C160.815 68.3236 170.82 62.0243 165.818 56.0957C161.927 51.4639 155.072 48.129 144.882 48.129C102.455 48.129 83.7426 105.007 116.721 105.007C134.692 105.007 151.367 88.3329 155.257 82.7747C154.516 83.5158 149.329 81.2925 149.699 79.4398L149.143 83.5158C148.958 107.045 134.322 141.506 116.536 139.838C113.386 139.468 112.089 137.43 112.089 134.836C112.089 128.907 122.094 119.273 145.067 113.53C159.518 109.824 152.293 101.487 143.4 104.081C111.163 113.53 99.6759 127.425 99.6759 137.8C99.6759 145.026 105.605 150.584 113.942 150.955ZM194.72 109.454C214.359 109.454 239 95.3732 251.228 77.9577C250.301 82.96 246.596 96.8553 246.596 101.487C246.596 110.01 254.748 109.454 261.232 102.784L288.097 75.5491L290.32 85.7391C293.284 99.4491 299.213 104.822 308.847 104.822C326.263 104.822 342.196 85.7391 349.421 74.8081L344.049 63.6918C339.787 74.8081 321.631 92.5941 311.626 92.5941C306.994 92.5941 304.771 89.815 303.289 83.7011L300.325 71.2879C297.916 60.7275 289.023 58.3189 279.018 68.1383L261.788 84.8127L264.382 69.991C266.235 59.2453 255.674 58.1337 250.116 65.915C241.779 77.0313 216.767 97.7817 196.387 97.7817C187.865 97.7817 185.456 93.7057 185.456 88.3329C230.848 84.998 239.185 47.2027 208.986 47.2027C172.858 47.2027 157.11 109.454 194.72 109.454Z";

/** The oracle's `isValidUrl`: trimmed, http(s) only, never throws. */
function isValidUrl(environment: RuntimeEnvironment, value: string): boolean {
  if (!value || !value.trim()) return false;

  try {
    const url = new environment.window.URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

type HelpTooltip = {
  readonly trigger: HTMLButtonElement;
  /**
   * Visually hidden `aria-describedby` target. The floating bubble is decorative
   * (`aria-hidden`) because it is display-toggled, and assistive technology
   * ignores a hidden description.
   */
  readonly description: HTMLElement;
  setContent(text: string): void;
  hideNow(): void;
  destroy(): void;
};

type SwitchControl = {
  readonly container: HTMLDivElement;
  readonly input: HTMLInputElement;
};

type CheckboxControl = {
  readonly container: HTMLDivElement;
  readonly input: HTMLInputElement;
};

type CheckboxField = {
  readonly root: HTMLDivElement;
  readonly input: HTMLInputElement;
};

export function createSettingsRegion(
  environment: RuntimeEnvironment,
  dispatch: ViewDispatch,
): ViewRegion {
  const listeners = new environment.AbortController();

  // The root reproduces the toolbar's fixed placement box; the toolbar's drag
  // handler ignores pointerdowns that `closest()` this attribute.
  const root = environment.createElement("div", "ag-settings");
  root.setAttribute("data-agentation-ui", "settings");
  root.setAttribute("data-agentation-settings-panel", "");

  const panel = environment.createElement("div", "ag-settings-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Agentation settings");

  const container = environment.createElement("div", "ag-settings-container");
  const mainPage = environment.createElement("div", "ag-settings-page");
  const automationsPage = environment.createElement(
    "div",
    "ag-settings-page ag-settings-automations-page",
  );

  // ---------------------------------------------------------------------------
  // Small builders
  // ---------------------------------------------------------------------------

  let helpCount = 0;
  const helps: HelpTooltip[] = [];

  function createHelp(content: string): HelpTooltip {
    helpCount += 1;
    const id = `agentation-help-${helpCount}`;

    const trigger = environment.createElement("button", "ag-settings-help");
    trigger.type = "button";
    trigger.setAttribute("aria-label", "Help");
    trigger.setAttribute("aria-describedby", id);
    const icon = createIcon(environment, "help");
    icon.classList.add("ag-settings-help-icon");
    trigger.append(icon);

    const description = environment.createElement("span", "ag-visually-hidden");
    description.id = id;
    const descriptionText = environment.document.createTextNode(content);
    description.append(descriptionText);

    // A child of the root, not of the panel: the panel clips and blurs its own
    // subtree, which would swallow a fixed-position bubble.
    const bubble = environment.createElement("div", "ag-settings-tooltip");
    bubble.setAttribute("aria-hidden", "true");
    bubble.hidden = true;
    const bubbleText = environment.document.createTextNode(content);
    bubble.append(bubbleText);
    root.append(bubble);

    let showTimer: number | undefined;
    let hideTimer: number | undefined;

    const show = (): void => {
      environment.timers.clearTimeout(hideTimer);
      hideTimer = undefined;
      bubble.hidden = false;
      // Measured on every show: the panel can be dragged between hovers.
      const rect = trigger.getBoundingClientRect();
      bubble.style.top = `${rect.top + rect.height / 2}px`;
      bubble.style.right = `${environment.innerWidth - rect.left + HELP_GAP}px`;
      environment.timers.clearTimeout(showTimer);
      showTimer = environment.timers.setTimeout(() => {
        showTimer = undefined;
        bubble.classList.add("is-visible");
      }, HELP_SHOW_DELAY);
    };

    const hide = (): void => {
      environment.timers.clearTimeout(showTimer);
      showTimer = undefined;
      bubble.classList.remove("is-visible");
      environment.timers.clearTimeout(hideTimer);
      hideTimer = environment.timers.setTimeout(() => {
        hideTimer = undefined;
        bubble.hidden = true;
      }, HELP_HIDE_DELAY);
    };

    const clearTimers = (): void => {
      environment.timers.clearTimeout(showTimer);
      environment.timers.clearTimeout(hideTimer);
      showTimer = undefined;
      hideTimer = undefined;
    };

    trigger.addEventListener("pointerenter", show, {
      signal: listeners.signal,
    });
    trigger.addEventListener("pointerleave", hide, { signal: listeners.signal });
    trigger.addEventListener("focus", show, { signal: listeners.signal });
    trigger.addEventListener("blur", hide, { signal: listeners.signal });

    const help: HelpTooltip = {
      trigger,
      description,
      setContent(text) {
        if (descriptionText.nodeValue === text) return;
        descriptionText.nodeValue = text;
        bubbleText.nodeValue = text;
      },
      hideNow() {
        clearTimers();
        bubble.classList.remove("is-visible");
        bubble.hidden = true;
      },
      destroy: clearTimers,
    };
    helps.push(help);
    return help;
  }

  function createSwitch(id: string): SwitchControl {
    const switchContainer = environment.createElement(
      "div",
      "ag-settings-switch",
    );
    const input = environment.createElement(
      "input",
      "ag-settings-switch-input",
    );
    input.type = "checkbox";
    input.id = id;
    const thumb = environment.createElement("div", "ag-settings-switch-thumb");
    switchContainer.append(input, thumb);
    return { container: switchContainer, input };
  }

  function createCheckbox(id: string): CheckboxControl {
    const checkboxContainer = environment.createElement(
      "div",
      "ag-settings-checkbox",
    );
    const input = environment.createElement(
      "input",
      "ag-settings-checkbox-input",
    );
    input.type = "checkbox";
    input.id = id;

    const check = environment.createSvg("svg", {
      class: "ag-settings-checkbox-check",
      width: "14",
      height: "14",
      viewBox: "0 0 14 14",
      fill: "none",
      "aria-hidden": "true",
      focusable: "false",
    });
    check.append(
      environment.createSvg("path", {
        class: "ag-settings-checkbox-check-path",
        d: "M3.94 7L6.13 9.19L10.5 4.81",
        stroke: "currentColor",
        "stroke-width": "1.5",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );

    checkboxContainer.append(input, check);
    return { container: checkboxContainer, input };
  }

  function createDivider(): HTMLDivElement {
    const divider = environment.createElement("div", "ag-settings-divider");
    divider.setAttribute("aria-hidden", "true");
    return divider;
  }

  /** A row label whose text is a real `<label>` bound to the row's control. */
  function createBoundLabel(text: string, forId: string): HTMLDivElement {
    const box = environment.createElement("div", "ag-settings-label");
    const label = environment.createElement("label");
    label.htmlFor = forId;
    label.textContent = text;
    box.append(label);
    return box;
  }

  function createCheckboxField(
    id: string,
    text: string,
    tooltip: string | undefined,
  ): CheckboxField {
    const field = environment.createElement(
      "div",
      "ag-settings-checkbox-field",
    );
    const checkbox = createCheckbox(id);
    const label = environment.createElement(
      "label",
      "ag-settings-checkbox-label",
    );
    label.htmlFor = id;
    label.textContent = text;
    field.append(checkbox.container, label);
    if (tooltip !== undefined) {
      const help = createHelp(tooltip);
      field.append(help.trigger, help.description);
    }
    return { root: field, input: checkbox.input };
  }

  // ---------------------------------------------------------------------------
  // Main page — header
  // ---------------------------------------------------------------------------

  const header = environment.createElement("div", "ag-settings-header");

  const brand = environment.createElement("a", "ag-settings-brand");
  brand.href = "https://agentation.com";
  brand.target = "_blank";
  brand.rel = "noopener noreferrer";
  const wordmark = environment.createSvg("svg", {
    width: "72",
    height: "16",
    viewBox: WORDMARK_VIEW_BOX,
    fill: "none",
    "aria-hidden": "true",
    focusable: "false",
  });
  wordmark.append(
    environment.createSvg("path", {
      d: WORDMARK_PATH,
      fill: "currentColor",
    }),
  );
  // The wordmark is the anchor's only content, so it needs a text alternative.
  const brandName = environment.createElement("span", "ag-visually-hidden");
  brandName.textContent = "Agentation";
  brand.append(wordmark, brandName);

  const version = environment.createElement("p", "ag-settings-version");
  version.textContent = `v${__VERSION__}`;

  const themeToggle = environment.createElement(
    "button",
    "ag-settings-theme-toggle",
  );
  themeToggle.type = "button";
  const themeIconWrapper = environment.createElement(
    "span",
    "ag-settings-theme-icon-wrapper",
  );
  // One retained slot per glyph. Toggling `hidden` restarts the entrance
  // animation, reproducing the original's remount-on-`key`.
  const sunSlot = environment.createElement("span", "ag-settings-theme-icon");
  sunSlot.append(createIcon(environment, "sun", 20));
  const moonSlot = environment.createElement("span", "ag-settings-theme-icon");
  moonSlot.append(createIcon(environment, "moon", 20));
  moonSlot.hidden = true;
  themeIconWrapper.append(sunSlot, moonSlot);
  themeToggle.append(themeIconWrapper);
  themeToggle.addEventListener(
    "click",
    () => dispatch({ type: "toggle-theme" }),
    { signal: listeners.signal },
  );

  header.append(brand, version, themeToggle);

  // ---------------------------------------------------------------------------
  // Main page — output detail, component metadata, hide until restart
  // ---------------------------------------------------------------------------

  const controlsSection = environment.createElement(
    "div",
    "ag-settings-section",
  );

  const detailRow = environment.createElement("div", "ag-settings-row");
  const detailLabel = environment.createElement("div", "ag-settings-label");
  detailLabel.append(environment.document.createTextNode("Output Detail"));
  const detailHelp = createHelp(
    "Controls how much detail is included in the copied output",
  );
  detailLabel.append(detailHelp.trigger, detailHelp.description);

  const cycleButton = environment.createElement("button", "ag-settings-cycle");
  cycleButton.type = "button";
  cycleButton.setAttribute("aria-label", "Output detail");
  // Two alternating slots so the label's entrance animation replays on change.
  const cycleSlots: readonly { node: HTMLElement; text: Text }[] = [0, 1].map(
    () => {
      const node = environment.createElement("span", "ag-settings-cycle-text");
      const text = environment.document.createTextNode("");
      node.append(text);
      node.hidden = true;
      cycleButton.append(node);
      return { node, text };
    },
  );
  const cycleDots = environment.createElement("span", "ag-settings-cycle-dots");
  cycleDots.setAttribute("aria-hidden", "true");
  const dots = OUTPUT_DETAIL_OPTIONS.map(() => {
    const dot = environment.createElement("span", "ag-settings-cycle-dot");
    cycleDots.append(dot);
    return dot;
  });
  cycleButton.append(cycleDots);
  cycleButton.addEventListener(
    "click",
    () => {
      const current = latestModel?.settings.outputDetail;
      const index = OUTPUT_DETAIL_OPTIONS.findIndex(
        (option) => option.value === current,
      );
      const next =
        OUTPUT_DETAIL_OPTIONS[(index + 1) % OUTPUT_DETAIL_OPTIONS.length];
      dispatch({
        type: "settings-change",
        patch: { outputDetail: next.value },
      });
    },
    { signal: listeners.signal },
  );

  detailRow.append(detailLabel, cycleButton);

  const metadataRow = environment.createElement(
    "div",
    "ag-settings-row ag-settings-row-margin-top",
  );
  const metadataLabel = createBoundLabel(
    "Component Metadata",
    "agentation-metadata-enabled",
  );
  const metadataHelp = createHelp("");
  metadataLabel.append(metadataHelp.trigger, metadataHelp.description);
  const metadataSwitch = createSwitch("agentation-metadata-enabled");
  metadataSwitch.input.addEventListener(
    "change",
    () =>
      dispatch({
        type: "settings-change",
        patch: { metadataEnabled: metadataSwitch.input.checked },
      }),
    { signal: listeners.signal },
  );
  metadataRow.append(metadataLabel, metadataSwitch.container);

  const hideRow = environment.createElement(
    "div",
    "ag-settings-row ag-settings-row-margin-top",
  );
  const hideLabel = createBoundLabel(
    "Hide Until Restart",
    "agentation-hide-until-restart",
  );
  const hideHelp = createHelp("Hides the toolbar until you open a new tab");
  hideLabel.append(hideHelp.trigger, hideHelp.description);
  const hideSwitch = createSwitch("agentation-hide-until-restart");
  hideSwitch.input.addEventListener(
    "change",
    () => {
      if (!hideSwitch.input.checked) return;
      // The original switch was permanently unchecked: it is an action, not a
      // setting, and the toolbar disappears the moment it fires.
      hideSwitch.input.checked = false;
      dispatch({ type: "hide-until-restart" });
    },
    { signal: listeners.signal },
  );
  hideRow.append(hideLabel, hideSwitch.container);

  controlsSection.append(detailRow, metadataRow, hideRow);

  // ---------------------------------------------------------------------------
  // Main page — marker colour
  // ---------------------------------------------------------------------------

  const colorSection = environment.createElement("div", "ag-settings-section");
  const colorLabel = environment.createElement("div", "ag-settings-label");
  colorLabel.id = "agentation-marker-color-label";
  colorLabel.textContent = "Marker Color";
  const colorOptions = environment.createElement(
    "div",
    "ag-settings-color-options",
  );
  colorOptions.setAttribute("role", "group");
  colorOptions.setAttribute("aria-labelledby", colorLabel.id);
  const swatches = ACCENT_OPTIONS.map((accent) => {
    const button = environment.createElement(
      "button",
      "ag-settings-color-option",
    );
    button.type = "button";
    button.title = accent.label;
    button.setAttribute("aria-label", accent.label);
    button.style.setProperty("--swatch", accent.srgb);
    button.style.setProperty("--swatch-p3", accent.p3);
    button.addEventListener(
      "click",
      () =>
        dispatch({
          type: "settings-change",
          patch: { annotationColorId: accent.id },
        }),
      { signal: listeners.signal },
    );
    colorOptions.append(button);
    return { id: accent.id, button };
  });
  colorSection.append(colorLabel, colorOptions);

  // ---------------------------------------------------------------------------
  // Main page — checkboxes
  // ---------------------------------------------------------------------------

  const checkboxSection = environment.createElement(
    "div",
    "ag-settings-section",
  );
  const autoClearField = createCheckboxField(
    "agentation-auto-clear",
    "Clear on copy/send",
    "Automatically clear annotations after copying",
  );
  autoClearField.input.addEventListener(
    "change",
    () =>
      dispatch({
        type: "settings-change",
        patch: { autoClearAfterCopy: autoClearField.input.checked },
      }),
    { signal: listeners.signal },
  );
  const blockField = createCheckboxField(
    "agentation-block-interactions",
    "Block page interactions",
    undefined,
  );
  blockField.input.addEventListener(
    "change",
    () =>
      dispatch({
        type: "settings-change",
        patch: { blockInteractions: blockField.input.checked },
      }),
    { signal: listeners.signal },
  );
  checkboxSection.append(autoClearField.root, blockField.root);

  // ---------------------------------------------------------------------------
  // Main page — navigation to automations
  // ---------------------------------------------------------------------------

  const navButton = environment.createElement("button", "ag-settings-nav-link");
  navButton.type = "button";
  const navLabel = environment.createElement("span");
  navLabel.textContent = "Manage MCP & Webhooks";
  const navRight = environment.createElement(
    "span",
    "ag-settings-nav-link-right",
  );
  const navIndicator = environment.createElement(
    "span",
    "ag-settings-mcp-nav-indicator",
  );
  navIndicator.setAttribute("aria-hidden", "true");
  navIndicator.hidden = true;
  // The oracle drew this chevron inline; it is not the shared icon-set glyph.
  const navChevron = environment.createSvg("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": "true",
    focusable: "false",
  });
  navChevron.append(
    environment.createSvg("path", {
      d: "M7.5 12.5L12 8L7.5 3.5",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
  navRight.append(navIndicator, navChevron);
  navButton.append(navLabel, navRight);
  navButton.addEventListener(
    "click",
    () => dispatch({ type: "settings-page", page: "automations" }),
    { signal: listeners.signal },
  );

  mainPage.append(
    header,
    createDivider(),
    controlsSection,
    createDivider(),
    colorSection,
    createDivider(),
    checkboxSection,
    createDivider(),
    navButton,
  );

  // ---------------------------------------------------------------------------
  // Automations page
  // ---------------------------------------------------------------------------

  const backButton = environment.createElement(
    "button",
    "ag-settings-back-button",
  );
  backButton.type = "button";
  backButton.append(createIcon(environment, "chevron-left", 16));
  const backLabel = environment.createElement("span");
  backLabel.textContent = "Manage MCP & Webhooks";
  backButton.append(backLabel);
  backButton.addEventListener(
    "click",
    () => dispatch({ type: "settings-page", page: "main" }),
    { signal: listeners.signal },
  );

  const mcpSection = environment.createElement("div", "ag-settings-section");
  const mcpRow = environment.createElement("div", "ag-settings-row");
  const mcpHeader = environment.createElement(
    "span",
    "ag-settings-automation-header",
  );
  mcpHeader.append(environment.document.createTextNode("MCP Connection"));
  const mcpHelp = createHelp(
    "Connect via Model Context Protocol to let AI agents like Claude Code receive annotations in real-time.",
  );
  mcpHeader.append(mcpHelp.trigger, mcpHelp.description);
  const mcpStatusDot = environment.createElement(
    "div",
    "ag-settings-mcp-status-dot",
  );
  mcpStatusDot.hidden = true;
  mcpRow.append(mcpHeader, mcpStatusDot);

  const mcpDescription = environment.createElement(
    "p",
    "ag-settings-automation-description ag-settings-mcp-description",
  );
  mcpDescription.append(
    environment.document.createTextNode(
      "MCP connection allows agents to receive and act on annotations. ",
    ),
  );
  const learnMore = environment.createElement("a", "ag-settings-learn-more");
  learnMore.href = "https://agentation.dev/mcp";
  learnMore.target = "_blank";
  learnMore.rel = "noopener noreferrer";
  learnMore.textContent = "Learn more";
  mcpDescription.append(learnMore);
  mcpSection.append(mcpRow, mcpDescription);

  const webhookSection = environment.createElement(
    "div",
    "ag-settings-section ag-settings-section-grow",
  );
  const webhookRow = environment.createElement("div", "ag-settings-row");
  const webhookHeader = environment.createElement(
    "span",
    "ag-settings-automation-header",
  );
  webhookHeader.append(environment.document.createTextNode("Webhooks"));
  const webhookHelp = createHelp(
    "Send annotation data to any URL endpoint when annotations change. Useful for custom integrations.",
  );
  webhookHeader.append(webhookHelp.trigger, webhookHelp.description);

  const autoSend = environment.createElement("div", "ag-settings-auto-send");
  const autoSendLabel = environment.createElement(
    "label",
    "ag-settings-auto-send-label",
  );
  autoSendLabel.htmlFor = "agentation-auto-send";
  autoSendLabel.textContent = "Auto-Send";
  const autoSendSwitch = createSwitch("agentation-auto-send");
  autoSendSwitch.input.addEventListener(
    "change",
    () =>
      dispatch({
        type: "settings-change",
        patch: { webhooksEnabled: autoSendSwitch.input.checked },
      }),
    { signal: listeners.signal },
  );
  autoSend.append(autoSendLabel, autoSendSwitch.container);
  webhookRow.append(webhookHeader, autoSend);

  const webhookDescription = environment.createElement(
    "p",
    "ag-settings-automation-description",
  );
  webhookDescription.textContent =
    "The webhook URL will receive live annotation changes and annotation data.";

  const webhookField = environment.createElement(
    "div",
    "ag-settings-webhook-field",
  );
  const webhookLabel = environment.createElement("label", "ag-visually-hidden");
  webhookLabel.htmlFor = "agentation-webhook-url";
  webhookLabel.textContent = "Webhook URL";
  const webhookInput = environment.createElement(
    "input",
    "ag-settings-webhook-input",
  );
  webhookInput.type = "url";
  webhookInput.id = "agentation-webhook-url";
  webhookInput.placeholder = "Webhook URL";
  webhookInput.autocomplete = "off";
  webhookInput.spellcheck = false;
  webhookInput.setAttribute("inputmode", "url");
  webhookInput.setAttribute("aria-describedby", "agentation-webhook-error");
  const webhookError = environment.createElement(
    "p",
    "ag-settings-webhook-error",
  );
  webhookError.id = "agentation-webhook-error";
  webhookError.setAttribute("aria-live", "polite");
  webhookError.textContent = "Enter a valid http(s) URL.";
  webhookError.hidden = true;
  webhookField.append(webhookLabel, webhookInput, webhookError);

  webhookInput.addEventListener(
    "input",
    () =>
      dispatch({
        type: "settings-change",
        patch: { webhookUrl: webhookInput.value },
      }),
    { signal: listeners.signal },
  );
  // The runtime's plain-key shortcuts must not fire while a URL is being typed.
  webhookInput.addEventListener(
    "keydown",
    (event) => event.stopPropagation(),
    { signal: listeners.signal },
  );

  webhookSection.append(webhookRow, webhookDescription, webhookField);

  automationsPage.append(
    backButton,
    createDivider(),
    mcpSection,
    createDivider(),
    webhookSection,
  );

  container.append(mainPage, automationsPage);
  panel.append(container);
  root.append(panel);

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  let latestModel: Readonly<RuntimeViewModel> | undefined;
  let renderedTheme: "dark" | "light" | undefined;
  let cycleLabel: string | undefined;
  let cycleSlot = -1;

  function showCycleLabel(label: string): void {
    if (label === cycleLabel) return;
    cycleLabel = label;
    const next = cycleSlot === 0 ? 1 : 0;
    cycleSlots[next].text.nodeValue = label;
    cycleSlots[next].node.hidden = false;
    if (cycleSlot >= 0) cycleSlots[cycleSlot].node.hidden = true;
    cycleSlot = next;
  }

  return {
    root,

    update(model: Readonly<RuntimeViewModel>, _config: Readonly<AgentationConfig>) {
      latestModel = model;
      root.hidden = model.hidden;

      // --- Placement --------------------------------------------------------
      // Mirrors the toolbar exactly: a dragged position wins over the inherited
      // placement variables, and clearing it restores them.
      const position = model.toolbarPosition;
      root.style.left = position ? `${position.x}px` : "";
      root.style.top = position ? `${position.y}px` : "";
      root.style.right = position ? "auto" : "";
      root.style.bottom = position ? "auto" : "";
      panel.classList.toggle(
        "ag-settings-panel-below",
        position !== null && position.y < NEAR_BOTTOM_THRESHOLD,
      );

      // --- Open / closed ----------------------------------------------------
      panel.classList.toggle("ag-settings-enter", model.settingsOpen);
      panel.classList.toggle("ag-settings-exit", !model.settingsOpen);
      // The panel stays mounted for its exit transition, so focus and the
      // accessibility tree are withdrawn explicitly.
      if (model.settingsOpen) panel.removeAttribute("inert");
      else panel.setAttribute("inert", "");

      if (!model.settingsOpen) {
        for (const help of helps) help.hideNow();
      }

      // --- Pages ------------------------------------------------------------
      const onAutomations = model.settingsPage === "automations";
      mainPage.classList.toggle("ag-settings-slide-left", onAutomations);
      automationsPage.classList.toggle("ag-settings-slide-in", onAutomations);
      navButton.setAttribute("aria-expanded", String(onAutomations));

      // --- Theme ------------------------------------------------------------
      if (model.theme !== renderedTheme) {
        renderedTheme = model.theme;
        const dark = model.theme === "dark";
        sunSlot.hidden = !dark;
        moonSlot.hidden = dark;
        themeToggle.title = dark
          ? "Switch to light mode"
          : "Switch to dark mode";
        themeToggle.setAttribute("aria-label", themeToggle.title);
      }

      // --- Output detail ----------------------------------------------------
      const detail = model.settings.outputDetail;
      const detailIndex = OUTPUT_DETAIL_OPTIONS.findIndex(
        (option) => option.value === detail,
      );
      showCycleLabel(OUTPUT_DETAIL_OPTIONS[detailIndex]?.label ?? "");
      for (let index = 0; index < dots.length; index += 1) {
        dots[index].classList.toggle("is-active", index === detailIndex);
      }

      // --- Component metadata -----------------------------------------------
      const adapterIds = model.metadataAdapterIds;
      const hasAdapters = adapterIds.length > 0;
      metadataRow.classList.toggle("ag-settings-row-disabled", !hasAdapters);
      metadataHelp.setContent(
        hasAdapters
          ? `Include component metadata from: ${adapterIds.join(", ")}`
          : "No metadata adapters are configured for this page.",
      );
      metadataSwitch.input.disabled = !hasAdapters;
      metadataSwitch.input.checked = hasAdapters && model.settings.metadataEnabled;

      // --- Hide until restart -----------------------------------------------
      hideSwitch.input.checked = false;

      // --- Marker colour ----------------------------------------------------
      for (const swatch of swatches) {
        const selected = model.settings.annotationColorId === swatch.id;
        swatch.button.classList.toggle("is-selected", selected);
        swatch.button.setAttribute("aria-pressed", String(selected));
      }

      // --- Checkboxes -------------------------------------------------------
      autoClearField.input.checked = model.settings.autoClearAfterCopy;
      blockField.input.checked = model.settings.blockInteractions;

      // --- MCP --------------------------------------------------------------
      const connection = model.connection;
      navIndicator.hidden = !model.hasEndpoint || connection === "disconnected";
      navIndicator.classList.toggle("is-connected", connection === "connected");
      navIndicator.classList.toggle(
        "is-connecting",
        connection === "connecting",
      );

      mcpStatusDot.hidden = !model.hasEndpoint;
      mcpStatusDot.classList.toggle("is-connected", connection === "connected");
      mcpStatusDot.classList.toggle(
        "is-connecting",
        connection === "connecting",
      );
      mcpStatusDot.classList.toggle(
        "is-disconnected",
        connection === "disconnected",
      );
      mcpStatusDot.title =
        connection === "connected"
          ? "Connected"
          : connection === "connecting"
            ? "Connecting..."
            : "Disconnected";

      // --- Webhooks ---------------------------------------------------------
      const webhookUrl = model.settings.webhookUrl;
      // Never clobber the caret: the value only differs when the model changed
      // underneath the field (route change, storage migration, remote config).
      if (webhookInput.value !== webhookUrl) webhookInput.value = webhookUrl;

      const hasWebhookUrl = webhookUrl.trim().length > 0;
      const invalid = hasWebhookUrl && !isValidUrl(environment, webhookUrl);
      webhookError.hidden = !invalid;
      webhookInput.setAttribute("aria-invalid", String(invalid));

      autoSendLabel.classList.toggle(
        "is-active",
        model.settings.webhooksEnabled,
      );
      autoSendLabel.classList.toggle("is-disabled", !webhookUrl);
      autoSendSwitch.input.checked = model.settings.webhooksEnabled;
      autoSendSwitch.input.disabled = !webhookUrl;
    },

    destroy() {
      for (const help of helps) help.destroy();
      listeners.abort();
      latestModel = undefined;
    },
  };
}
