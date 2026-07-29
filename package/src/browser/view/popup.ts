// =============================================================================
// Annotation popup region
// =============================================================================
//
// Framework-free port of `components/annotation-popup-css`. One popup node is
// created here and retained for the lifetime of the runtime: the textarea must
// never be replaced, because doing so would drop focus, the caret and any
// in-flight IME composition mid-keystroke.
//
// Positioning, timings and copy are lifted verbatim from the two original
// `<AnnotationPopupCSS>` call sites in `page-toolbar-css`.
// =============================================================================

import type { RuntimeEnvironment } from "../environment";
import type { AgentationConfig } from "../types";
import type {
  EditorState,
  RuntimeViewModel,
  ViewDispatch,
  ViewRegion,
} from "./model";
import { createIcon } from "./icons";

export interface PopupRegion extends ViewRegion {
  /** Focus the textarea and restore the caret to the end of the draft. */
  focusEditor(): void;
  /** Play the 250 ms rejection shake, then hand focus back to the textarea. */
  shakeEditor(): void;
}

type AnimState = "initial" | "enter" | "entered" | "exit";

/** Retained nodes for one `name: value;` line of the computed-styles block. */
type StyleRow = {
  line: HTMLDivElement;
  value: HTMLSpanElement;
};

/** Matches the original `key.replace(/([A-Z])/g, "-$1").toLowerCase()`. */
const CAMEL_BOUNDARY = /([A-Z])/g;

/** The popup is 280px wide and centred, so 140px each side plus 20px padding. */
const HORIZONTAL_MARGIN = 160;
/** Below this much room the popup flips above the marker (original constant). */
const FLIP_THRESHOLD = 290;
/** Gap between the marker and the popup edge. */
const MARKER_GAP = 20;

const QUOTE_LIMIT = 80;

const EMPTY_DRAFT_MESSAGE = "Enter feedback before submitting.";

function placeholderFor(editor: Readonly<EditorState>): string {
  // Edit mode wins over the area/group wording: the original edit call site
  // passes this placeholder unconditionally.
  if (editor.mode === "edit") return "Edit your feedback...";
  if (editor.element === "Area selection") return "What should change in this area?";
  if (editor.isMultiSelect) return "Feedback for this group of elements...";
  return "What should change?";
}

export function createPopupRegion(
  environment: RuntimeEnvironment,
  dispatch: ViewDispatch,
): PopupRegion {
  const controller = new environment.AbortController();
  const { signal } = controller;
  const { timers } = environment;

  // ---------------------------------------------------------------------------
  // Retained tree
  // ---------------------------------------------------------------------------

  const root = environment.createElement("div", "ag-popup");
  root.setAttribute("data-agentation-ui", "popup");
  // The animation-freeze controller skips this subtree by attribute, exactly as
  // the original popup relied on.
  root.setAttribute("data-annotation-popup", "");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "false");
  root.hidden = true;

  const header = environment.createElement("div", "ag-popup-header");

  const stylesId = "ag-popup-styles";
  const toggle = environment.createElement("button", "ag-popup-header-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", stylesId);
  const chevron = environment.createSvg("svg", {
    class: "ag-popup-chevron",
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none",
    "aria-hidden": "true",
  });
  chevron.append(
    environment.createSvg("path", {
      d: "M5.5 10.25L9 7.25L5.75 4",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
  const toggleLabel = environment.createElement("span", "ag-popup-element");
  toggle.append(chevron, toggleLabel);

  // Rendered instead of the toggle when the target has no computed styles, so
  // there is never a button that does nothing.
  const plainLabel = environment.createElement("span", "ag-popup-element");

  header.append(toggle, plainLabel);

  const stylesWrapper = environment.createElement("div", "ag-popup-styles-wrapper");
  stylesWrapper.id = stylesId;
  const stylesInner = environment.createElement("div", "ag-popup-styles-inner");
  const stylesBlock = environment.createElement("div", "ag-popup-styles-block");
  stylesInner.append(stylesBlock);
  stylesWrapper.append(stylesInner);

  const quote = environment.createElement("div", "ag-popup-quote");

  const textareaId = "ag-popup-textarea";
  const textareaLabel = environment.createElement("label", "ag-visually-hidden");
  textareaLabel.htmlFor = textareaId;
  textareaLabel.textContent = "Feedback";
  const textarea = environment.createElement("textarea", "ag-popup-textarea");
  textarea.id = textareaId;
  textarea.rows = 2;

  const actions = environment.createElement("div", "ag-popup-actions");
  const deleteWrapper = environment.createElement("div", "ag-popup-delete-wrapper");
  const deleteButton = environment.createElement("button", "ag-popup-delete");
  deleteButton.type = "button";
  deleteButton.setAttribute("aria-label", "Delete annotation");
  deleteButton.append(createIcon(environment, "trash", 22));
  deleteWrapper.append(deleteButton);
  const cancelButton = environment.createElement("button", "ag-popup-cancel");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  const submitButton = environment.createElement("button", "ag-popup-submit");
  submitButton.type = "button";
  submitButton.textContent = "Add";
  submitButton.setAttribute("aria-disabled", "true");
  actions.append(deleteWrapper, cancelButton, submitButton);

  const status = environment.createElement("div", "ag-visually-hidden");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  root.append(header, stylesWrapper, quote, textareaLabel, textarea, actions, status);

  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------

  const styleRows = new Map<string, StyleRow>();
  /** Identity of the editor currently on screen; a change means a fresh mount. */
  let session: string | null = null;
  let animState: AnimState = "initial";
  let expanded = false;

  let enterTimer: number | undefined;
  let enteredTimer: number | undefined;
  let focusTimer: number | undefined;
  let cancelTimer: number | undefined;
  let shakeTimer: number | undefined;
  let refocusTimer: number | undefined;

  // ---------------------------------------------------------------------------
  // Focus
  // ---------------------------------------------------------------------------

  /** Focus the textarea while temporarily blocking focus-trap libraries (e.g.
   *  Radix FocusScope) from reclaiming focus via focusin/focusout handlers. */
  function focusBypassingTraps(): void {
    const trap = (event: Event) => event.stopImmediatePropagation();
    const owner = environment.document;
    owner.addEventListener("focusin", trap, true);
    owner.addEventListener("focusout", trap, true);
    try {
      textarea.focus();
    } finally {
      owner.removeEventListener("focusin", trap, true);
      owner.removeEventListener("focusout", trap, true);
    }
  }

  function isTextareaFocused(): boolean {
    // Inside a shadow root `document.activeElement` reports the host, so ask
    // the containing root first.
    const containing = textarea.getRootNode();
    const active =
      containing instanceof environment.ShadowRoot
        ? containing.activeElement
        : environment.document.activeElement;
    return active === textarea;
  }

  function focusEditor(): void {
    // Never steal focus from a textarea that already has it: that would clobber
    // a live caret or selection.
    if (isTextareaFocused()) return;
    focusBypassingTraps();
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
    textarea.scrollTop = textarea.scrollHeight;
  }

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  function setAnimState(next: AnimState): void {
    if (animState === next) return;
    animState = next;
    root.classList.toggle("is-enter", next === "enter");
    root.classList.toggle("is-entered", next === "entered");
    root.classList.toggle("is-exit", next === "exit");
  }

  function clearTimers(): void {
    timers.clearTimeout(enterTimer);
    timers.clearTimeout(enteredTimer);
    timers.clearTimeout(focusTimer);
    timers.clearTimeout(cancelTimer);
    timers.clearTimeout(shakeTimer);
    timers.clearTimeout(refocusTimer);
    enterTimer = undefined;
    enteredTimer = undefined;
    focusTimer = undefined;
    cancelTimer = undefined;
    shakeTimer = undefined;
    refocusTimer = undefined;
  }

  function beginSession(): void {
    clearTimers();
    root.classList.remove("is-shaking");
    setAnimState("initial");
    expanded = false;
    applyExpanded();
    status.textContent = "";
    // Timers come from the environment so a frozen page still animates.
    enterTimer = timers.setTimeout(() => {
      if (animState !== "exit") setAnimState("enter");
    }, 0);
    enteredTimer = timers.setTimeout(() => {
      if (animState !== "exit") setAnimState("entered");
    }, 200);
    focusTimer = timers.setTimeout(focusEditor, 50);
  }

  function shakeEditor(): void {
    timers.clearTimeout(shakeTimer);
    root.classList.remove("is-shaking");
    // Flush layout so a second shake restarts the keyframes instead of riding
    // out the in-flight animation.
    void root.offsetWidth;
    root.classList.add("is-shaking");
    shakeTimer = timers.setTimeout(() => {
      shakeTimer = undefined;
      root.classList.remove("is-shaking");
      focusBypassingTraps();
    }, 250);
  }

  function requestCancel(): void {
    setAnimState("exit");
    timers.clearTimeout(cancelTimer);
    cancelTimer = timers.setTimeout(() => {
      cancelTimer = undefined;
      dispatch({ type: "editor-cancel" });
    }, 150);
  }

  function requestSubmit(): void {
    const draft = textarea.value;
    if (!draft.trim()) {
      status.textContent = EMPTY_DRAFT_MESSAGE;
      shakeEditor();
      return;
    }
    dispatch({ type: "editor-submit", draft: draft.trim() });
  }

  // ---------------------------------------------------------------------------
  // Content
  // ---------------------------------------------------------------------------

  function applyExpanded(): void {
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    chevron.classList.toggle("is-expanded", expanded);
    stylesWrapper.classList.toggle("is-expanded", expanded);
  }

  function syncSubmitState(): void {
    submitButton.setAttribute(
      "aria-disabled",
      textarea.value.trim() ? "false" : "true",
    );
  }

  function updateStyleRows(styles: Record<string, string> | undefined): void {
    const entries = styles ? Object.entries(styles) : [];
    let previous: ChildNode | null = null;
    for (const [key, value] of entries) {
      let row = styleRows.get(key);
      if (!row) {
        const line = environment.createElement("div", "ag-popup-style-line");
        const property = environment.createElement("span", "ag-popup-style-property");
        property.textContent = key.replace(CAMEL_BOUNDARY, "-$1").toLowerCase();
        const valueNode = environment.createElement("span", "ag-popup-style-value");
        line.append(
          property,
          environment.document.createTextNode(": "),
          valueNode,
          environment.document.createTextNode(";"),
        );
        row = { line, value: valueNode };
        styleRows.set(key, row);
      }
      if (row.value.textContent !== value) row.value.textContent = value;
      // Keyed placement: only move nodes whose position actually changed.
      const expected: ChildNode | null =
        previous === null ? stylesBlock.firstChild : previous.nextSibling;
      if (expected !== row.line) stylesBlock.insertBefore(row.line, expected);
      previous = row.line;
    }
    if (styleRows.size === entries.length) return;
    const live = new Set(entries.map(([key]) => key));
    for (const [key, row] of styleRows) {
      if (live.has(key)) continue;
      row.line.remove();
      styleRows.delete(key);
    }
  }

  function position(editor: Readonly<EditorState>): void {
    // Stored coordinates, matched to the marker the popup is anchored to.
    const markerY = editor.isFixed ? editor.y : editor.y - environment.scrollY;
    const left = Math.max(
      HORIZONTAL_MARGIN,
      Math.min(
        environment.innerWidth - HORIZONTAL_MARGIN,
        (editor.x / 100) * environment.innerWidth,
      ),
    );
    root.style.left = `${left}px`;
    // Flip above the marker when there is not enough room below, so the marker
    // itself stays visible.
    if (markerY > environment.innerHeight - FLIP_THRESHOLD) {
      root.style.top = "";
      root.style.bottom = `${environment.innerHeight - markerY + MARKER_GAP}px`;
    } else {
      root.style.bottom = "";
      root.style.top = `${markerY + MARKER_GAP}px`;
    }
  }

  // ---------------------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------------------

  root.addEventListener("click", (event) => event.stopPropagation(), { signal });

  textarea.addEventListener(
    "keydown",
    (event) => {
      // Global shortcuts must not fire while the user is typing feedback.
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        requestSubmit();
      }
      if (event.key === "Escape") {
        requestCancel();
      }
    },
    { signal },
  );

  textarea.addEventListener(
    "input",
    () => {
      status.textContent = "";
      syncSubmitState();
      dispatch({ type: "editor-input", draft: textarea.value });
    },
    { signal },
  );

  toggle.addEventListener(
    "click",
    () => {
      const wasExpanded = expanded;
      expanded = !expanded;
      applyExpanded();
      if (!wasExpanded) return;
      // Collapsing hands focus back to the textarea, as in the original.
      timers.clearTimeout(refocusTimer);
      refocusTimer = timers.setTimeout(() => {
        refocusTimer = undefined;
        focusBypassingTraps();
      }, 0);
    },
    { signal },
  );

  cancelButton.addEventListener("click", requestCancel, { signal });
  submitButton.addEventListener("click", requestSubmit, { signal });
  deleteButton.addEventListener(
    "click",
    () => dispatch({ type: "editor-delete" }),
    { signal },
  );

  return {
    root,
    focusEditor,
    shakeEditor,
    update(model: Readonly<RuntimeViewModel>, _config: Readonly<AgentationConfig>): void {
      const editor = model.editor;
      if (!editor) {
        if (session === null) return;
        session = null;
        clearTimers();
        root.classList.remove("is-shaking");
        setAnimState("initial");
        root.hidden = true;
        return;
      }

      const key = [
        editor.mode,
        editor.annotationId ?? "",
        editor.element,
        editor.x,
        editor.y,
      ].join("|");
      const fresh = key !== session;
      session = key;
      root.hidden = false;

      // Only ever touch `value` when it actually diverges: assigning it while
      // the user types would reset the caret.
      if (textarea.value !== editor.draft) textarea.value = editor.draft;
      syncSubmitState();

      if (fresh) beginSession();
      if (editor.exiting) setAnimState("exit");

      root.classList.toggle("is-light", model.theme === "light");
      root.classList.toggle("is-multi", editor.isMultiSelect);
      root.setAttribute("aria-label", `Feedback for ${editor.element}`);

      const hasStyles =
        editor.computedStyles !== undefined &&
        Object.keys(editor.computedStyles).length > 0;
      toggle.hidden = !hasStyles;
      plainLabel.hidden = hasStyles;
      stylesWrapper.hidden = !hasStyles;
      if (toggleLabel.textContent !== editor.element) {
        toggleLabel.textContent = editor.element;
        plainLabel.textContent = editor.element;
      }
      updateStyleRows(hasStyles ? editor.computedStyles : undefined);

      const selectedText = editor.selectedText;
      quote.hidden = !selectedText;
      if (selectedText) {
        const text = `\u201C${selectedText.slice(0, QUOTE_LIMIT)}${
          selectedText.length > QUOTE_LIMIT ? "..." : ""
        }\u201D`;
        if (quote.textContent !== text) quote.textContent = text;
      }

      const placeholder = placeholderFor(editor);
      if (textarea.placeholder !== placeholder) textarea.placeholder = placeholder;

      const isEdit = editor.mode === "edit";
      deleteWrapper.hidden = !isEdit;
      const submitLabel = isEdit ? "Save" : "Add";
      if (submitButton.textContent !== submitLabel) {
        submitButton.textContent = submitLabel;
      }

      position(editor);
    },
    destroy(): void {
      controller.abort();
      clearTimers();
    },
  };
}
