var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);

// src/utils/element-identification.ts
function getParentElement(element) {
  if (element.parentElement) {
    return element.parentElement;
  }
  const root = element.getRootNode();
  if (root instanceof ShadowRoot) {
    return root.host;
  }
  return null;
}
function closestCrossingShadow(element, selector) {
  let current = element;
  while (current) {
    if (current.matches(selector)) return current;
    current = getParentElement(current);
  }
  return null;
}
function getElementPath(target, maxDepth = 4) {
  const parts = [];
  let current = target;
  let depth = 0;
  while (current && depth < maxDepth) {
    const tag = current.tagName.toLowerCase();
    if (tag === "html" || tag === "body") break;
    let identifier = tag;
    if (current.id) {
      identifier = `#${current.id}`;
    } else if (current.className && typeof current.className === "string") {
      const meaningfulClass = current.className.split(/\s+/).find((c) => c.length > 2 && !c.match(/^[a-z]{1,2}$/) && !c.match(/[A-Z0-9]{5,}/));
      if (meaningfulClass) {
        identifier = `.${meaningfulClass.split("_")[0]}`;
      }
    }
    const nextParent = getParentElement(current);
    if (!current.parentElement && nextParent) {
      identifier = `\u27E8shadow\u27E9 ${identifier}`;
    }
    parts.unshift(identifier);
    current = nextParent;
    depth++;
  }
  return parts.join(" > ");
}
function identifyElement(target) {
  const path = getElementPath(target);
  if (target.dataset.element) {
    return { name: target.dataset.element, path };
  }
  const tag = target.tagName.toLowerCase();
  if (["path", "circle", "rect", "line", "g"].includes(tag)) {
    const svg2 = closestCrossingShadow(target, "svg");
    if (svg2) {
      const parent = getParentElement(svg2);
      if (parent instanceof HTMLElement) {
        const parentName = identifyElement(parent).name;
        return { name: `graphic in ${parentName}`, path };
      }
    }
    return { name: "graphic element", path };
  }
  if (tag === "svg") {
    const parent = getParentElement(target);
    if (parent?.tagName.toLowerCase() === "button") {
      const btnText = parent.textContent?.trim();
      return { name: btnText ? `icon in "${btnText}" button` : "button icon", path };
    }
    return { name: "icon", path };
  }
  if (tag === "button") {
    const text = target.textContent?.trim();
    const ariaLabel = target.getAttribute("aria-label");
    if (ariaLabel) return { name: `button [${ariaLabel}]`, path };
    return { name: text ? `button "${text.slice(0, 25)}"` : "button", path };
  }
  if (tag === "a") {
    const text = target.textContent?.trim();
    const href = target.getAttribute("href");
    if (text) return { name: `link "${text.slice(0, 25)}"`, path };
    if (href) return { name: `link to ${href.slice(0, 30)}`, path };
    return { name: "link", path };
  }
  if (tag === "input") {
    const type = target.getAttribute("type") || "text";
    const placeholder = target.getAttribute("placeholder");
    const name = target.getAttribute("name");
    if (placeholder) return { name: `input "${placeholder}"`, path };
    if (name) return { name: `input [${name}]`, path };
    return { name: `${type} input`, path };
  }
  if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
    const text = target.textContent?.trim();
    return { name: text ? `${tag} "${text.slice(0, 35)}"` : tag, path };
  }
  if (tag === "p") {
    const text = target.textContent?.trim();
    if (text) return { name: `paragraph: "${text.slice(0, 40)}${text.length > 40 ? "..." : ""}"`, path };
    return { name: "paragraph", path };
  }
  if (tag === "span" || tag === "label") {
    const text = target.textContent?.trim();
    if (text && text.length < 40) return { name: `"${text}"`, path };
    return { name: tag, path };
  }
  if (tag === "li") {
    const text = target.textContent?.trim();
    if (text && text.length < 40) return { name: `list item: "${text.slice(0, 35)}"`, path };
    return { name: "list item", path };
  }
  if (tag === "blockquote") return { name: "blockquote", path };
  if (tag === "code") {
    const text = target.textContent?.trim();
    if (text && text.length < 30) return { name: `code: \`${text}\``, path };
    return { name: "code", path };
  }
  if (tag === "pre") return { name: "code block", path };
  if (tag === "img") {
    const alt = target.getAttribute("alt");
    return { name: alt ? `image "${alt.slice(0, 30)}"` : "image", path };
  }
  if (tag === "video") return { name: "video", path };
  if (["div", "section", "article", "nav", "header", "footer", "aside", "main"].includes(tag)) {
    const className = target.className;
    const role = target.getAttribute("role");
    const ariaLabel = target.getAttribute("aria-label");
    if (ariaLabel) return { name: `${tag} [${ariaLabel}]`, path };
    if (role) return { name: `${role}`, path };
    if (typeof className === "string" && className) {
      const words = className.split(/[\s_-]+/).map((c) => c.replace(/[A-Z0-9]{5,}.*$/, "")).filter((c) => c.length > 2 && !/^[a-z]{1,2}$/.test(c)).slice(0, 2);
      if (words.length > 0) return { name: words.join(" "), path };
    }
    return { name: tag === "div" ? "container" : tag, path };
  }
  return { name: tag, path };
}
function getNearbyText(element) {
  const texts = [];
  const ownText = element.textContent?.trim();
  if (ownText && ownText.length < 100) {
    texts.push(ownText);
  }
  const prev = element.previousElementSibling;
  if (prev) {
    const prevText = prev.textContent?.trim();
    if (prevText && prevText.length < 50) {
      texts.unshift(`[before: "${prevText.slice(0, 40)}"]`);
    }
  }
  const next = element.nextElementSibling;
  if (next) {
    const nextText = next.textContent?.trim();
    if (nextText && nextText.length < 50) {
      texts.push(`[after: "${nextText.slice(0, 40)}"]`);
    }
  }
  return texts.join(" ");
}
function getNearbyElements(element) {
  const parent = getParentElement(element);
  if (!parent) return "";
  const elementRoot = element.getRootNode();
  const children = elementRoot instanceof ShadowRoot && element.parentElement ? Array.from(element.parentElement.children) : Array.from(parent.children);
  const siblings = children.filter(
    (child) => child !== element && child instanceof HTMLElement
  );
  if (siblings.length === 0) return "";
  const siblingIds = siblings.slice(0, 4).map((sib) => {
    const tag = sib.tagName.toLowerCase();
    const className = sib.className;
    let cls = "";
    if (typeof className === "string" && className) {
      const meaningful = className.split(/\s+/).map((c) => c.replace(/[_][a-zA-Z0-9]{5,}.*$/, "")).find((c) => c.length > 2 && !/^[a-z]{1,2}$/.test(c));
      if (meaningful) cls = `.${meaningful}`;
    }
    if (tag === "button" || tag === "a") {
      const text = sib.textContent?.trim().slice(0, 15);
      if (text) return `${tag}${cls} "${text}"`;
    }
    return `${tag}${cls}`;
  });
  const parentTag = parent.tagName.toLowerCase();
  let parentId = parentTag;
  if (typeof parent.className === "string" && parent.className) {
    const parentCls = parent.className.split(/\s+/).map((c) => c.replace(/[_][a-zA-Z0-9]{5,}.*$/, "")).find((c) => c.length > 2 && !/^[a-z]{1,2}$/.test(c));
    if (parentCls) parentId = `.${parentCls}`;
  }
  const total = parent.children.length;
  const suffix = total > siblingIds.length + 1 ? ` (${total} total in ${parentId})` : "";
  return siblingIds.join(", ") + suffix;
}
function getElementClasses(target) {
  const className = target.className;
  if (typeof className !== "string" || !className) return "";
  const classes = className.split(/\s+/).filter((c) => c.length > 0).map((c) => {
    const match = c.match(/^([a-zA-Z][a-zA-Z0-9_-]*?)(?:_[a-zA-Z0-9]{5,})?$/);
    return match ? match[1] : c;
  }).filter((c, i, arr) => arr.indexOf(c) === i);
  return classes.join(", ");
}
var DEFAULT_STYLE_VALUES = /* @__PURE__ */ new Set([
  "none",
  "normal",
  "auto",
  "0px",
  "rgba(0, 0, 0, 0)",
  "transparent",
  "static",
  "visible"
]);
var TEXT_ELEMENTS = /* @__PURE__ */ new Set([
  "p",
  "span",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "label",
  "li",
  "td",
  "th",
  "blockquote",
  "figcaption",
  "caption",
  "legend",
  "dt",
  "dd",
  "pre",
  "code",
  "em",
  "strong",
  "b",
  "i",
  "a",
  "time",
  "cite",
  "q"
]);
var FORM_INPUT_ELEMENTS = /* @__PURE__ */ new Set(["input", "textarea", "select"]);
var MEDIA_ELEMENTS = /* @__PURE__ */ new Set(["img", "video", "canvas", "svg"]);
var CONTAINER_ELEMENTS = /* @__PURE__ */ new Set([
  "div",
  "section",
  "article",
  "nav",
  "header",
  "footer",
  "aside",
  "main",
  "ul",
  "ol",
  "form",
  "fieldset"
]);
function getDetailedComputedStyles(target) {
  if (typeof window === "undefined") return {};
  const styles = window.getComputedStyle(target);
  const result = {};
  const tag = target.tagName.toLowerCase();
  let properties;
  if (TEXT_ELEMENTS.has(tag)) {
    properties = ["color", "fontSize", "fontWeight", "fontFamily", "lineHeight"];
  } else if (tag === "button" || tag === "a" && target.getAttribute("role") === "button") {
    properties = ["backgroundColor", "color", "padding", "borderRadius", "fontSize"];
  } else if (FORM_INPUT_ELEMENTS.has(tag)) {
    properties = ["backgroundColor", "color", "padding", "borderRadius", "fontSize"];
  } else if (MEDIA_ELEMENTS.has(tag)) {
    properties = ["width", "height", "objectFit", "borderRadius"];
  } else if (CONTAINER_ELEMENTS.has(tag)) {
    properties = ["display", "padding", "margin", "gap", "backgroundColor"];
  } else {
    properties = ["color", "fontSize", "margin", "padding", "backgroundColor"];
  }
  for (const prop of properties) {
    const cssPropertyName = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
    const value = styles.getPropertyValue(cssPropertyName);
    if (value && !DEFAULT_STYLE_VALUES.has(value)) {
      result[prop] = value;
    }
  }
  return result;
}
var FORENSIC_PROPERTIES = [
  // Colors
  "color",
  "backgroundColor",
  "borderColor",
  // Typography
  "fontSize",
  "fontWeight",
  "fontFamily",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  // Box model
  "width",
  "height",
  "padding",
  "margin",
  "border",
  "borderRadius",
  // Layout & positioning
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "zIndex",
  "flexDirection",
  "justifyContent",
  "alignItems",
  "gap",
  // Visual effects
  "opacity",
  "visibility",
  "overflow",
  "boxShadow",
  // Transform
  "transform"
];
function getForensicComputedStyles(target) {
  if (typeof window === "undefined") return "";
  const styles = window.getComputedStyle(target);
  const parts = [];
  for (const prop of FORENSIC_PROPERTIES) {
    const cssPropertyName = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
    const value = styles.getPropertyValue(cssPropertyName);
    if (value && !DEFAULT_STYLE_VALUES.has(value)) {
      parts.push(`${cssPropertyName}: ${value}`);
    }
  }
  return parts.join("; ");
}
function getAccessibilityInfo(target) {
  const parts = [];
  const role = target.getAttribute("role");
  const ariaLabel = target.getAttribute("aria-label");
  const ariaDescribedBy = target.getAttribute("aria-describedby");
  const tabIndex = target.getAttribute("tabindex");
  const ariaHidden = target.getAttribute("aria-hidden");
  if (role) parts.push(`role="${role}"`);
  if (ariaLabel) parts.push(`aria-label="${ariaLabel}"`);
  if (ariaDescribedBy) parts.push(`aria-describedby="${ariaDescribedBy}"`);
  if (tabIndex) parts.push(`tabindex=${tabIndex}`);
  if (ariaHidden === "true") parts.push("aria-hidden");
  const focusable = target.matches("a, button, input, select, textarea, [tabindex]");
  if (focusable) parts.push("focusable");
  return parts.join(", ");
}
function getFullElementPath(target) {
  const parts = [];
  let current = target;
  while (current && current.tagName.toLowerCase() !== "html") {
    const tag = current.tagName.toLowerCase();
    let identifier = tag;
    if (current.id) {
      identifier = `${tag}#${current.id}`;
    } else if (current.className && typeof current.className === "string") {
      const cls = current.className.split(/\s+/).map((c) => c.replace(/[_][a-zA-Z0-9]{5,}.*$/, "")).find((c) => c.length > 2);
      if (cls) identifier = `${tag}.${cls}`;
    }
    const nextParent = getParentElement(current);
    if (!current.parentElement && nextParent) {
      identifier = `\u27E8shadow\u27E9 ${identifier}`;
    }
    parts.unshift(identifier);
    current = nextParent;
  }
  return parts.join(" > ");
}

// src/utils/freeze-animations.ts
var EXCLUDE_ATTRS = [
  "data-feedback-toolbar",
  "data-annotation-popup",
  "data-annotation-marker",
  "data-agentation-ui"
];
var NOT_SELECTORS = [
  ...EXCLUDE_ATTRS.flatMap((attribute) => [`:not([${attribute}])`, `:not([${attribute}] *)`]),
  ":not(agentation-overlay)",
  ":not(agentation-overlay *)"
].join("");
var STYLE_ID = "feedback-freeze-styles";
var STATE_KEY = "__agentationFreezeState";
function nativeScheduler(view) {
  return {
    setTimeout: view.setTimeout.bind(view),
    clearTimeout: view.clearTimeout.bind(view),
    setInterval: view.setInterval.bind(view),
    clearInterval: view.clearInterval.bind(view),
    requestAnimationFrame: view.requestAnimationFrame?.bind(view),
    cancelAnimationFrame: view.cancelAnimationFrame?.bind(view)
  };
}
function readState(view) {
  let state = view[STATE_KEY];
  if (!state) {
    state = {
      controllers: 0,
      freezeDepth: 0,
      installed: false,
      original: nativeScheduler(view),
      descriptors: /* @__PURE__ */ new Map(),
      timeoutQueue: [],
      rafQueue: [],
      pausedAnimations: []
    };
    view[STATE_KEY] = state;
  }
  return state;
}
function install(view, state) {
  if (state.installed) return;
  const patched = view;
  const patch = (name, value) => {
    state.descriptors.set(name, Object.getOwnPropertyDescriptor(view, name));
    patched[name] = value;
  };
  patch("setTimeout", (handler, timeout, ...args) => {
    if (typeof handler === "string") return state.original.setTimeout(handler, timeout);
    return state.original.setTimeout(
      (...called) => {
        if (state.freezeDepth > 0) {
          state.timeoutQueue.push(() => handler(...called));
          return;
        }
        handler(...called);
      },
      timeout,
      ...args
    );
  });
  patch("setInterval", (handler, timeout, ...args) => {
    if (typeof handler === "string") return state.original.setInterval(handler, timeout);
    return state.original.setInterval(
      (...called) => {
        if (state.freezeDepth > 0) return;
        handler(...called);
      },
      timeout,
      ...args
    );
  });
  if (typeof state.original.requestAnimationFrame === "function") {
    patch(
      "requestAnimationFrame",
      (callback) => state.original.requestAnimationFrame((timestamp) => {
        if (state.freezeDepth > 0) {
          state.rafQueue.push(callback);
          return;
        }
        callback(timestamp);
      })
    );
  }
  state.installed = true;
}
function uninstall(view, state) {
  if (!state.installed) return;
  for (const [name, descriptor] of state.descriptors) {
    if (descriptor) Object.defineProperty(view, name, descriptor);
    else delete view[name];
  }
  state.descriptors.clear();
  state.installed = false;
  state.timeoutQueue = [];
  state.rafQueue = [];
}
function getUnfrozenScheduler(document) {
  const view = document?.defaultView;
  if (!view) {
    const noop = () => 0;
    return {
      setTimeout: noop,
      clearTimeout: () => void 0,
      setInterval: noop,
      clearInterval: () => void 0,
      requestAnimationFrame: noop,
      cancelAnimationFrame: () => void 0
    };
  }
  const existing = view[STATE_KEY];
  return existing ? existing.original : nativeScheduler(view);
}
function createAnimationFreezeController(document) {
  const view = document.defaultView;
  if (!view) throw new Error("Agentation requires a Document attached to a Window");
  const state = readState(view);
  state.controllers += 1;
  install(view, state);
  let frozen = false;
  let destroyed = false;
  const excluded = (element) => {
    if (!element) return false;
    if (element.closest?.("agentation-overlay")) return true;
    return EXCLUDE_ATTRS.some((attribute) => Boolean(element.closest?.(`[${attribute}]`)));
  };
  const controller = {
    get frozen() {
      return frozen;
    },
    scheduler: state.original,
    freeze() {
      if (destroyed || frozen) return;
      frozen = true;
      state.freezeDepth += 1;
      if (state.freezeDepth > 1) return;
      state.timeoutQueue = [];
      state.rafQueue = [];
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
      }
      style.textContent = `
    *${NOT_SELECTORS},
    *${NOT_SELECTORS}::before,
    *${NOT_SELECTORS}::after {
      animation-play-state: paused !important;
      transition: none !important;
    }
  `;
      document.head.appendChild(style);
      state.pausedAnimations = [];
      try {
        for (const animation of document.getAnimations?.() ?? []) {
          if (animation.playState !== "running") continue;
          const target = animation.effect?.target ?? null;
          if (excluded(target)) continue;
          animation.pause();
          state.pausedAnimations.push(animation);
        }
      } catch {
      }
      for (const video of document.querySelectorAll("video")) {
        if (!video.paused) {
          video.dataset.wasPaused = "false";
          video.pause();
        }
      }
    },
    unfreeze() {
      if (!frozen) return;
      frozen = false;
      state.freezeDepth = Math.max(0, state.freezeDepth - 1);
      if (state.freezeDepth > 0) return;
      const timeoutQueue = state.timeoutQueue;
      state.timeoutQueue = [];
      for (const callback of timeoutQueue) {
        state.original.setTimeout(() => {
          if (state.freezeDepth > 0) {
            state.timeoutQueue.push(callback);
            return;
          }
          try {
            callback();
          } catch (error) {
            console.warn("[agentation] Error replaying queued timeout:", error);
          }
        }, 0);
      }
      const rafQueue = state.rafQueue;
      state.rafQueue = [];
      if (typeof state.original.requestAnimationFrame === "function") {
        for (const callback of rafQueue) {
          state.original.requestAnimationFrame((timestamp) => {
            if (state.freezeDepth > 0) {
              state.rafQueue.push(callback);
              return;
            }
            callback(timestamp);
          });
        }
      }
      for (const animation of state.pausedAnimations) {
        try {
          animation.play();
        } catch (error) {
          console.warn("[agentation] Error resuming animation:", error);
        }
      }
      state.pausedAnimations = [];
      document.getElementById(STYLE_ID)?.remove();
      for (const video of document.querySelectorAll("video")) {
        if (video.dataset.wasPaused === "false") {
          void video.play().catch(() => void 0);
          delete video.dataset.wasPaused;
        }
      }
    },
    destroy() {
      if (destroyed) return;
      controller.unfreeze();
      destroyed = true;
      state.controllers = Math.max(0, state.controllers - 1);
      if (state.controllers > 0) return;
      uninstall(view, state);
      delete view[STATE_KEY];
    }
  };
  return controller;
}

// src/utils/generate-output.ts
var OUTPUT_DETAIL_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Detailed" },
  { value: "forensic", label: "Forensic" }
];
function generateOutput(annotations, pathname, detailLevel = "standard") {
  if (annotations.length === 0) return "";
  const viewport = typeof window !== "undefined" ? `${window.innerWidth}\xD7${window.innerHeight}` : "unknown";
  let output = `## Page Feedback: ${pathname}
`;
  if (detailLevel === "forensic") {
    output += `
**Environment:**
`;
    output += `- Viewport: ${viewport}
`;
    if (typeof window !== "undefined") {
      output += `- URL: ${window.location.href}
`;
      output += `- User Agent: ${navigator.userAgent}
`;
      output += `- Timestamp: ${(/* @__PURE__ */ new Date()).toISOString()}
`;
      output += `- Device Pixel Ratio: ${window.devicePixelRatio}
`;
    }
    output += `
---
`;
  } else if (detailLevel !== "compact") {
    output += `**Viewport:** ${viewport}
`;
  }
  output += "\n";
  annotations.forEach((a, i) => {
    const componentPath = a.framework?.componentPath?.join(" > ") ?? a.reactComponents;
    const source = a.framework?.source ? [
      a.framework.source.file,
      a.framework.source.line,
      a.framework.source.column
    ].filter((part) => part !== void 0).join(":") : a.sourceFile;
    const frameworkLabel = a.framework?.name ? `${a.framework.name.slice(0, 1).toUpperCase()}${a.framework.name.slice(1)}` : a.reactComponents ? "React" : void 0;
    if (detailLevel === "compact") {
      output += `${i + 1}. **${a.element}**${source ? ` (${source})` : ""}: ${a.comment}`;
      if (a.selectedText) {
        output += ` (re: "${a.selectedText.slice(0, 30)}${a.selectedText.length > 30 ? "..." : ""}")`;
      }
      output += "\n";
    } else if (detailLevel === "forensic") {
      output += `### ${i + 1}. ${a.element}
`;
      if (a.isMultiSelect && a.fullPath) {
        output += `*Forensic data shown for first element of selection*
`;
      }
      if (a.fullPath) {
        output += `**Full DOM Path:** ${a.fullPath}
`;
      }
      if (a.cssClasses) {
        output += `**CSS Classes:** ${a.cssClasses}
`;
      }
      if (a.boundingBox) {
        output += `**Position:** x:${Math.round(a.boundingBox.x)}, y:${Math.round(a.boundingBox.y)} (${Math.round(a.boundingBox.width)}\xD7${Math.round(a.boundingBox.height)}px)
`;
      }
      output += `**Annotation at:** ${a.x.toFixed(1)}% from left, ${Math.round(a.y)}px from top
`;
      if (a.selectedText) {
        output += `**Selected text:** "${a.selectedText}"
`;
      }
      if (a.nearbyText && !a.selectedText) {
        output += `**Context:** ${a.nearbyText.slice(0, 100)}
`;
      }
      if (a.computedStyles) {
        output += `**Computed Styles:** ${a.computedStyles}
`;
      }
      if (a.accessibility) {
        output += `**Accessibility:** ${a.accessibility}
`;
      }
      if (a.nearbyElements) {
        output += `**Nearby Elements:** ${a.nearbyElements}
`;
      }
      if (source) {
        output += `**Source:** ${source}
`;
      }
      if (componentPath && frameworkLabel) {
        output += `**${frameworkLabel}:** ${componentPath}
`;
      }
      output += `**Feedback:** ${a.comment}

`;
    } else {
      output += `### ${i + 1}. ${a.element}
`;
      output += `**Location:** ${a.elementPath}
`;
      if (source) {
        output += `**Source:** ${source}
`;
      }
      if (componentPath && frameworkLabel) {
        output += `**${frameworkLabel}:** ${componentPath}
`;
      }
      if (detailLevel === "detailed") {
        if (a.cssClasses) {
          output += `**Classes:** ${a.cssClasses}
`;
        }
        if (a.boundingBox) {
          output += `**Position:** ${Math.round(a.boundingBox.x)}px, ${Math.round(a.boundingBox.y)}px (${Math.round(a.boundingBox.width)}\xD7${Math.round(a.boundingBox.height)}px)
`;
        }
      }
      if (a.selectedText) {
        output += `**Selected text:** "${a.selectedText}"
`;
      }
      if (detailLevel === "detailed" && a.nearbyText && !a.selectedText) {
        output += `**Context:** ${a.nearbyText.slice(0, 100)}
`;
      }
      output += `**Feedback:** ${a.comment}

`;
    }
  });
  return output.trim();
}

// src/browser/environment.ts
function safeStorage(read) {
  try {
    const storage = read();
    if (!storage) return void 0;
    void storage.length;
    return storage;
  } catch {
    return void 0;
  }
}
var CSS_ESCAPE_UNSAFE = /[^\w-]/g;
function createRuntimeEnvironment(document) {
  const view = document.defaultView;
  if (!view) {
    throw new Error("Agentation requires a Document attached to a Window");
  }
  const cryptoRef = view.crypto;
  const performanceRef = view.performance;
  const cssRef = view.CSS;
  const unfrozen = getUnfrozenScheduler(document);
  const timers = {
    setTimeout: (handler, timeout) => unfrozen.setTimeout(handler, timeout),
    clearTimeout: (handle) => {
      if (handle !== void 0) unfrozen.clearTimeout(handle);
    },
    setInterval: (handler, timeout) => unfrozen.setInterval(handler, timeout),
    clearInterval: (handle) => {
      if (handle !== void 0) unfrozen.clearInterval(handle);
    },
    requestAnimationFrame: (callback) => typeof unfrozen.requestAnimationFrame === "function" ? unfrozen.requestAnimationFrame(callback) : unfrozen.setTimeout(() => callback(performanceRef?.now() ?? Date.now()), 16),
    cancelAnimationFrame: (handle) => {
      if (handle === void 0) return;
      if (typeof unfrozen.cancelAnimationFrame === "function") {
        unfrozen.cancelAnimationFrame(handle);
      } else {
        unfrozen.clearTimeout(handle);
      }
    }
  };
  const platform = view.navigator?.userAgentData?.platform ?? view.navigator?.platform ?? "";
  return {
    document,
    window: view,
    HTMLElement: view.HTMLElement,
    HTMLInputElement: view.HTMLInputElement,
    HTMLTextAreaElement: view.HTMLTextAreaElement,
    HTMLSelectElement: view.HTMLSelectElement,
    Element: view.Element,
    Node: view.Node,
    ShadowRoot: view.ShadowRoot,
    DOMRect: view.DOMRect,
    CustomEvent: view.CustomEvent,
    AbortController: view.AbortController,
    EventSource: typeof view.EventSource === "function" ? view.EventSource : void 0,
    createElement(tag, className) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      return element;
    },
    createSvg(tag, attributes) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
      if (attributes) {
        for (const [name, value] of Object.entries(attributes)) {
          element.setAttribute(name, value);
        }
      }
      return element;
    },
    localStorage: safeStorage(() => view.localStorage),
    sessionStorage: safeStorage(() => view.sessionStorage),
    fetch(input, init) {
      if (typeof view.fetch !== "function") {
        return Promise.reject(new Error("fetch is unavailable in this environment"));
      }
      return view.fetch(input, init);
    },
    writeClipboardText(text) {
      const clipboard = view.navigator?.clipboard;
      if (!clipboard?.writeText) {
        return Promise.reject(new Error("Clipboard API is unavailable"));
      }
      return clipboard.writeText(text);
    },
    randomId(prefix) {
      if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
        return `${prefix}_${cryptoRef.randomUUID()}`;
      }
      if (cryptoRef && typeof cryptoRef.getRandomValues === "function") {
        const bytes = cryptoRef.getRandomValues(new Uint8Array(8));
        let out = "";
        for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
        return `${prefix}_${out}`;
      }
      return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    },
    now() {
      return Date.now();
    },
    monotonic() {
      return performanceRef?.now() ?? Date.now();
    },
    timers,
    computedStyle(element, pseudo) {
      return view.getComputedStyle(element, pseudo);
    },
    get innerWidth() {
      return view.innerWidth;
    },
    get innerHeight() {
      return view.innerHeight;
    },
    get scrollX() {
      return view.scrollX ?? view.pageXOffset ?? 0;
    },
    get scrollY() {
      return view.scrollY ?? view.pageYOffset ?? 0;
    },
    get devicePixelRatio() {
      return view.devicePixelRatio || 1;
    },
    get pathname() {
      return view.location.pathname;
    },
    get href() {
      return view.location.href;
    },
    escapeSelector(value) {
      if (cssRef && typeof cssRef.escape === "function") return cssRef.escape(value);
      return value.replace(CSS_ESCAPE_UNSAFE, (character) => `\\${character}`);
    },
    getSelectionText() {
      try {
        return view.getSelection()?.toString() ?? "";
      } catch {
        return "";
      }
    },
    clearSelection() {
      try {
        view.getSelection()?.removeAllRanges();
      } catch {
      }
    },
    isApplePlatform: /mac|iphone|ipad|ipod/i.test(platform)
  };
}

// src/browser/layout/types.ts
var DEFAULT_SIZES = {
  navigation: { width: 800, height: 56 },
  hero: { width: 800, height: 320 },
  header: { width: 800, height: 80 },
  section: { width: 800, height: 400 },
  sidebar: { width: 240, height: 400 },
  footer: { width: 800, height: 160 },
  modal: { width: 480, height: 300 },
  card: { width: 280, height: 240 },
  text: { width: 400, height: 120 },
  image: { width: 320, height: 200 },
  video: { width: 480, height: 270 },
  table: { width: 560, height: 220 },
  grid: { width: 600, height: 300 },
  list: { width: 300, height: 180 },
  chart: { width: 400, height: 240 },
  button: { width: 140, height: 40 },
  input: { width: 280, height: 56 },
  form: { width: 360, height: 320 },
  tabs: { width: 480, height: 240 },
  dropdown: { width: 200, height: 200 },
  toggle: { width: 44, height: 24 },
  search: { width: 320, height: 44 },
  avatar: { width: 48, height: 48 },
  badge: { width: 80, height: 28 },
  breadcrumb: { width: 300, height: 24 },
  pagination: { width: 300, height: 36 },
  progress: { width: 240, height: 8 },
  divider: { width: 600, height: 1 },
  accordion: { width: 400, height: 200 },
  carousel: { width: 600, height: 300 },
  toast: { width: 320, height: 64 },
  tooltip: { width: 180, height: 40 },
  pricing: { width: 300, height: 360 },
  testimonial: { width: 360, height: 200 },
  cta: { width: 600, height: 160 },
  alert: { width: 400, height: 56 },
  banner: { width: 800, height: 48 },
  stat: { width: 200, height: 120 },
  stepper: { width: 480, height: 48 },
  tag: { width: 72, height: 28 },
  rating: { width: 160, height: 28 },
  map: { width: 480, height: 300 },
  timeline: { width: 360, height: 320 },
  fileUpload: { width: 360, height: 180 },
  codeBlock: { width: 480, height: 200 },
  calendar: { width: 300, height: 300 },
  notification: { width: 360, height: 72 },
  productCard: { width: 280, height: 360 },
  profile: { width: 280, height: 200 },
  drawer: { width: 320, height: 400 },
  popover: { width: 240, height: 160 },
  logo: { width: 120, height: 40 },
  faq: { width: 560, height: 320 },
  gallery: { width: 560, height: 360 },
  checkbox: { width: 20, height: 20 },
  radio: { width: 20, height: 20 },
  slider: { width: 240, height: 32 },
  datePicker: { width: 300, height: 320 },
  skeleton: { width: 320, height: 120 },
  chip: { width: 96, height: 32 },
  icon: { width: 24, height: 24 },
  spinner: { width: 32, height: 32 },
  feature: { width: 360, height: 200 },
  team: { width: 560, height: 280 },
  login: { width: 360, height: 360 },
  contact: { width: 400, height: 320 }
};
var COMPONENT_REGISTRY = [
  {
    section: "Layout",
    items: [
      { type: "navigation", label: "Navigation", ...DEFAULT_SIZES.navigation },
      { type: "header", label: "Header", ...DEFAULT_SIZES.header },
      { type: "hero", label: "Hero", ...DEFAULT_SIZES.hero },
      { type: "section", label: "Section", ...DEFAULT_SIZES.section },
      { type: "sidebar", label: "Sidebar", ...DEFAULT_SIZES.sidebar },
      { type: "footer", label: "Footer", ...DEFAULT_SIZES.footer },
      { type: "modal", label: "Modal", ...DEFAULT_SIZES.modal },
      { type: "banner", label: "Banner", ...DEFAULT_SIZES.banner },
      { type: "drawer", label: "Drawer", ...DEFAULT_SIZES.drawer },
      { type: "popover", label: "Popover", ...DEFAULT_SIZES.popover },
      { type: "divider", label: "Divider", ...DEFAULT_SIZES.divider }
    ]
  },
  {
    section: "Content",
    items: [
      { type: "card", label: "Card", ...DEFAULT_SIZES.card },
      { type: "text", label: "Text", ...DEFAULT_SIZES.text },
      { type: "image", label: "Image", ...DEFAULT_SIZES.image },
      { type: "video", label: "Video", ...DEFAULT_SIZES.video },
      { type: "table", label: "Table", ...DEFAULT_SIZES.table },
      { type: "grid", label: "Grid", ...DEFAULT_SIZES.grid },
      { type: "list", label: "List", ...DEFAULT_SIZES.list },
      { type: "chart", label: "Chart", ...DEFAULT_SIZES.chart },
      { type: "codeBlock", label: "Code Block", ...DEFAULT_SIZES.codeBlock },
      { type: "map", label: "Map", ...DEFAULT_SIZES.map },
      { type: "timeline", label: "Timeline", ...DEFAULT_SIZES.timeline },
      { type: "calendar", label: "Calendar", ...DEFAULT_SIZES.calendar },
      { type: "accordion", label: "Accordion", ...DEFAULT_SIZES.accordion },
      { type: "carousel", label: "Carousel", ...DEFAULT_SIZES.carousel },
      { type: "logo", label: "Logo", ...DEFAULT_SIZES.logo },
      { type: "faq", label: "FAQ", ...DEFAULT_SIZES.faq },
      { type: "gallery", label: "Gallery", ...DEFAULT_SIZES.gallery }
    ]
  },
  {
    section: "Controls",
    items: [
      { type: "button", label: "Button", ...DEFAULT_SIZES.button },
      { type: "input", label: "Input", ...DEFAULT_SIZES.input },
      { type: "search", label: "Search", ...DEFAULT_SIZES.search },
      { type: "form", label: "Form", ...DEFAULT_SIZES.form },
      { type: "tabs", label: "Tabs", ...DEFAULT_SIZES.tabs },
      { type: "dropdown", label: "Dropdown", ...DEFAULT_SIZES.dropdown },
      { type: "toggle", label: "Toggle", ...DEFAULT_SIZES.toggle },
      { type: "stepper", label: "Stepper", ...DEFAULT_SIZES.stepper },
      { type: "rating", label: "Rating", ...DEFAULT_SIZES.rating },
      { type: "fileUpload", label: "File Upload", ...DEFAULT_SIZES.fileUpload },
      { type: "checkbox", label: "Checkbox", ...DEFAULT_SIZES.checkbox },
      { type: "radio", label: "Radio", ...DEFAULT_SIZES.radio },
      { type: "slider", label: "Slider", ...DEFAULT_SIZES.slider },
      { type: "datePicker", label: "Date Picker", ...DEFAULT_SIZES.datePicker }
    ]
  },
  {
    section: "Elements",
    items: [
      { type: "avatar", label: "Avatar", ...DEFAULT_SIZES.avatar },
      { type: "badge", label: "Badge", ...DEFAULT_SIZES.badge },
      { type: "tag", label: "Tag", ...DEFAULT_SIZES.tag },
      { type: "breadcrumb", label: "Breadcrumb", ...DEFAULT_SIZES.breadcrumb },
      { type: "pagination", label: "Pagination", ...DEFAULT_SIZES.pagination },
      { type: "progress", label: "Progress", ...DEFAULT_SIZES.progress },
      { type: "alert", label: "Alert", ...DEFAULT_SIZES.alert },
      { type: "toast", label: "Toast", ...DEFAULT_SIZES.toast },
      { type: "notification", label: "Notification", ...DEFAULT_SIZES.notification },
      { type: "tooltip", label: "Tooltip", ...DEFAULT_SIZES.tooltip },
      { type: "stat", label: "Stat", ...DEFAULT_SIZES.stat },
      { type: "skeleton", label: "Skeleton", ...DEFAULT_SIZES.skeleton },
      { type: "chip", label: "Chip", ...DEFAULT_SIZES.chip },
      { type: "icon", label: "Icon", ...DEFAULT_SIZES.icon },
      { type: "spinner", label: "Spinner", ...DEFAULT_SIZES.spinner }
    ]
  },
  {
    section: "Blocks",
    items: [
      { type: "pricing", label: "Pricing", ...DEFAULT_SIZES.pricing },
      { type: "testimonial", label: "Testimonial", ...DEFAULT_SIZES.testimonial },
      { type: "cta", label: "CTA", ...DEFAULT_SIZES.cta },
      { type: "productCard", label: "Product Card", ...DEFAULT_SIZES.productCard },
      { type: "profile", label: "Profile", ...DEFAULT_SIZES.profile },
      { type: "feature", label: "Feature", ...DEFAULT_SIZES.feature },
      { type: "team", label: "Team", ...DEFAULT_SIZES.team },
      { type: "login", label: "Login", ...DEFAULT_SIZES.login },
      { type: "contact", label: "Contact", ...DEFAULT_SIZES.contact }
    ]
  }
];
var COMPONENT_MAP = {};
for (const section of COMPONENT_REGISTRY) {
  for (const item of section.items) {
    COMPONENT_MAP[item.type] = item;
  }
}

// src/browser/layout/section-detection.ts
var SECTION_ROLES = {
  banner: "Header",
  navigation: "Navigation",
  main: "Main Content",
  contentinfo: "Footer",
  complementary: "Sidebar",
  region: "Section"
};
var TAG_LABELS = {
  nav: "Navigation",
  header: "Header",
  main: "Main Content",
  section: "Section",
  article: "Article",
  footer: "Footer",
  aside: "Sidebar"
};
function isEffectivelyFixed(environment, el) {
  const doc = environment.document;
  let current = el;
  while (current && current !== doc.body && current !== doc.documentElement) {
    const pos = environment.computedStyle(current).position;
    if (pos === "fixed" || pos === "sticky") return true;
    current = current.parentElement;
  }
  return false;
}
function generateSelector(environment, el) {
  const doc = environment.document;
  const tag = el.tagName.toLowerCase();
  if (["nav", "header", "footer", "main"].includes(tag)) {
    if (doc.querySelectorAll(tag).length === 1) {
      return tag;
    }
  }
  if (el.id) {
    return `#${environment.escapeSelector(el.id)}`;
  }
  if (el.className && typeof el.className === "string") {
    const classes = el.className.split(/\s+/).filter((c) => c.length > 0);
    const meaningful = classes.find(
      (c) => c.length > 2 && !/^[a-zA-Z0-9]{6,}$/.test(c) && !/^[a-z]{1,2}$/.test(c)
    );
    if (meaningful) {
      const selector = `${tag}.${environment.escapeSelector(meaningful)}`;
      if (doc.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
  }
  const parent = el.parentElement;
  if (parent) {
    const children = Array.from(parent.children);
    const index = children.indexOf(el) + 1;
    const parentSelector = parent === doc.body ? "body" : generateSelector(environment, parent);
    return `${parentSelector} > ${tag}:nth-child(${index})`;
  }
  return tag;
}
function labelSection(el) {
  const tag = el.tagName.toLowerCase();
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;
  const role = el.getAttribute("role");
  if (role && SECTION_ROLES[role]) return SECTION_ROLES[role];
  if (TAG_LABELS[tag]) return TAG_LABELS[tag];
  const heading = el.querySelector("h1, h2, h3, h4, h5, h6");
  if (heading) {
    const text = heading.textContent?.trim();
    if (text && text.length <= 50) return text;
    if (text) return text.slice(0, 47) + "...";
  }
  const { name } = identifyElement(el);
  return name.charAt(0).toUpperCase() + name.slice(1);
}
function getCleanClassName(el) {
  const className = el.className;
  if (typeof className !== "string" || !className) return null;
  const meaningful = className.split(/\s+/).map((c) => c.replace(/[_][a-zA-Z0-9]{5,}.*$/, "")).find((c) => c.length > 2 && !/^[a-z]{1,2}$/.test(c));
  return meaningful || null;
}
function getTextSnippet(el) {
  const text = el.textContent?.trim();
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ");
  if (clean.length <= 30) return clean;
  return clean.slice(0, 30) + "\u2026";
}
function captureElement(environment, el) {
  const scrollY = environment.scrollY;
  const rect = el.getBoundingClientRect();
  const isFixed = isEffectivelyFixed(environment, el);
  const sectionRect = {
    x: rect.x,
    y: isFixed ? rect.y : rect.y + scrollY,
    width: rect.width,
    height: rect.height
  };
  const parent = el.parentElement;
  let originalIndex = 0;
  if (parent) {
    originalIndex = Array.from(parent.children).indexOf(el);
  }
  return {
    id: `rs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: labelSection(el),
    tagName: el.tagName.toLowerCase(),
    selector: generateSelector(environment, el),
    role: el.getAttribute("role"),
    className: getCleanClassName(el),
    textSnippet: getTextSnippet(el),
    originalRect: sectionRect,
    currentRect: { ...sectionRect },
    originalIndex,
    isFixed
  };
}

// src/browser/layout/spatial.ts
var SKIP_TAGS = /* @__PURE__ */ new Set(["script", "style", "noscript", "link", "meta", "br", "hr"]);
function collectDOMCandidates(environment) {
  const doc = environment.document;
  const main = doc.querySelector("main") || doc.body;
  const results = [];
  const topLevel = Array.from(main.children);
  const roots = main !== doc.body && topLevel.length < 3 ? Array.from(doc.body.children) : topLevel;
  for (const el of roots) {
    if (!(el instanceof environment.HTMLElement)) continue;
    if (SKIP_TAGS.has(el.tagName.toLowerCase())) continue;
    if (el.hasAttribute("data-feedback-toolbar")) continue;
    const style = environment.computedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const rect = el.getBoundingClientRect();
    if (rect.height < 10 || rect.width < 10) continue;
    results.push({
      label: labelSection(el),
      selector: generateSelector(environment, el),
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      area: rect.width * rect.height
    });
    for (const child of Array.from(el.children)) {
      if (!(child instanceof environment.HTMLElement)) continue;
      if (SKIP_TAGS.has(child.tagName.toLowerCase())) continue;
      if (child.hasAttribute("data-feedback-toolbar")) continue;
      const childStyle = environment.computedStyle(child);
      if (childStyle.display === "none" || childStyle.visibility === "hidden") continue;
      const cr = child.getBoundingClientRect();
      if (cr.height < 10 || cr.width < 10) continue;
      results.push({
        label: labelSection(child),
        selector: generateSelector(environment, child),
        top: cr.top,
        bottom: cr.bottom,
        left: cr.left,
        right: cr.right,
        area: cr.width * cr.height
      });
    }
  }
  return results;
}
function explicitToCandidates(environment, items) {
  const scrollY = environment.scrollY;
  return items.map(({ label: label2, selector, rect }) => {
    const top = rect.y - scrollY;
    return {
      label: label2,
      selector,
      top,
      bottom: top + rect.height,
      left: rect.x,
      right: rect.x + rect.width,
      area: rect.width * rect.height
    };
  });
}
function toViewportEdges(environment, r) {
  const scrollY = environment.scrollY;
  const top = r.y - scrollY;
  const left = r.x;
  return {
    top,
    bottom: top + r.height,
    left,
    right: left + r.width,
    area: r.width * r.height
  };
}
function getSpatialContext(environment, targetRect, siblings) {
  const candidates = siblings ? explicitToCandidates(environment, siblings) : collectDOMCandidates(environment);
  const target = toViewportEdges(environment, targetRect);
  let above = null;
  let below = null;
  let left = null;
  let right = null;
  let containedIn = null;
  for (const c of candidates) {
    if (Math.abs(c.left - target.left) < 2 && Math.abs(c.top - target.top) < 2 && Math.abs(c.right - c.left - targetRect.width) < 2 && Math.abs(c.bottom - c.top - targetRect.height) < 2) {
      continue;
    }
    if (c.left <= target.left + 2 && c.right >= target.right - 2 && c.top <= target.top + 2 && c.bottom >= target.bottom - 2 && c.area > target.area * 1.5) {
      if (!containedIn || c.area < containedIn._area) {
        containedIn = { label: c.label, selector: c.selector, _area: c.area };
      }
    }
    const hOverlap = target.right > c.left + 5 && target.left < c.right - 5;
    const vOverlap = target.bottom > c.top + 5 && target.top < c.bottom - 5;
    if (hOverlap && c.bottom <= target.top + 5) {
      const gap = Math.round(target.top - c.bottom);
      if (!above || gap < above._dist) {
        above = { label: c.label, selector: c.selector, gap: Math.max(0, gap), _dist: gap };
      }
    }
    if (hOverlap && c.top >= target.bottom - 5) {
      const gap = Math.round(c.top - target.bottom);
      if (!below || gap < below._dist) {
        below = { label: c.label, selector: c.selector, gap: Math.max(0, gap), _dist: gap };
      }
    }
    if (vOverlap && c.right <= target.left + 5) {
      const gap = Math.round(target.left - c.right);
      if (!left || gap < left._dist) {
        left = { label: c.label, selector: c.selector, gap: Math.max(0, gap), _dist: gap };
      }
    }
    if (vOverlap && c.left >= target.right - 5) {
      const gap = Math.round(c.left - target.right);
      if (!right || gap < right._dist) {
        right = { label: c.label, selector: c.selector, gap: Math.max(0, gap), _dist: gap };
      }
    }
  }
  const viewportWidth = environment.innerWidth;
  const viewportHeight = environment.innerHeight;
  const alignment = getAlignment(targetRect, viewportWidth);
  const clean = (n) => {
    if (!n) return null;
    return { label: n.label, selector: n.selector, gap: n.gap };
  };
  const outOfBounds = detectBoundsOverflow(
    target,
    targetRect,
    viewportWidth,
    viewportHeight,
    containedIn ? { label: containedIn.label, selector: containedIn.selector, _area: containedIn._area } : null,
    candidates
  );
  return {
    above: clean(above),
    below: clean(below),
    left: clean(left),
    right: clean(right),
    alignment,
    containedIn: containedIn ? { label: containedIn.label, selector: containedIn.selector } : null,
    outOfBounds
  };
}
function detectBoundsOverflow(targetEdges, targetRect, viewportWidth, viewportHeight, container, candidates) {
  const result = {};
  let hasOverflow = false;
  const vpOverflow = [];
  if (targetEdges.left < -2) vpOverflow.push("left");
  if (targetEdges.right > viewportWidth + 2) vpOverflow.push("right");
  if (targetEdges.top < -2) vpOverflow.push("top");
  if (targetEdges.bottom > viewportHeight + 2) vpOverflow.push("bottom");
  if (vpOverflow.length > 0) {
    result.viewport = vpOverflow;
    hasOverflow = true;
  }
  if (container) {
    const cont = candidates.find(
      (c) => c.label === container.label && c.selector === container.selector && Math.abs(c.area - container._area) < 10
    );
    if (cont) {
      const contOverflow = [];
      if (targetEdges.left < cont.left - 2) contOverflow.push("left");
      if (targetEdges.right > cont.right + 2) contOverflow.push("right");
      if (targetEdges.top < cont.top - 2) contOverflow.push("top");
      if (targetEdges.bottom > cont.bottom + 2) contOverflow.push("bottom");
      if (contOverflow.length > 0) {
        result.container = { label: container.label, edges: contOverflow };
        hasOverflow = true;
      }
    }
  }
  return hasOverflow ? result : null;
}
function getAlignment(rect, viewportWidth) {
  const ratio = rect.width / viewportWidth;
  if (ratio > 0.85) return "full-width";
  const centerX = rect.x + rect.width / 2;
  const viewportCenter = viewportWidth / 2;
  const offset = centerX - viewportCenter;
  const tolerance = viewportWidth * 0.08;
  if (Math.abs(offset) < tolerance) return "center";
  if (offset < 0) return "left";
  return "right";
}
function formatAlignment(alignment) {
  switch (alignment) {
    case "full-width":
      return "full-width";
    case "center":
      return "centered";
    case "left":
      return "left-aligned";
    case "right":
      return "right-aligned";
  }
}
function formatSpatialLines(ctx, options = {}) {
  const lines = [];
  if (ctx.above) {
    lines.push(`Below \`${ctx.above.label}\`${ctx.above.gap > 0 ? ` (${ctx.above.gap}px gap)` : ""}`);
  }
  if (ctx.below) {
    lines.push(`Above \`${ctx.below.label}\`${ctx.below.gap > 0 ? ` (${ctx.below.gap}px gap)` : ""}`);
  }
  if (options.includeLeftRight) {
    if (ctx.left) {
      lines.push(`Right of \`${ctx.left.label}\`${ctx.left.gap > 0 ? ` (${ctx.left.gap}px gap)` : ""}`);
    }
    if (ctx.right) {
      lines.push(`Left of \`${ctx.right.label}\`${ctx.right.gap > 0 ? ` (${ctx.right.gap}px gap)` : ""}`);
    }
  }
  const alignStr = formatAlignment(ctx.alignment);
  if (ctx.containedIn) {
    lines.push(`${alignStr.charAt(0).toUpperCase() + alignStr.slice(1)} in \`${ctx.containedIn.label}\``);
  } else {
    lines.push(`${alignStr.charAt(0).toUpperCase() + alignStr.slice(1)} in page`);
  }
  if (options.includePixelRef && options.pixelRef) {
    lines.push(`Pixel ref: \`${options.pixelRef}\``);
  }
  if (ctx.outOfBounds) {
    if (ctx.outOfBounds.viewport) {
      lines.push(`**Outside viewport** (${ctx.outOfBounds.viewport.join(", ")} edge${ctx.outOfBounds.viewport.length > 1 ? "s" : ""})`);
    }
    if (ctx.outOfBounds.container) {
      lines.push(`**Outside \`${ctx.outOfBounds.container.label}\`** (${ctx.outOfBounds.container.edges.join(", ")} edge${ctx.outOfBounds.container.edges.length > 1 ? "s" : ""})`);
    }
  }
  return lines;
}
function formatPositionSummary(ctx, coords, size) {
  const parts = [];
  if (ctx.above) parts.push(`below \`${ctx.above.label}\``);
  if (ctx.below) parts.push(`above \`${ctx.below.label}\``);
  if (ctx.left) parts.push(`right of \`${ctx.left.label}\``);
  if (ctx.right) parts.push(`left of \`${ctx.right.label}\``);
  if (ctx.containedIn) parts.push(`inside \`${ctx.containedIn.label}\``);
  parts.push(formatAlignment(ctx.alignment));
  if (ctx.outOfBounds?.viewport) {
    parts.push(`**outside viewport** (${ctx.outOfBounds.viewport.join(", ")})`);
  }
  if (ctx.outOfBounds?.container) {
    parts.push(`**outside \`${ctx.outOfBounds.container.label}\`** (${ctx.outOfBounds.container.edges.join(", ")})`);
  }
  const sizeStr = size ? `, ${Math.round(size.width)}\xD7${Math.round(size.height)}px` : "";
  return `at (${Math.round(coords.x)}, ${Math.round(coords.y)})${sizeStr}: ${parts.join(", ")}`;
}
var GROUP_TOLERANCE = 15;
function detectGroups(items) {
  if (items.length < 2) return [];
  const groups = [];
  const used = /* @__PURE__ */ new Set();
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const row = [i];
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(items[i].rect.y - items[j].rect.y) < GROUP_TOLERANCE) {
        row.push(j);
      }
    }
    if (row.length >= 2) {
      const members = row.map((idx) => items[idx]);
      members.sort((a, b) => a.rect.x - b.rect.x);
      const gaps = [];
      for (let k = 0; k < members.length - 1; k++) {
        gaps.push(Math.round(members[k + 1].rect.x - (members[k].rect.x + members[k].rect.width)));
      }
      const avgY = Math.round(members.reduce((sum, m) => sum + m.rect.y, 0) / members.length);
      groups.push({
        labels: members.map((m) => m.label),
        type: "row",
        sharedEdge: avgY,
        gaps,
        avgGap: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0
      });
      row.forEach((idx) => used.add(idx));
    }
  }
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const col = [i];
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(items[i].rect.x - items[j].rect.x) < GROUP_TOLERANCE) {
        col.push(j);
      }
    }
    if (col.length >= 2) {
      const members = col.map((idx) => items[idx]);
      members.sort((a, b) => a.rect.y - b.rect.y);
      const gaps = [];
      for (let k = 0; k < members.length - 1; k++) {
        gaps.push(Math.round(members[k + 1].rect.y - (members[k].rect.y + members[k].rect.height)));
      }
      const avgX = Math.round(members.reduce((sum, m) => sum + m.rect.x, 0) / members.length);
      groups.push({
        labels: members.map((m) => m.label),
        type: "column",
        sharedEdge: avgX,
        gaps,
        avgGap: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0
      });
      col.forEach((idx) => used.add(idx));
    }
  }
  return groups;
}
function analyzeLayoutPatterns(sections) {
  if (sections.length < 2) return [];
  const origGroups = detectGroups(sections.map((s) => ({ label: s.label, rect: s.originalRect })));
  const currGroups = detectGroups(sections.map((s) => ({ label: s.label, rect: s.currentRect })));
  const lines = [];
  const described = /* @__PURE__ */ new Set();
  for (const og of origGroups) {
    const ogSet = new Set(og.labels);
    let bestMatch = null;
    let bestOverlap = 0;
    for (const cg of currGroups) {
      const overlap = cg.labels.filter((l) => ogSet.has(l)).length;
      if (overlap >= 2 && overlap > bestOverlap) {
        bestMatch = cg;
        bestOverlap = overlap;
      }
    }
    if (bestMatch) {
      const sharedLabels = bestMatch.labels.filter((l) => ogSet.has(l));
      const names = sharedLabels.join(", ");
      if (bestMatch.type !== og.type) {
        const fromAxis = og.type === "row" ? "y" : "x";
        const toAxis = bestMatch.type === "row" ? "y" : "x";
        lines.push(
          `**${names}**: ${og.type} (${fromAxis}\u2248${og.sharedEdge}, ${og.avgGap}px gaps) \u2192 ${bestMatch.type} (${toAxis}\u2248${bestMatch.sharedEdge}, ${bestMatch.avgGap}px gaps)`
        );
      } else if (Math.abs(og.sharedEdge - bestMatch.sharedEdge) > 20 || Math.abs(og.avgGap - bestMatch.avgGap) > 5) {
        const axis = og.type === "row" ? "y" : "x";
        const posChange = Math.abs(og.sharedEdge - bestMatch.sharedEdge) > 20 ? ` ${axis}: ${og.sharedEdge} \u2192 ${bestMatch.sharedEdge}` : "";
        const gapChange = Math.abs(og.avgGap - bestMatch.avgGap) > 5 ? ` gaps: ${og.avgGap}px \u2192 ${bestMatch.avgGap}px` : "";
        lines.push(`**${names}**: ${og.type} shifted \u2014${posChange}${gapChange}`);
      }
      sharedLabels.forEach((l) => described.add(l));
    } else {
      const names = og.labels.join(", ");
      const axis = og.type === "row" ? "y" : "x";
      lines.push(`**${names}**: ${og.type} (${axis}\u2248${og.sharedEdge}) dissolved`);
      og.labels.forEach((l) => described.add(l));
    }
  }
  for (const cg of currGroups) {
    if (cg.labels.every((l) => described.has(l))) continue;
    const newLabels = cg.labels.filter((l) => !described.has(l));
    if (newLabels.length < 2) continue;
    const wasGrouped = origGroups.some((og) => {
      const overlap = og.labels.filter((l) => cg.labels.includes(l));
      return overlap.length >= 2;
    });
    if (!wasGrouped) {
      const axis = cg.type === "row" ? "y" : "x";
      lines.push(`**${cg.labels.join(", ")}**: new ${cg.type} (${axis}\u2248${cg.sharedEdge}, ${cg.avgGap}px gaps)`);
      cg.labels.forEach((l) => described.add(l));
    }
  }
  const ungroupedCurr = sections.filter((s) => !described.has(s.label));
  if (ungroupedCurr.length >= 2) {
    const byX = {};
    for (const s of ungroupedCurr) {
      const x = Math.round(s.currentRect.x / 5) * 5;
      (byX[x] ?? (byX[x] = [])).push(s.label);
    }
    for (const [x, labels] of Object.entries(byX)) {
      if (labels.length >= 2) {
        lines.push(`**${labels.join(", ")}**: shared left edge at x\u2248${x}`);
      }
    }
  }
  return lines;
}
function getPageLayout(environment, viewport) {
  const doc = environment.document;
  const candidates = [];
  const seen = /* @__PURE__ */ new Set();
  const addCandidate = (el) => {
    if (seen.has(el)) return;
    if (!(el instanceof environment.HTMLElement)) return;
    if (el.hasAttribute("data-feedback-toolbar")) return;
    if (SKIP_TAGS.has(el.tagName.toLowerCase())) return;
    seen.add(el);
    candidates.push(el);
  };
  const main = doc.querySelector("main");
  if (main) addCandidate(main);
  const roleMain = doc.querySelector("[role='main']");
  if (roleMain) addCandidate(roleMain);
  for (const l1 of Array.from(doc.body.children)) {
    addCandidate(l1);
    if (l1.children) {
      for (const l2 of Array.from(l1.children)) {
        addCandidate(l2);
        if (l2.children) {
          for (const l3 of Array.from(l2.children)) {
            addCandidate(l3);
          }
        }
      }
    }
  }
  let bestContainer = null;
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.height < 50) continue;
    const style = environment.computedStyle(el);
    if (style.maxWidth && style.maxWidth !== "none" && style.maxWidth !== "0px") {
      if (!bestContainer || rect.width < bestContainer.rect.width) {
        bestContainer = { el, rect };
      }
      continue;
    }
    if (!bestContainer && rect.width < viewport.width - 20 && rect.width > 100) {
      bestContainer = { el, rect };
    }
  }
  if (bestContainer) {
    const { el, rect } = bestContainer;
    return {
      viewport,
      contentArea: {
        width: Math.round(rect.width),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        centerX: Math.round(rect.left + rect.width / 2),
        selector: generateSelector(environment, el)
      }
    };
  }
  return { viewport, contentArea: null };
}
function getElementCSSContext(environment, selector) {
  const el = environment.document.querySelector(selector);
  if (!el?.parentElement) return null;
  const ps = environment.computedStyle(el.parentElement);
  const result = {
    parentDisplay: ps.display,
    parentSelector: generateSelector(environment, el.parentElement)
  };
  if (ps.display.includes("flex")) {
    result.flexDirection = ps.flexDirection;
  }
  if (ps.display.includes("grid") && ps.gridTemplateColumns !== "none") {
    result.gridCols = ps.gridTemplateColumns;
  }
  if (ps.gap && ps.gap !== "normal" && ps.gap !== "0px") {
    result.gap = ps.gap;
  }
  return result;
}
function formatCSSPosition(rect, layout) {
  const ref = layout.contentArea;
  const containerWidth = ref ? ref.width : layout.viewport.width;
  const containerLeft = ref ? ref.left : 0;
  const containerCenterX = ref ? ref.centerX : Math.round(layout.viewport.width / 2);
  const leftInContainer = Math.round(rect.x - containerLeft);
  const rightInContainer = Math.round(containerLeft + containerWidth - (rect.x + rect.width));
  const widthPct = (rect.width / containerWidth * 100).toFixed(1);
  const centerX = rect.x + rect.width / 2;
  const isCentered = Math.abs(centerX - containerCenterX) < 20;
  const isFullWidth = rect.width / containerWidth > 0.95;
  const parts = [];
  if (isFullWidth) {
    parts.push("`width: 100%` of container");
  } else {
    parts.push(`left \`${leftInContainer}px\` in container, right \`${rightInContainer}px\`, width \`${widthPct}%\` (\`${Math.round(rect.width)}px\`)`);
  }
  if (isCentered && !isFullWidth) {
    parts.push("centered \u2014 `margin-inline: auto`");
  }
  return parts.join(" \u2014 ");
}

// src/browser/layout/output.ts
function formatReferenceFrame(layout) {
  const { viewport, contentArea } = layout;
  let out = "### Reference Frame\n";
  out += `- Viewport: \`${viewport.width}\xD7${viewport.height}px\`
`;
  if (contentArea) {
    const ca = contentArea;
    out += `- Content area: \`${ca.width}px\` wide, left edge at \`x=${ca.left}\`, right at \`x=${ca.right}\` (\`${ca.selector}\`)
`;
    out += `- Pixel \u2192 CSS translation:
`;
    out += `  - **Horizontal position in container**: \`element.x - ${ca.left}\` \u2192 use as \`margin-left\` or \`left\`
`;
    out += `  - **Width as % of container**: \`element.width / ${ca.width} \xD7 100\` \u2192 use as \`width: X%\`
`;
    out += `  - **Vertical gap between elements**: \`nextElement.y - (prevElement.y + prevElement.height)\` \u2192 use as \`margin-top\` or \`gap\`
`;
    out += `  - **Centered**: if \`|element.centerX - ${ca.centerX}| < 20px\` \u2192 use \`margin-inline: auto\`
`;
  } else {
    out += `- No distinct content container \u2014 elements positioned relative to full viewport
`;
    out += `- Pixel \u2192 CSS translation:
`;
    out += `  - **Width as % of viewport**: \`element.width / ${viewport.width} \xD7 100\` \u2192 use as \`width: X%\`
`;
    out += `  - **Centered**: if \`|(element.x + element.width/2) - ${Math.round(viewport.width / 2)}| < 20px\` \u2192 use \`margin-inline: auto\`
`;
  }
  out += "\n";
  return out;
}
function formatParentContext(environment, selector) {
  const ctx = getElementCSSContext(environment, selector);
  if (!ctx) return null;
  let desc = `\`${ctx.parentDisplay}\``;
  if (ctx.flexDirection) desc += `, flex-direction: \`${ctx.flexDirection}\``;
  if (ctx.gridCols) desc += `, grid-template-columns: \`${ctx.gridCols}\``;
  if (ctx.gap) desc += `, gap: \`${ctx.gap}\``;
  return `Parent: ${desc} (\`${ctx.parentSelector}\`)`;
}
function generateDesignOutput(environment, placements, viewport, options, detailLevel = "standard") {
  if (placements.length === 0) return "";
  const sorted = [...placements].sort((a, b) => {
    if (Math.abs(a.y - b.y) < 20) return a.x - b.x;
    return a.y - b.y;
  });
  let out = "";
  if (options?.blankCanvas) {
    out += `## Wireframe: New Page

`;
    if (options.wireframePurpose) {
      out += `> **Purpose:** ${options.wireframePurpose}
>
`;
    }
    out += `> ${placements.length} component${placements.length !== 1 ? "s" : ""} placed \u2014 this is a standalone wireframe, not related to the current page.
>
> This wireframe is a rough sketch for exploring ideas.

`;
  } else {
    out += `## Design Layout

> ${placements.length} component${placements.length !== 1 ? "s" : ""} placed

`;
  }
  if (detailLevel === "compact") {
    out += "### Components\n";
    sorted.forEach((c, i) => {
      const label2 = COMPONENT_MAP[c.type]?.label || c.type;
      out += `${i + 1}. **${label2}** \u2014 \`${Math.round(c.width)}\xD7${Math.round(c.height)}px\` at \`(${Math.round(c.x)}, ${Math.round(c.y)})\`
`;
    });
    return out;
  }
  const layout = getPageLayout(environment, viewport);
  out += formatReferenceFrame(layout);
  out += "### Components\n";
  sorted.forEach((c, i) => {
    const label2 = COMPONENT_MAP[c.type]?.label || c.type;
    const rect = { x: c.x, y: c.y, width: c.width, height: c.height };
    out += `${i + 1}. **${label2}** \u2014 \`${Math.round(c.width)}\xD7${Math.round(c.height)}px\` at \`(${Math.round(c.x)}, ${Math.round(c.y)})\`
`;
    const ctx = getSpatialContext(environment, rect);
    const includeLeftRight = detailLevel === "detailed" || detailLevel === "forensic";
    const lines = formatSpatialLines(ctx, { includeLeftRight });
    for (const line of lines) {
      out += `   - ${line}
`;
    }
    const cssPos = formatCSSPosition(rect, layout);
    if (cssPos) {
      out += `   - CSS: ${cssPos}
`;
    }
  });
  out += "\n### Layout Analysis\n";
  const rows = [];
  for (const c of sorted) {
    const existing = rows.find((r) => Math.abs(r.y - c.y) < 30);
    if (existing) {
      existing.items.push(c);
    } else {
      rows.push({ y: c.y, items: [c] });
    }
  }
  rows.sort((a, b) => a.y - b.y);
  rows.forEach((row, i) => {
    row.items.sort((a, b) => a.x - b.x);
    const labels = row.items.map((c) => COMPONENT_MAP[c.type]?.label || c.type);
    if (row.items.length === 1) {
      const c = row.items[0];
      const isFullWidth = c.width > viewport.width * 0.8;
      out += `- Row ${i + 1} (y\u2248${Math.round(row.y)}): ${labels[0]}${isFullWidth ? " \u2014 full width" : ""}
`;
    } else {
      out += `- Row ${i + 1} (y\u2248${Math.round(row.y)}): ${labels.join(" | ")} \u2014 ${row.items.length} items side by side
`;
    }
  });
  if (detailLevel === "detailed" || detailLevel === "forensic") {
    out += "\n### Spacing & Gaps\n";
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const labelA = COMPONENT_MAP[a.type]?.label || a.type;
      const labelB = COMPONENT_MAP[b.type]?.label || b.type;
      const vGap = Math.round(b.y - (a.y + a.height));
      const hGap = Math.round(b.x - (a.x + a.width));
      if (Math.abs(a.y - b.y) < 30) {
        out += `- ${labelA} \u2192 ${labelB}: \`${hGap}px\` horizontal gap
`;
      } else {
        out += `- ${labelA} \u2192 ${labelB}: \`${vGap}px\` vertical gap
`;
      }
    }
    if (detailLevel === "forensic" && sorted.length > 2) {
      out += "\n### All Pairwise Gaps\n";
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i];
          const b = sorted[j];
          const labelA = COMPONENT_MAP[a.type]?.label || a.type;
          const labelB = COMPONENT_MAP[b.type]?.label || b.type;
          const vGap = Math.round(b.y - (a.y + a.height));
          const hGap = Math.round(b.x - (a.x + a.width));
          out += `- ${labelA} \u2194 ${labelB}: h=\`${hGap}px\` v=\`${vGap}px\`
`;
        }
      }
    }
    if (detailLevel === "forensic") {
      out += "\n### Z-Order (placement order)\n";
      placements.forEach((c, i) => {
        const label2 = COMPONENT_MAP[c.type]?.label || c.type;
        out += `${i}. ${label2} at \`(${Math.round(c.x)}, ${Math.round(c.y)})\`
`;
      });
    }
  }
  out += "\n### Suggested Implementation\n";
  const hasNav = sorted.some((c) => c.type === "navigation");
  const hasHero = sorted.some((c) => c.type === "hero");
  const hasSidebar = sorted.some((c) => c.type === "sidebar");
  const hasFooter = sorted.some((c) => c.type === "footer");
  const cards = sorted.filter((c) => c.type === "card");
  const forms = sorted.filter((c) => c.type === "form");
  const tables = sorted.filter((c) => c.type === "table");
  const modals = sorted.filter((c) => c.type === "modal");
  if (hasNav) out += "- Top navigation bar with logo + nav links + CTA\n";
  if (hasHero) out += "- Hero section with heading, subtext, and call-to-action\n";
  if (hasSidebar) out += "- Sidebar layout \u2014 use CSS Grid with sidebar + main content area\n";
  if (cards.length > 1) out += `- ${cards.length}-column card grid \u2014 use CSS Grid or Flexbox
`;
  else if (cards.length === 1) out += "- Card component with image + content area\n";
  if (forms.length > 0) out += `- ${forms.length} form${forms.length > 1 ? "s" : ""} \u2014 add proper labels, validation, and submit handling
`;
  if (tables.length > 0) out += "- Data table \u2014 consider sortable columns and pagination\n";
  if (modals.length > 0) out += "- Modal dialog \u2014 add overlay backdrop and focus trapping\n";
  if (hasFooter) out += "- Multi-column footer with links\n";
  if (detailLevel === "detailed" || detailLevel === "forensic") {
    out += "\n### CSS Suggestions\n";
    if (hasSidebar) {
      const sidebar = sorted.find((c) => c.type === "sidebar");
      out += `- \`display: grid; grid-template-columns: ${Math.round(sidebar.width)}px 1fr;\`
`;
    }
    if (cards.length > 1) {
      const cardW = Math.round(cards[0].width);
      out += `- \`display: grid; grid-template-columns: repeat(${cards.length}, ${cardW}px); gap: 16px;\`
`;
    }
    if (hasNav) {
      out += `- Navigation: \`position: sticky; top: 0; z-index: 50;\`
`;
    }
  }
  return out;
}
function generateRearrangeOutput(environment, state, detailLevel = "standard", viewport) {
  const { sections } = state;
  const changed = [];
  for (const s of sections) {
    const o = s.originalRect;
    const c = s.currentRect;
    const posMoved = Math.abs(o.x - c.x) > 1 || Math.abs(o.y - c.y) > 1;
    const sizeChanged = Math.abs(o.width - c.width) > 1 || Math.abs(o.height - c.height) > 1;
    if (!posMoved && !sizeChanged) {
      if (detailLevel === "forensic") {
        changed.push({ section: s, posMoved: false, sizeChanged: false });
      }
      continue;
    }
    changed.push({ section: s, posMoved, sizeChanged });
  }
  if (changed.length === 0) return "";
  if (detailLevel !== "forensic" && changed.every((e) => !e.posMoved && !e.sizeChanged)) return "";
  let out = "## Suggested Layout Changes\n\n";
  const vw = viewport ? viewport.width : environment.innerWidth;
  const vh = viewport ? viewport.height : environment.innerHeight;
  const layout = getPageLayout(environment, { width: vw, height: vh });
  if (detailLevel !== "compact") {
    out += formatReferenceFrame(layout);
  }
  if (detailLevel === "forensic") {
    out += `> Detected at: \`${new Date(state.detectedAt).toISOString()}\`
`;
    out += `> Total sections: ${sections.length}

`;
  }
  const siblingCandidates = (rects) => sections.map((s) => ({
    label: s.label,
    selector: s.selector,
    rect: rects === "original" ? s.originalRect : s.currentRect
  }));
  out += "**Changes:**\n";
  for (const { section: s, posMoved, sizeChanged } of changed) {
    const o = s.originalRect;
    const c = s.currentRect;
    if (!posMoved && !sizeChanged) {
      out += `- ${s.label} \u2014 unchanged at (${Math.round(c.x)}, ${Math.round(c.y)}) ${Math.round(c.width)}\xD7${Math.round(c.height)}px
`;
      continue;
    }
    if (detailLevel === "compact") {
      if (posMoved && sizeChanged) {
        out += `- Suggested: move **${s.label}** to (${Math.round(c.x)}, ${Math.round(c.y)}) ${Math.round(c.width)}\xD7${Math.round(c.height)}px
`;
      } else if (posMoved) {
        out += `- Suggested: move **${s.label}** to (${Math.round(c.x)}, ${Math.round(c.y)})
`;
      } else {
        out += `- Suggested: resize **${s.label}** to ${Math.round(c.width)}\xD7${Math.round(c.height)}px
`;
      }
      continue;
    }
    if (posMoved && sizeChanged) {
      out += `- Suggested: move and resize **${s.label}**
`;
    } else if (posMoved) {
      out += `- Suggested: move **${s.label}**
`;
    } else {
      out += `- Suggested: resize **${s.label}** from ${Math.round(o.width)}\xD7${Math.round(o.height)}px to ${Math.round(c.width)}\xD7${Math.round(c.height)}px
`;
    }
    if (posMoved) {
      const origCtx = getSpatialContext(environment, o, siblingCandidates("original"));
      const currCtx = getSpatialContext(environment, c, siblingCandidates("current"));
      const wasSize = sizeChanged ? { width: o.width, height: o.height } : void 0;
      out += `  - Currently ${formatPositionSummary(origCtx, { x: o.x, y: o.y }, wasSize)}
`;
      const nowSize = sizeChanged ? { width: c.width, height: c.height } : void 0;
      const coordStr = `at (${Math.round(c.x)}, ${Math.round(c.y)})`;
      const sizeStr = nowSize ? `, ${Math.round(nowSize.width)}\xD7${Math.round(nowSize.height)}px` : "";
      const includeLeftRight = detailLevel === "detailed" || detailLevel === "forensic";
      const nowLines = formatSpatialLines(currCtx, { includeLeftRight });
      if (nowLines.length > 0) {
        out += `  - Suggested position ${coordStr}${sizeStr}: ${nowLines[0]}
`;
        for (let i = 1; i < nowLines.length; i++) {
          out += `    ${nowLines[i]}
`;
        }
      } else {
        out += `  - Suggested position ${coordStr}${sizeStr}
`;
      }
      const cssPos = formatCSSPosition(c, layout);
      if (cssPos) {
        out += `  - CSS: ${cssPos}
`;
      }
    }
    const parentCtx = formatParentContext(environment, s.selector);
    if (parentCtx) {
      out += `  - ${parentCtx}
`;
    }
    out += `  - Selector: \`${s.selector}\`
`;
    if (detailLevel === "detailed" || detailLevel === "forensic") {
      const ident = s.className ? `${s.tagName}.${s.className.split(" ")[0]}` : s.tagName;
      if (ident !== s.selector) {
        out += `  - Element: \`${ident}\`
`;
      }
      if (s.role) out += `  - Role: \`${s.role}\`
`;
      if (detailLevel === "forensic" && s.textSnippet) {
        out += `  - Text: "${s.textSnippet}"
`;
      }
    }
    if (detailLevel === "forensic") {
      out += `  - Original rect: \`{ x: ${Math.round(o.x)}, y: ${Math.round(o.y)}, w: ${Math.round(o.width)}, h: ${Math.round(o.height)} }\`
`;
      out += `  - Current rect: \`{ x: ${Math.round(c.x)}, y: ${Math.round(c.y)}, w: ${Math.round(c.width)}, h: ${Math.round(c.height)} }\`
`;
    }
  }
  if (detailLevel !== "compact") {
    const movedSections = changed.filter((e) => e.posMoved).map((e) => ({
      label: e.section.label,
      originalRect: e.section.originalRect,
      currentRect: e.section.currentRect
    }));
    const patterns = analyzeLayoutPatterns(movedSections);
    if (patterns.length > 0) {
      out += "\n### Layout Summary\n";
      for (const line of patterns) {
        out += `- ${line}
`;
      }
    }
  }
  if (detailLevel !== "compact" && sections.length > 1) {
    out += "\n### All Sections (current positions)\n";
    const sortedSections = [...sections].sort((a, b) => {
      if (Math.abs(a.currentRect.y - b.currentRect.y) < 20) return a.currentRect.x - b.currentRect.x;
      return a.currentRect.y - b.currentRect.y;
    });
    for (const s of sortedSections) {
      const r = s.currentRect;
      const moved = Math.abs(r.x - s.originalRect.x) > 1 || Math.abs(r.y - s.originalRect.y) > 1 || Math.abs(r.width - s.originalRect.width) > 1 || Math.abs(r.height - s.originalRect.height) > 1;
      out += `- ${s.label}: \`${Math.round(r.width)}\xD7${Math.round(r.height)}px\` at \`(${Math.round(r.x)}, ${Math.round(r.y)})\`${moved ? " \u2190 suggested" : ""}
`;
    }
  }
  return out;
}

// src/utils/storage.ts
var STORAGE_PREFIX = "feedback-annotations-";
var DEFAULT_RETENTION_DAYS = 7;
var DESIGN_PREFIX = "agentation-design-";
var REARRANGE_PREFIX = "agentation-rearrange-";
var WIREFRAME_PREFIX = "agentation-wireframe-";
var SESSION_PREFIX = "agentation-session-";
var TOOLBAR_HIDDEN_SESSION_KEY = `${SESSION_PREFIX}toolbar-hidden`;

// src/browser/view/model.ts
var ACCENT_OPTIONS = [
  { id: "indigo", label: "Indigo", srgb: "#6155F5", p3: "color(display-p3 0.38 0.33 0.96)" },
  { id: "blue", label: "Blue", srgb: "#0088FF", p3: "color(display-p3 0.00 0.53 1.00)" },
  { id: "cyan", label: "Cyan", srgb: "#00C3D0", p3: "color(display-p3 0.00 0.76 0.82)" },
  { id: "green", label: "Green", srgb: "#34C759", p3: "color(display-p3 0.20 0.78 0.35)" },
  { id: "yellow", label: "Yellow", srgb: "#FFCC00", p3: "color(display-p3 1.00 0.80 0.00)" },
  { id: "orange", label: "Orange", srgb: "#FF8D28", p3: "color(display-p3 1.00 0.55 0.16)" },
  { id: "red", label: "Red", srgb: "#FF383C", p3: "color(display-p3 1.00 0.22 0.24)" }
];
var DEFAULT_SETTINGS = {
  outputDetail: "standard",
  autoClearAfterCopy: false,
  annotationColorId: "blue",
  blockInteractions: true,
  metadataEnabled: true,
  markerClickBehavior: "edit",
  webhookUrl: "",
  webhooksEnabled: true
};

// src/browser/storage.ts
var SETTINGS_KEY = "feedback-toolbar-settings";
var THEME_KEY = "feedback-toolbar-theme";
var TOOLBAR_POSITION_KEY = "feedback-toolbar-position";
var STORAGE_UNAVAILABLE = new Error("Storage is unavailable in this realm");
var OUTPUT_DETAIL_LEVELS = {
  compact: true,
  standard: true,
  detailed: true,
  forensic: true
};
var MARKER_CLICK_BEHAVIORS = { edit: true, delete: true };
function malformed(key, value) {
  return new TypeError(
    `Agentation ignored a malformed value for "${key}" (${Array.isArray(value) ? "array" : value === null ? "null" : typeof value})`
  );
}
function createRuntimeStorage(environment, onFailure) {
  const memory = /* @__PURE__ */ new Map();
  const fail = (key, operation, cause = STORAGE_UNAVAILABLE) => {
    onFailure({ key, operation, cause });
  };
  const readText = (storage, key) => {
    const pending = memory.get(key);
    if (pending !== void 0) return pending;
    if (!storage) {
      fail(key, "read");
      return null;
    }
    try {
      return storage.getItem(key);
    } catch (cause) {
      fail(key, "read", cause);
      return null;
    }
  };
  const writeText = (storage, key, value) => {
    if (storage) {
      try {
        storage.setItem(key, value);
        memory.delete(key);
        return;
      } catch (cause) {
        memory.set(key, value);
        fail(key, "write", cause);
        return;
      }
    }
    memory.set(key, value);
    fail(key, "write");
  };
  const removeText = (storage, key) => {
    if (storage) {
      try {
        storage.removeItem(key);
        memory.delete(key);
        return;
      } catch (cause) {
        memory.set(key, null);
        fail(key, "remove", cause);
        return;
      }
    }
    memory.set(key, null);
    fail(key, "remove");
  };
  const readJson = (storage, key) => {
    const text = readText(storage, key);
    if (text === null || text === "") return void 0;
    try {
      return JSON.parse(text);
    } catch (cause) {
      fail(key, "read", cause);
      return void 0;
    }
  };
  const writeJson = (storage, key, value) => {
    let text;
    try {
      text = JSON.stringify(value);
    } catch (cause) {
      fail(key, "write", cause);
      return;
    }
    writeText(storage, key, text);
  };
  const retentionCutoff = () => environment.now() - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1e3;
  const retained = (key, parsed, cutoff) => {
    if (parsed === void 0) return [];
    if (!Array.isArray(parsed)) {
      fail(key, "read", malformed(key, parsed));
      return [];
    }
    const kept = [];
    for (const entry of parsed) {
      if (!entry) continue;
      if (!entry.timestamp || entry.timestamp > cutoff) kept.push(entry);
    }
    return kept;
  };
  const loadStored = (pathname) => {
    const key = `${STORAGE_PREFIX}${pathname}`;
    return retained(key, readJson(environment.localStorage, key), retentionCutoff());
  };
  const normalizeSettings = (parsed) => {
    if (parsed === void 0 || parsed === null) return { ...DEFAULT_SETTINGS };
    if (typeof parsed !== "object") {
      fail(SETTINGS_KEY, "read", malformed(SETTINGS_KEY, parsed));
      return { ...DEFAULT_SETTINGS };
    }
    const stored = parsed;
    const { annotationColorId, markerClickBehavior, metadataEnabled, outputDetail } = stored;
    const legacyMetadata = stored.reactEnabled;
    return {
      outputDetail: typeof outputDetail === "string" && OUTPUT_DETAIL_LEVELS[outputDetail] ? outputDetail : DEFAULT_SETTINGS.outputDetail,
      autoClearAfterCopy: typeof stored.autoClearAfterCopy === "boolean" ? stored.autoClearAfterCopy : DEFAULT_SETTINGS.autoClearAfterCopy,
      annotationColorId: typeof annotationColorId === "string" && ACCENT_OPTIONS.some((accent) => accent.id === annotationColorId) ? annotationColorId : DEFAULT_SETTINGS.annotationColorId,
      blockInteractions: typeof stored.blockInteractions === "boolean" ? stored.blockInteractions : DEFAULT_SETTINGS.blockInteractions,
      metadataEnabled: typeof metadataEnabled === "boolean" ? metadataEnabled : typeof legacyMetadata === "boolean" ? legacyMetadata : DEFAULT_SETTINGS.metadataEnabled,
      markerClickBehavior: typeof markerClickBehavior === "string" && MARKER_CLICK_BEHAVIORS[markerClickBehavior] ? markerClickBehavior : DEFAULT_SETTINGS.markerClickBehavior,
      webhookUrl: typeof stored.webhookUrl === "string" ? stored.webhookUrl : DEFAULT_SETTINGS.webhookUrl,
      webhooksEnabled: typeof stored.webhooksEnabled === "boolean" ? stored.webhooksEnabled : DEFAULT_SETTINGS.webhooksEnabled
    };
  };
  return {
    // --- Annotations --------------------------------------------------------
    loadAnnotations(pathname) {
      return loadStored(pathname);
    },
    saveAnnotations(pathname, annotations, sessionId) {
      const payload = sessionId ? annotations.map((annotation) => ({ ...annotation, _syncedTo: sessionId })) : annotations;
      writeJson(environment.localStorage, `${STORAGE_PREFIX}${pathname}`, payload);
    },
    clearAnnotations(pathname) {
      removeText(environment.localStorage, `${STORAGE_PREFIX}${pathname}`);
    },
    loadAllAnnotations() {
      const result = /* @__PURE__ */ new Map();
      const cutoff = retentionCutoff();
      const local = environment.localStorage;
      const overridden = /* @__PURE__ */ new Set();
      for (const [key, text] of memory) {
        if (!key.startsWith(STORAGE_PREFIX)) continue;
        const pathname = key.slice(STORAGE_PREFIX.length);
        overridden.add(pathname);
        if (text === null) continue;
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (cause) {
          fail(key, "read", cause);
          continue;
        }
        const kept = retained(key, parsed, cutoff);
        if (kept.length > 0) result.set(pathname, kept);
      }
      if (!local) {
        if (overridden.size === 0) fail(STORAGE_PREFIX, "read");
        return result;
      }
      try {
        for (let index = 0; index < local.length; index++) {
          const key = local.key(index);
          if (!key?.startsWith(STORAGE_PREFIX)) continue;
          const pathname = key.slice(STORAGE_PREFIX.length);
          if (overridden.has(pathname)) continue;
          const text = local.getItem(key);
          if (!text) continue;
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch (cause) {
            fail(key, "read", cause);
            continue;
          }
          const kept = retained(key, parsed, cutoff);
          if (kept.length > 0) result.set(pathname, kept);
        }
      } catch (cause) {
        fail(STORAGE_PREFIX, "read", cause);
      }
      return result;
    },
    getUnsyncedAnnotations(pathname, sessionId) {
      return loadStored(pathname).filter((annotation) => {
        if (!annotation._syncedTo) return true;
        if (sessionId && annotation._syncedTo !== sessionId) return true;
        return false;
      });
    },
    // --- Layout mode --------------------------------------------------------
    loadPlacements(pathname) {
      const key = `${DESIGN_PREFIX}${pathname}`;
      const parsed = readJson(environment.localStorage, key);
      if (parsed === void 0) return [];
      if (!Array.isArray(parsed)) {
        fail(key, "read", malformed(key, parsed));
        return [];
      }
      return parsed;
    },
    savePlacements(pathname, placements) {
      writeJson(environment.localStorage, `${DESIGN_PREFIX}${pathname}`, placements);
    },
    clearPlacements(pathname) {
      removeText(environment.localStorage, `${DESIGN_PREFIX}${pathname}`);
    },
    loadRearrange(pathname) {
      const key = `${REARRANGE_PREFIX}${pathname}`;
      const parsed = readJson(environment.localStorage, key);
      if (parsed === void 0 || parsed === null) return null;
      const state = parsed;
      if (!Array.isArray(state.sections)) {
        fail(key, "read", malformed(key, parsed));
        return null;
      }
      return state;
    },
    saveRearrange(pathname, state) {
      writeJson(environment.localStorage, `${REARRANGE_PREFIX}${pathname}`, state);
    },
    clearRearrange(pathname) {
      removeText(environment.localStorage, `${REARRANGE_PREFIX}${pathname}`);
    },
    loadWireframe(pathname) {
      const key = `${WIREFRAME_PREFIX}${pathname}`;
      const parsed = readJson(environment.localStorage, key);
      if (parsed === void 0 || parsed === null) return null;
      const stash = parsed;
      if (!Array.isArray(stash.placements) || typeof stash.purpose !== "string") {
        fail(key, "read", malformed(key, parsed));
        return null;
      }
      return {
        rearrange: Array.isArray(stash.rearrange?.sections) ? stash.rearrange : null,
        placements: stash.placements,
        purpose: stash.purpose
      };
    },
    saveWireframe(pathname, state) {
      writeJson(environment.localStorage, `${WIREFRAME_PREFIX}${pathname}`, state);
    },
    clearWireframe(pathname) {
      removeText(environment.localStorage, `${WIREFRAME_PREFIX}${pathname}`);
    },
    // --- Sessions -----------------------------------------------------------
    loadSessionId(pathname) {
      const stored = readText(environment.localStorage, `${SESSION_PREFIX}${pathname}`);
      return stored ? stored : null;
    },
    saveSessionId(pathname, sessionId) {
      writeText(environment.localStorage, `${SESSION_PREFIX}${pathname}`, sessionId);
    },
    clearSessionId(pathname) {
      removeText(environment.localStorage, `${SESSION_PREFIX}${pathname}`);
    },
    // --- Shell --------------------------------------------------------------
    loadToolbarHidden() {
      return readText(environment.sessionStorage, TOOLBAR_HIDDEN_SESSION_KEY) === "1";
    },
    saveToolbarHidden(hidden) {
      if (hidden) writeText(environment.sessionStorage, TOOLBAR_HIDDEN_SESSION_KEY, "1");
      else removeText(environment.sessionStorage, TOOLBAR_HIDDEN_SESSION_KEY);
    },
    loadSettings() {
      const settings = normalizeSettings(readJson(environment.localStorage, SETTINGS_KEY));
      writeJson(environment.localStorage, SETTINGS_KEY, settings);
      return settings;
    },
    saveSettings(settings) {
      writeJson(environment.localStorage, SETTINGS_KEY, settings);
    },
    loadTheme() {
      const stored = readText(environment.localStorage, THEME_KEY);
      if (stored === "dark" || stored === "light") return stored;
      if (stored !== null && stored !== "") {
        fail(THEME_KEY, "read", malformed(THEME_KEY, stored));
      }
      return "dark";
    },
    saveTheme(theme) {
      writeText(environment.localStorage, THEME_KEY, theme);
    },
    loadToolbarPosition() {
      const parsed = readJson(environment.localStorage, TOOLBAR_POSITION_KEY);
      if (parsed === void 0 || parsed === null) return null;
      const position = parsed;
      if (typeof position.x !== "number" || typeof position.y !== "number") {
        fail(TOOLBAR_POSITION_KEY, "read", malformed(TOOLBAR_POSITION_KEY, parsed));
        return null;
      }
      return { x: position.x, y: position.y };
    },
    saveToolbarPosition(position) {
      writeJson(environment.localStorage, TOOLBAR_POSITION_KEY, position);
    },
    clearToolbarPosition() {
      removeText(environment.localStorage, TOOLBAR_POSITION_KEY);
    }
  };
}

// src/utils/sync.ts
async function createSession(endpoint, url, signal) {
  const response = await fetch(`${endpoint}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal
  });
  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.status}`);
  }
  return response.json();
}
async function getSession(endpoint, sessionId, signal) {
  const response = await fetch(`${endpoint}/sessions/${sessionId}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to get session: ${response.status}`);
  }
  return response.json();
}
async function syncAnnotation(endpoint, sessionId, annotation, signal) {
  const response = await fetch(`${endpoint}/sessions/${sessionId}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(annotation),
    signal
  });
  if (!response.ok) {
    throw new Error(`Failed to sync annotation: ${response.status}`);
  }
  return response.json();
}
async function updateAnnotation(endpoint, annotationId, data, signal) {
  const response = await fetch(`${endpoint}/annotations/${annotationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal
  });
  if (!response.ok) {
    throw new Error(`Failed to update annotation: ${response.status}`);
  }
  return response.json();
}
async function deleteAnnotation(endpoint, annotationId, signal) {
  const response = await fetch(`${endpoint}/annotations/${annotationId}`, {
    method: "DELETE",
    signal
  });
  if (!response.ok) {
    throw new Error(`Failed to delete annotation: ${response.status}`);
  }
}
async function requestAction(endpoint, sessionId, output, signal) {
  const response = await fetch(`${endpoint}/sessions/${sessionId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ output }),
    signal
  });
  if (!response.ok) {
    throw new Error(`Failed to request action: ${response.status}`);
  }
  return response.json();
}

// src/browser/sync.ts
var HEALTH_INTERVAL_MS = 1e4;
var REMOVED_STATUSES = ["resolved", "dismissed"];
function isRenderable(annotation) {
  return annotation.status !== "resolved" && annotation.status !== "dismissed";
}
function removalKind(value) {
  return value === "placement" || value === "rearrange" ? value : "feedback";
}
var RuntimeSyncImpl = class {
  constructor(dependencies) {
    this.generation = 0;
    this.destroyed = false;
    this.pathname = "";
    this.currentSessionId = null;
    this.state = "disconnected";
    /**
     * Set when an explicitly requested session could not be joined. Creating a
     * different session would strand the consumer's annotations somewhere nobody
     * asked for, so the runtime stays local-only until the next `configure`.
     */
    this.localOnly = false;
    this.eventsSessionId = null;
    this.handleRemoteUpdate = (event) => {
      if (this.destroyed) return;
      let payload;
      try {
        payload = JSON.parse(event.data)?.payload;
      } catch {
        return;
      }
      if (!payload || typeof payload.id !== "string") return;
      if (!REMOVED_STATUSES.includes(payload.status)) return;
      this.dependencies.onRemoteRemoved(payload.id, removalKind(payload.kind));
    };
    this.dependencies = dependencies;
    this.environment = dependencies.environment;
    this.storage = dependencies.storage;
  }
  get sessionId() {
    return this.currentSessionId;
  }
  get status() {
    return this.state;
  }
  // --- Lifecycle ------------------------------------------------------------
  async configure(config, pathname, snapshot) {
    const generation = this.begin();
    if (this.destroyed) return;
    this.pathname = pathname;
    this.endpoint = config.endpoint;
    this.localOnly = false;
    if (!this.endpoint) {
      this.currentSessionId = null;
      this.setStatus("disconnected");
      return;
    }
    this.setStatus("connecting");
    await this.resolveSession(config.sessionId, snapshot, generation);
    if (this.stale(generation)) return;
    if (this.localOnly) return;
    this.openEvents();
    this.startHealth(generation);
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.controller?.abort();
    this.controller = void 0;
    this.stopHealth();
    this.closeEvents();
    this.state = "disconnected";
  }
  // --- Mutations ------------------------------------------------------------
  async add(annotation) {
    const endpoint = this.endpoint;
    const sessionId = this.currentSessionId;
    if (!endpoint || !sessionId) return;
    const generation = this.generation;
    try {
      const synced = await syncAnnotation(
        endpoint,
        sessionId,
        { ...annotation, sessionId, url: this.pageUrl(this.pathname) },
        this.signal()
      );
      if (this.stale(generation)) return;
      if (synced.id !== annotation.id) {
        this.dependencies.onRemoteRemoved(annotation.id, removalKind(annotation.kind));
        this.dependencies.onRemoteAnnotations([synced]);
      }
    } catch (cause) {
      if (this.stale(generation)) return;
      this.dependencies.onError("Failed to sync annotation; it remains stored locally", cause);
    }
  }
  async update(annotation) {
    const endpoint = this.endpoint;
    if (!endpoint || !this.currentSessionId) return;
    const generation = this.generation;
    try {
      await updateAnnotation(
        endpoint,
        annotation.id,
        { comment: annotation.comment },
        this.signal()
      );
    } catch (cause) {
      if (this.stale(generation)) return;
      this.dependencies.onError("Failed to update annotation on server", cause);
    }
  }
  async delete(annotationId) {
    const endpoint = this.endpoint;
    if (!endpoint || !this.currentSessionId) return;
    const generation = this.generation;
    try {
      await deleteAnnotation(endpoint, annotationId, this.signal());
    } catch (cause) {
      if (this.stale(generation)) return;
      this.dependencies.onError("Failed to delete annotation from server", cause);
    }
  }
  async clear(annotationIds) {
    const endpoint = this.endpoint;
    if (!endpoint || !this.currentSessionId) return;
    if (annotationIds.length === 0) return;
    const generation = this.generation;
    const signal = this.signal();
    const results = await Promise.allSettled(
      annotationIds.map((id) => deleteAnnotation(endpoint, id, signal))
    );
    if (this.stale(generation)) return;
    for (const result of results) {
      if (result.status === "rejected") {
        this.dependencies.onError("Failed to delete annotation from server", result.reason);
      }
    }
  }
  async action(output) {
    const endpoint = this.endpoint;
    const sessionId = this.currentSessionId;
    if (!endpoint || !sessionId) return false;
    const generation = this.generation;
    try {
      await requestAction(endpoint, sessionId, output, this.signal());
      return !this.stale(generation);
    } catch (cause) {
      if (!this.stale(generation)) {
        this.dependencies.onError("Failed to send annotations to the agent", cause);
      }
      return false;
    }
  }
  // --- Session resolution ---------------------------------------------------
  async resolveSession(explicitSessionId, snapshot, generation) {
    const endpoint = this.endpoint;
    if (!endpoint) return;
    const storedSessionId = explicitSessionId ? null : this.storage.loadSessionId(this.pathname);
    const sessionIdToJoin = explicitSessionId ?? storedSessionId;
    if (sessionIdToJoin) {
      try {
        const session = await getSession(endpoint, sessionIdToJoin, this.signal());
        if (this.stale(generation)) return;
        this.adoptSession(session.id);
        await this.mergeJoinedSession(session.annotations, snapshot, session.id, generation);
        return;
      } catch (cause) {
        if (this.stale(generation)) return;
        if (explicitSessionId) {
          this.currentSessionId = null;
          this.localOnly = true;
          this.setStatus("disconnected");
          this.dependencies.onError(
            "Could not join the requested Agentation session; continuing locally",
            cause
          );
          return;
        }
        this.storage.clearSessionId(this.pathname);
      }
    }
    try {
      const session = await createSession(endpoint, this.environment.href, this.signal());
      if (this.stale(generation)) return;
      this.adoptSession(session.id);
      this.dependencies.onSessionCreated(session.id);
      await this.uploadUnsyncedPages(session.id, generation);
    } catch (cause) {
      if (this.stale(generation)) return;
      this.currentSessionId = null;
      this.setStatus("disconnected");
      this.dependencies.onError("Could not initialize Agentation sync; continuing locally", cause);
    }
  }
  /** Server records win for the same id; local-only records are uploaded. */
  async mergeJoinedSession(remote, snapshot, sessionId, generation) {
    const endpoint = this.endpoint;
    if (!endpoint) return;
    const remoteIds = new Set(remote.map((annotation) => annotation.id));
    const missing = snapshot.filter((annotation) => !remoteIds.has(annotation.id));
    const uploaded = await this.uploadAnnotations(
      endpoint,
      sessionId,
      missing,
      this.pageUrl(this.pathname)
    );
    if (this.stale(generation)) return;
    const merged = [...remote, ...uploaded].filter(isRenderable);
    this.storage.saveAnnotations(this.pathname, merged, sessionId);
    this.dependencies.onRemoteAnnotations(merged);
  }
  /**
   * A freshly created session has no history, so annotations captured while
   * offline — on this page and on every other visited page — belong to it.
   */
  async uploadUnsyncedPages(sessionId, generation) {
    const endpoint = this.endpoint;
    if (!endpoint) return;
    const pending = [];
    for (const pagePath of this.storage.loadAllAnnotations().keys()) {
      const unsynced = this.storage.getUnsyncedAnnotations(pagePath);
      if (unsynced.length === 0) continue;
      const pageUrl = this.pageUrl(pagePath);
      const isCurrentPage = pagePath === this.pathname;
      pending.push(
        (async () => {
          try {
            const targetSessionId = isCurrentPage ? sessionId : (await createSession(endpoint, pageUrl, this.signal())).id;
            if (this.stale(generation)) return;
            const synced = await this.uploadAnnotations(
              endpoint,
              targetSessionId,
              unsynced,
              pageUrl
            );
            if (this.stale(generation)) return;
            const renderable = synced.filter(isRenderable);
            this.storage.saveAnnotations(pagePath, renderable, targetSessionId);
            if (isCurrentPage) this.dependencies.onRemoteAnnotations(renderable);
          } catch (cause) {
            if (this.stale(generation)) return;
            this.dependencies.onError(`Failed to sync annotations for ${pagePath}`, cause);
          }
        })()
      );
    }
    await Promise.allSettled(pending);
  }
  /**
   * Uploads every annotation, substituting the local record for any individual
   * failure so one rejected request never drops local state.
   */
  async uploadAnnotations(endpoint, sessionId, annotations, pageUrl) {
    if (annotations.length === 0) return [];
    const signal = this.signal();
    const results = await Promise.allSettled(
      annotations.map(
        (annotation) => syncAnnotation(endpoint, sessionId, { ...annotation, sessionId, url: pageUrl }, signal)
      )
    );
    return results.map(
      (result, index) => result.status === "fulfilled" ? result.value : annotations[index]
    );
  }
  adoptSession(sessionId) {
    this.currentSessionId = sessionId;
    this.storage.saveSessionId(this.pathname, sessionId);
    this.setStatus("connected");
  }
  // --- Health ---------------------------------------------------------------
  startHealth(generation) {
    this.stopHealth();
    void this.checkHealth(generation);
    this.healthHandle = this.dependencies.scheduler.setInterval(() => {
      if (this.stale(generation)) {
        this.stopHealth();
        return;
      }
      void this.checkHealth(generation);
    }, HEALTH_INTERVAL_MS);
  }
  stopHealth() {
    if (this.healthHandle === void 0) return;
    this.dependencies.scheduler.clearInterval(this.healthHandle);
    this.healthHandle = void 0;
  }
  async checkHealth(generation) {
    const endpoint = this.endpoint;
    if (!endpoint || this.stale(generation)) return;
    let reachable = false;
    try {
      const response = await this.environment.fetch(`${endpoint}/health`, {
        signal: this.signal()
      });
      reachable = response.ok;
    } catch {
      reachable = false;
    }
    if (this.stale(generation)) return;
    const wasDisconnected = this.state === "disconnected";
    this.setStatus(reachable ? "connected" : "disconnected");
    if (reachable && wasDisconnected) void this.recover(generation);
  }
  /**
   * Disconnected -> connected: the session may have expired while we were away,
   * and anything captured offline is still local-only.
   */
  async recover(generation) {
    const endpoint = this.endpoint;
    if (!endpoint || this.localOnly) return;
    try {
      let sessionId = this.currentSessionId;
      let remote = [];
      if (sessionId) {
        try {
          const session = await getSession(endpoint, sessionId, this.signal());
          if (this.stale(generation)) return;
          remote = session.annotations;
        } catch {
          if (this.stale(generation)) return;
          sessionId = null;
        }
      }
      if (!sessionId) {
        const created = await createSession(endpoint, this.pageUrl(this.pathname), this.signal());
        if (this.stale(generation)) return;
        sessionId = created.id;
        this.adoptSession(sessionId);
        this.dependencies.onSessionCreated(sessionId);
        this.openEvents();
      }
      const local = this.dependencies.localAnnotations();
      const remoteIds = new Set(remote.map((annotation) => annotation.id));
      const missing = local.filter((annotation) => !remoteIds.has(annotation.id));
      if (missing.length === 0) return;
      const uploaded = await this.uploadAnnotations(
        endpoint,
        sessionId,
        missing,
        this.pageUrl(this.pathname)
      );
      if (this.stale(generation)) return;
      const merged = [...remote, ...uploaded].filter(isRenderable);
      this.storage.saveAnnotations(this.pathname, merged, sessionId);
      this.dependencies.onRemoteAnnotations(merged);
    } catch (cause) {
      if (this.stale(generation)) return;
      this.dependencies.onError("Failed to sync annotations on reconnect", cause);
    }
  }
  // --- Server-sent events ---------------------------------------------------
  openEvents() {
    const Source = this.environment.EventSource;
    const endpoint = this.endpoint;
    const sessionId = this.currentSessionId;
    if (!Source || !endpoint || !sessionId || this.destroyed) return;
    if (this.events && this.eventsSessionId === sessionId) return;
    this.closeEvents();
    const source = new Source(`${endpoint}/sessions/${sessionId}/events`);
    source.addEventListener("annotation.updated", this.handleRemoteUpdate);
    this.events = source;
    this.eventsSessionId = sessionId;
  }
  closeEvents() {
    if (!this.events) return;
    this.events.removeEventListener("annotation.updated", this.handleRemoteUpdate);
    this.events.close();
    this.events = void 0;
    this.eventsSessionId = null;
  }
  // --- Internals ------------------------------------------------------------
  /** Invalidates in-flight work and returns the generation that now owns it. */
  begin() {
    this.controller?.abort();
    this.generation += 1;
    this.stopHealth();
    this.closeEvents();
    this.controller = this.destroyed ? void 0 : new this.environment.AbortController();
    return this.generation;
  }
  signal() {
    return this.controller?.signal;
  }
  stale(generation) {
    return this.destroyed || generation !== this.generation;
  }
  setStatus(status) {
    if (this.state === status) return;
    this.state = status;
    this.dependencies.onConnectionChange(status);
  }
  pageUrl(pathname) {
    return `${this.environment.window.location.origin}${pathname}`;
  }
};
function createRuntimeSync(dependencies) {
  return new RuntimeSyncImpl(dependencies);
}

// src/browser/targeting.ts
var AGENTATION_UI_SELECTOR = "[data-agentation-ui]";
var MAX_SELECTED_TEXT = 500;
var MAX_LISTED_NAMES = 5;
var MIN_AREA_SIZE = 20;
function isAgentationNode(element, context) {
  const { host } = context;
  if (element === host || host.contains(element)) return true;
  return closestCrossingShadow(element, AGENTATION_UI_SELECTOR) !== null;
}
function pageElementFromPoint(x, y, context) {
  const root = context.environment.document;
  const top = root.elementFromPoint(x, y);
  if (top && !isAgentationNode(top, context)) return top;
  if (!top) return null;
  for (const candidate of root.elementsFromPoint(x, y)) {
    if (!isAgentationNode(candidate, context)) return candidate;
  }
  return null;
}
function deepElementFromPoint(x, y, context) {
  let element = pageElementFromPoint(x, y, context);
  if (!element) return null;
  while (element.shadowRoot) {
    const deeper = element.shadowRoot.elementFromPoint(x, y);
    if (!deeper || deeper === element) break;
    if (isAgentationNode(deeper, context)) break;
    element = deeper;
  }
  return element;
}
function isElementFixed(element, context) {
  const { environment } = context;
  const body = environment.document.body;
  let current = element;
  while (current && current !== body) {
    const position = environment.computedStyle(current).position;
    if (position === "fixed" || position === "sticky") return true;
    current = current.parentElement;
  }
  return false;
}
function toAnnotationBox(rect, environment, fixed) {
  return {
    x: rect.left,
    y: fixed ? rect.top : rect.top + environment.scrollY,
    width: rect.width,
    height: rect.height
  };
}
function inspectMetadata(element, context) {
  if (!context.metadataEnabled) return void 0;
  if (context.adapters.length === 0) return void 0;
  const metadataContext = { outputDetail: context.outputDetail };
  for (const adapter of context.adapters) {
    try {
      const result = adapter.inspect(element, metadataContext);
      if (!result) continue;
      return {
        name: result.framework || adapter.id,
        // Copied out so a consumer holding the annotation cannot reach into
        // adapter-owned arrays or objects.
        componentPath: result.componentPath ? [...result.componentPath] : void 0,
        source: result.source ? { ...result.source } : void 0,
        confidence: result.confidence
      };
    } catch (cause) {
      context.onMetadataError(adapter.id, cause);
    }
  }
  return void 0;
}
function sourceString(framework) {
  const source = framework?.source;
  if (!source) return void 0;
  return [source.file, source.line, source.column].filter((part) => part !== void 0).join(":");
}
function describeElement(element, context) {
  const framework = inspectMetadata(element, context);
  return {
    nearbyText: getNearbyText(element),
    cssClasses: getElementClasses(element),
    nearbyElements: getNearbyElements(element),
    // Two shapes on purpose: the forensic string is what the Markdown output
    // prints, the detailed object is what the popup accordion renders.
    computedStyles: getForensicComputedStyles(element),
    computedStylesObject: getDetailedComputedStyles(element),
    fullPath: getFullElementPath(element),
    accessibility: getAccessibilityInfo(element),
    framework,
    reactComponents: framework?.name === "react" && framework.componentPath?.length ? framework.componentPath.join(" > ") : void 0,
    sourceFile: sourceString(framework)
  };
}
function displayName(elementName, componentPath) {
  if (!componentPath || componentPath.length === 0) return elementName;
  return `${componentPath.join(" ")} ${elementName}`;
}
function collectTarget(element, clientX, clientY, context) {
  const { environment } = context;
  const details = describeElement(element, context);
  const { name, path } = identifyElement(element);
  const fixed = isElementFixed(element, context);
  const selected = environment.getSelectionText().trim();
  return {
    x: clientX / environment.innerWidth * 100,
    y: fixed ? clientY : clientY + environment.scrollY,
    element: displayName(name, details.framework?.componentPath),
    elementPath: path,
    selectedText: selected.length > 0 ? selected.slice(0, MAX_SELECTED_TEXT) : void 0,
    boundingBox: toAnnotationBox(element.getBoundingClientRect(), environment, fixed),
    isFixed: fixed,
    ...details
  };
}
function collectGroup(elements, context) {
  const { environment } = context;
  if (elements.length === 1) {
    const only = elements[0];
    const rect = only.getBoundingClientRect();
    return collectTarget(only, rect.left, rect.top, context);
  }
  const rects = elements.map((element) => element.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const names = elements.slice(0, MAX_LISTED_NAMES).map((element) => identifyElement(element).name).join(", ");
  const suffix = elements.length > MAX_LISTED_NAMES ? ` +${elements.length - MAX_LISTED_NAMES} more` : "";
  const last = elements[elements.length - 1];
  const lastRect = rects[rects.length - 1];
  const lastCenterX = lastRect.left + lastRect.width / 2;
  const lastCenterY = lastRect.top + lastRect.height / 2;
  const lastIsFixed = isElementFixed(last, context);
  return {
    x: lastCenterX / environment.innerWidth * 100,
    y: lastIsFixed ? lastCenterY : lastCenterY + environment.scrollY,
    element: `${elements.length} elements: ${names}${suffix}`,
    elementPath: "multi-select",
    boundingBox: {
      x: left,
      y: top + environment.scrollY,
      width: right - left,
      height: bottom - top
    },
    // Individual boxes drive per-element highlighting; always document-space.
    elementBoundingBoxes: rects.map((rect) => ({
      x: rect.left,
      y: rect.top + environment.scrollY,
      width: rect.width,
      height: rect.height
    })),
    isMultiSelect: true,
    isFixed: lastIsFixed,
    ...describeElement(elements[0], context)
  };
}
function collectArea(rect, context) {
  if (!(rect.width > MIN_AREA_SIZE && rect.height > MIN_AREA_SIZE)) return void 0;
  const { environment } = context;
  return {
    x: rect.right / environment.innerWidth * 100,
    y: rect.bottom + environment.scrollY,
    element: "Area selection",
    elementPath: `region at (${Math.round(rect.left)}, ${Math.round(rect.top)})`,
    boundingBox: {
      x: rect.left,
      y: rect.top + environment.scrollY,
      width: rect.width,
      height: rect.height
    },
    isMultiSelect: true
  };
}

// src/browser/styles.shadow.scss
var styles_shadow_default = ':host{--agentation-color-indigo: #6155f5;--agentation-color-blue: #0088ff;--agentation-color-cyan: #00c3d0;--agentation-color-green: #34c759;--agentation-color-yellow: #ffcc00;--agentation-color-orange: #ff8d28;--agentation-color-red: #ff383c;--agentation-color-accent: var(--agentation-color-blue);--agentation-surface: rgba(28, 28, 30, 0.72);--agentation-surface-solid: #1c1c1e;--agentation-surface-raised: rgba(44, 44, 46, 0.9);--agentation-border: rgba(255, 255, 255, 0.12);--agentation-border-strong: rgba(255, 255, 255, 0.2);--agentation-text: rgba(255, 255, 255, 0.92);--agentation-text-muted: rgba(255, 255, 255, 0.55);--agentation-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3);--agentation-blur: saturate(180%) blur(20px);--agentation-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;--agentation-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace}@supports(color: color(display-p3 0 0 0)){:host{--agentation-color-indigo: color(display-p3 0.38 0.33 0.96);--agentation-color-blue: color(display-p3 0 0.53 1);--agentation-color-cyan: color(display-p3 0 0.76 0.82);--agentation-color-green: color(display-p3 0.2 0.78 0.35);--agentation-color-yellow: color(display-p3 1 0.8 0);--agentation-color-orange: color(display-p3 1 0.55 0.16);--agentation-color-red: color(display-p3 1 0.22 0.24)}}:host([data-agentation-accent=indigo]){--agentation-color-accent: var(--agentation-color-indigo)}:host([data-agentation-accent=blue]){--agentation-color-accent: var(--agentation-color-blue)}:host([data-agentation-accent=cyan]){--agentation-color-accent: var(--agentation-color-cyan)}:host([data-agentation-accent=green]){--agentation-color-accent: var(--agentation-color-green)}:host([data-agentation-accent=yellow]){--agentation-color-accent: var(--agentation-color-yellow)}:host([data-agentation-accent=orange]){--agentation-color-accent: var(--agentation-color-orange)}:host([data-agentation-accent=red]){--agentation-color-accent: var(--agentation-color-red)}:host([data-agentation-theme=light]){--agentation-surface: rgba(255, 255, 255, 0.78);--agentation-surface-solid: #ffffff;--agentation-surface-raised: rgba(245, 245, 247, 0.92);--agentation-border: rgba(0, 0, 0, 0.1);--agentation-border-strong: rgba(0, 0, 0, 0.18);--agentation-text: rgba(0, 0, 0, 0.88);--agentation-text-muted: rgba(0, 0, 0, 0.5);--agentation-shadow: 0 8px 32px rgba(0, 0, 0, 0.14), 0 1px 2px rgba(0, 0, 0, 0.08)}:host{all:initial;position:static;display:contents;font-family:var(--agentation-font);color:var(--agentation-text);-webkit-font-smoothing:antialiased}:host([hidden]){display:none}.ag-layer{position:fixed;inset:0;pointer-events:none;z-index:var(--agentation-z-index, 100000);font-family:var(--agentation-font)}.ag-layer *,.ag-layer *::before,.ag-layer *::after{box-sizing:border-box}.ag-layer button{font:inherit;color:inherit;background:none;border:0;margin:0;padding:0;cursor:pointer}.ag-visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}.ag-disable-transitions :is(*,*::before,*::after){transition:none !important}.ag-icon-state{transition:opacity .2s ease,transform .2s ease;transform-origin:center}.ag-icon-state-fast{transition:opacity .15s ease,transform .15s ease;transform-origin:center}.ag-icon-fade{transition:opacity .2s ease}.ag-icon-fade-fast{transition:opacity .15s ease}.ag-icon-visible{opacity:1 !important}.ag-icon-visible-scaled{opacity:1 !important;transform:scale(1)}.ag-icon-hidden{opacity:0 !important}.ag-icon-hidden-scaled{opacity:0 !important;transform:scale(0.8)}.ag-icon-sending{opacity:.5 !important;transform:scale(0.8)}@keyframes ag-toolbar-enter{from{opacity:0;transform:scale(0.5) rotate(90deg)}to{opacity:1;transform:scale(1) rotate(0deg)}}@keyframes ag-toolbar-hide{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(0.8)}}@keyframes ag-toolbar-badge-enter{from{opacity:0;transform:scale(0)}to{opacity:1;transform:scale(1)}}@keyframes ag-toolbar-mcp-pulse-connected{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--agentation-color-green) 50%, transparent)}50%{box-shadow:0 0 0 5px color-mix(in srgb, var(--agentation-color-green) 0%, transparent)}}@keyframes ag-toolbar-mcp-pulse-connecting{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--agentation-color-yellow) 50%, transparent)}50%{box-shadow:0 0 0 5px color-mix(in srgb, var(--agentation-color-yellow) 0%, transparent)}}.ag-toolbar{position:fixed;top:var(--agentation-toolbar-top, auto);right:var(--agentation-toolbar-right, 1.25rem);bottom:var(--agentation-toolbar-bottom, 1.25rem);left:var(--agentation-toolbar-left, auto);width:337px;z-index:var(--agentation-z-index, 100000);font-family:var(--agentation-font);pointer-events:none;transition:left 0s,top 0s,right 0s,bottom 0s}.ag-toolbar,.ag-toolbar *,.ag-toolbar *::before,.ag-toolbar *::after{box-sizing:border-box}.ag-toolbar [hidden]{display:none}.ag-toolbar button{font:inherit;background:none;border:0;margin:0;padding:0;cursor:pointer}.ag-toolbar-container{position:relative;user-select:none;margin-left:auto;align-self:flex-end;display:flex;align-items:center;justify-content:center;background:#1a1a1a;color:#fff;border:none;box-sizing:content-box;box-shadow:0 2px 8px rgba(0,0,0,.2),0 4px 16px rgba(0,0,0,.1);pointer-events:auto;transition:width .4s cubic-bezier(0.19, 1, 0.22, 1),transform .4s cubic-bezier(0.19, 1, 0.22, 1)}.ag-toolbar-container.is-entrance{animation:ag-toolbar-enter .5s cubic-bezier(0.34, 1.2, 0.64, 1) forwards}.ag-toolbar-container.is-hiding{animation:ag-toolbar-hide .4s cubic-bezier(0.4, 0, 1, 1) forwards;pointer-events:none}.ag-toolbar-container.is-collapsed{width:44px;height:44px;border-radius:22px;padding:0;cursor:pointer}.ag-toolbar-container.is-collapsed svg{margin-top:-1px}.ag-toolbar-container.is-collapsed:hover{background:#2a2a2a}.ag-toolbar-container.is-collapsed:active{transform:scale(0.95)}.ag-toolbar-container.is-expanded{height:44px;border-radius:1.5rem;padding:.375rem;width:297px}.ag-toolbar-container.is-expanded.is-send-available{width:337px}.ag-toolbar-toggle-content{position:absolute;display:flex;align-items:center;justify-content:center;transition:opacity .1s cubic-bezier(0.19, 1, 0.22, 1)}.ag-toolbar-toggle-content.is-visible{opacity:1;visibility:visible;pointer-events:auto}.ag-toolbar-toggle-content.is-hidden{opacity:0;pointer-events:none}.ag-toolbar-controls-content{display:flex;align-items:center;gap:.375rem;transition:filter .8s cubic-bezier(0.19, 1, 0.22, 1),opacity .8s cubic-bezier(0.19, 1, 0.22, 1),transform .6s cubic-bezier(0.19, 1, 0.22, 1)}.ag-toolbar-controls-content.is-visible{opacity:1;filter:blur(0px);transform:scale(1);visibility:visible;pointer-events:auto}.ag-toolbar-controls-content.is-hidden{pointer-events:none;opacity:0;filter:blur(10px);transform:scale(0.4)}.ag-toolbar-controls-content.is-hidden *{pointer-events:none}.ag-toolbar-badge{position:absolute;top:-13px;right:-13px;user-select:none;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background-color:var(--agentation-color-accent);color:#fff;font-size:.625rem;font-weight:600;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.15),inset 0 0 0 1px hsla(0,0%,100%,.04);opacity:1;transition:transform .3s ease,opacity .2s ease;transform:scale(1)}.ag-toolbar-badge.is-fade-out{opacity:0;transform:scale(0);pointer-events:none}.ag-toolbar-badge.is-entrance{animation:ag-toolbar-badge-enter .3s cubic-bezier(0.34, 1.2, 0.64, 1) .4s both}.ag-toolbar-control-button{position:relative;cursor:pointer;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;border:none;background:rgba(0,0,0,0);color:hsla(0,0%,100%,.85);transition:background-color .15s ease,color .15s ease,transform .1s ease,opacity .2s ease}.ag-toolbar-control-button:hover:not(:disabled):not([data-active=true]):not([data-failed=true]):not([data-auto-sync=true]):not([data-error=true]):not([data-no-hover=true]){background:hsla(0,0%,100%,.12);color:#fff}.ag-toolbar-control-button:active:not(:disabled){transform:scale(0.92)}.ag-toolbar-control-button:disabled{opacity:.35;cursor:not-allowed}.ag-toolbar-control-button[data-active=true]{color:var(--agentation-color-blue);background-color:color-mix(in srgb, var(--agentation-color-blue) 25%, transparent)}.ag-toolbar-control-button[data-error=true]{color:var(--agentation-color-red);background-color:color-mix(in srgb, var(--agentation-color-red) 25%, transparent)}.ag-toolbar-control-button[data-danger]:hover:not(:disabled):not([data-active=true]):not([data-failed=true]){background-color:color-mix(in srgb, var(--agentation-color-red) 25%, transparent);color:var(--agentation-color-red)}.ag-toolbar-control-button[data-no-hover=true],.ag-toolbar-control-button.ag-toolbar-status-showing{cursor:default;pointer-events:none;background:rgba(0,0,0,0) !important}.ag-toolbar-control-button[data-failed=true]{color:var(--agentation-color-red);background-color:color-mix(in srgb, var(--agentation-color-red) 25%, transparent)}.ag-toolbar-control-button:focus-visible{outline:2px solid var(--agentation-color-accent);outline-offset:2px}.ag-toolbar-button-badge{position:absolute;top:0px;right:0px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background-color:var(--agentation-color-accent);color:#fff;font-size:.625rem;font-weight:600;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #1a1a1a,0 1px 3px rgba(0,0,0,.2);pointer-events:none}.ag-toolbar-mcp-indicator{position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:50%;pointer-events:none;transition:background-color .3s ease,opacity .15s ease,transform .15s ease;opacity:0;transform:scale(0);animation:none}.ag-toolbar-mcp-indicator.is-connected{background-color:var(--agentation-color-green)}.ag-toolbar-mcp-indicator.is-connecting{background-color:var(--agentation-color-yellow)}.ag-toolbar-mcp-indicator.is-visible{opacity:1;transform:scale(1)}.ag-toolbar-mcp-indicator.is-visible.is-connected{animation:ag-toolbar-mcp-pulse-connected 2.5s ease-in-out infinite}.ag-toolbar-mcp-indicator.is-visible.is-connecting{animation:ag-toolbar-mcp-pulse-connecting 1.5s ease-in-out infinite}.ag-toolbar-button-wrapper{position:relative;display:flex;align-items:center;justify-content:center}.ag-toolbar-button-wrapper:hover .ag-toolbar-button-tooltip{opacity:1;visibility:visible;transform:translateX(-50%) scale(1);transition-delay:.85s}.ag-toolbar-button-wrapper:has(.ag-toolbar-control-button:disabled):hover .ag-toolbar-button-tooltip{opacity:0;visibility:hidden}.ag-toolbar-tooltips-in-session .ag-toolbar-button-wrapper:hover .ag-toolbar-button-tooltip{transition-delay:0s}.ag-toolbar-send{width:0;opacity:0;overflow:hidden;pointer-events:none;margin-left:-0.375rem;transition:width .4s cubic-bezier(0.19, 1, 0.22, 1),opacity .3s cubic-bezier(0.19, 1, 0.22, 1),margin .4s cubic-bezier(0.19, 1, 0.22, 1)}.ag-toolbar-send .ag-toolbar-control-button{transform:scale(0.8);transition:transform .4s cubic-bezier(0.19, 1, 0.22, 1)}.ag-toolbar-send.is-send-visible{width:34px;opacity:1;overflow:visible;pointer-events:auto;margin-left:0}.ag-toolbar-send.is-send-visible .ag-toolbar-control-button{transform:scale(1)}.ag-toolbar-button-tooltip{position:absolute;bottom:calc(100% + 14px);left:50%;transform:translateX(-50%) scale(0.95);padding:6px 10px;background:#1a1a1a;color:hsla(0,0%,100%,.9);font-size:12px;font-weight:500;border-radius:8px;white-space:nowrap;opacity:0;visibility:hidden;pointer-events:none;z-index:100001;box-shadow:0 2px 8px rgba(0,0,0,.3);transition:opacity .135s ease,transform .135s ease,visibility .135s ease}.ag-toolbar-button-tooltip::after{content:"";position:absolute;top:calc(100% - 4px);left:50%;transform:translateX(-50%) rotate(45deg);width:8px;height:8px;background:#1a1a1a;border-radius:0 0 2px 0}.ag-toolbar-shortcut{margin-left:4px;opacity:.5}.ag-toolbar-tooltip-below .ag-toolbar-button-tooltip{bottom:auto;top:calc(100% + 14px);transform:translateX(-50%) scale(0.95)}.ag-toolbar-tooltip-below .ag-toolbar-button-tooltip::after{top:-4px;bottom:auto;border-radius:2px 0 0 0}.ag-toolbar-tooltip-below .ag-toolbar-button-wrapper:hover .ag-toolbar-button-tooltip{transform:translateX(-50%) scale(1)}.ag-toolbar-tooltips-hidden .ag-toolbar-button-tooltip{opacity:0 !important;visibility:hidden !important;transition:none !important}.ag-toolbar-button-wrapper-align-left .ag-toolbar-button-tooltip{left:50%;transform:translateX(-12px) scale(0.95)}.ag-toolbar-button-wrapper-align-left .ag-toolbar-button-tooltip::after{left:16px}.ag-toolbar-button-wrapper-align-left:hover .ag-toolbar-button-tooltip{transform:translateX(-12px) scale(1)}.ag-toolbar-tooltip-below .ag-toolbar-button-wrapper-align-left .ag-toolbar-button-tooltip{transform:translateX(-12px) scale(0.95)}.ag-toolbar-tooltip-below .ag-toolbar-button-wrapper-align-left:hover .ag-toolbar-button-tooltip{transform:translateX(-12px) scale(1)}.ag-toolbar-button-wrapper-align-right .ag-toolbar-button-tooltip{left:50%;transform:translateX(calc(-100% + 12px)) scale(0.95)}.ag-toolbar-button-wrapper-align-right .ag-toolbar-button-tooltip::after{left:auto;right:8px}.ag-toolbar-button-wrapper-align-right:hover .ag-toolbar-button-tooltip{transform:translateX(calc(-100% + 12px)) scale(1)}.ag-toolbar-tooltip-below .ag-toolbar-button-wrapper-align-right .ag-toolbar-button-tooltip{transform:translateX(calc(-100% + 12px)) scale(0.95)}.ag-toolbar-tooltip-below .ag-toolbar-button-wrapper-align-right:hover .ag-toolbar-button-tooltip{transform:translateX(calc(-100% + 12px)) scale(1)}.ag-toolbar-divider{width:1px;height:12px;background:hsla(0,0%,100%,.15);margin:0 .125rem}:host([data-agentation-theme=light]) .ag-toolbar-container{background:#fff;color:rgba(0,0,0,.85);box-shadow:0 2px 8px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06),0 0 0 1px rgba(0,0,0,.04)}:host([data-agentation-theme=light]) .ag-toolbar-container.is-collapsed:hover{background:#f5f5f5}:host([data-agentation-theme=light]) .ag-toolbar-button-badge{box-shadow:0 0 0 2px #fff,0 1px 3px rgba(0,0,0,.2)}:host([data-agentation-theme=light]) .ag-toolbar-control-button{color:rgba(0,0,0,.5)}:host([data-agentation-theme=light]) .ag-toolbar-control-button:hover:not(:disabled):not([data-active=true]):not([data-failed=true]):not([data-auto-sync=true]):not([data-error=true]):not([data-no-hover=true]){background:rgba(0,0,0,.06);color:rgba(0,0,0,.85)}:host([data-agentation-theme=light]) .ag-toolbar-control-button[data-active=true]{color:var(--agentation-color-blue);background:color-mix(in srgb, var(--agentation-color-blue) 15%, transparent)}:host([data-agentation-theme=light]) .ag-toolbar-control-button[data-error=true]{color:var(--agentation-color-red);background:color-mix(in srgb, var(--agentation-color-red) 15%, transparent)}:host([data-agentation-theme=light]) .ag-toolbar-control-button[data-danger]:hover:not(:disabled):not([data-active=true]):not([data-failed=true]){color:var(--agentation-color-red);background:color-mix(in srgb, var(--agentation-color-red) 15%, transparent)}:host([data-agentation-theme=light]) .ag-toolbar-control-button[data-failed=true]{color:var(--agentation-color-red);background:color-mix(in srgb, var(--agentation-color-red) 15%, transparent)}:host([data-agentation-theme=light]) .ag-toolbar-button-tooltip{background:#fff;color:rgba(0,0,0,.85);box-shadow:0 2px 8px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06),0 0 0 1px rgba(0,0,0,.04)}:host([data-agentation-theme=light]) .ag-toolbar-button-tooltip::after{background:#fff}:host([data-agentation-theme=light]) .ag-toolbar-divider{background:rgba(0,0,0,.1)}@keyframes ag-settings-cycle-text-in{0%{opacity:0;transform:translateY(-6px)}100%{opacity:1;transform:translateY(0)}}@keyframes ag-settings-theme-icon-in{0%{opacity:0;transform:scale(0.8) rotate(-30deg)}100%{opacity:1;transform:scale(1) rotate(0deg)}}@keyframes ag-settings-mcp-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb, var(--agentation-color-green) 50%, transparent)}70%{box-shadow:0 0 0 6px color-mix(in srgb, var(--agentation-color-green) 0%, transparent)}100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--agentation-color-green) 0%, transparent)}}@keyframes ag-settings-mcp-pulse-error{0%{box-shadow:0 0 0 0 color-mix(in srgb, var(--agentation-color-red) 50%, transparent)}70%{box-shadow:0 0 0 6px color-mix(in srgb, var(--agentation-color-red) 0%, transparent)}100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--agentation-color-red) 0%, transparent)}}.ag-settings{position:fixed;top:var(--agentation-toolbar-top, auto);right:var(--agentation-toolbar-right, 1.25rem);bottom:var(--agentation-toolbar-bottom, 1.25rem);left:var(--agentation-toolbar-left, auto);width:337px;height:44px;z-index:var(--agentation-z-index, 100000);font-family:var(--agentation-font);pointer-events:none;transition:left 0s,top 0s,right 0s,bottom 0s}.ag-settings,.ag-settings *,.ag-settings *::before,.ag-settings *::after{box-sizing:border-box}:where(.ag-settings) button{font:inherit;color:inherit;background:none;border:0;margin:0;padding:0}:where(.ag-settings) p{margin:0}.ag-settings :is(button,a,input,textarea):focus-visible{outline:2px solid var(--agentation-color-accent);outline-offset:2px}.ag-settings-panel{position:absolute;right:5px;bottom:calc(100% + .5rem);overflow:hidden;background:#1a1a1a;border-radius:16px;padding:12px 0;width:100%;max-width:253px;min-width:205px;cursor:default;pointer-events:auto;box-shadow:0 4px 20px rgba(0,0,0,.3),0 0 0 1px hsla(0,0%,100%,.08);transition:background-color .25s ease,box-shadow .25s ease}.ag-settings-panel.ag-settings-panel-below{bottom:auto;top:calc(100% + .5rem)}.ag-settings-panel::before,.ag-settings-panel::after{content:"";position:absolute;top:0;bottom:0;width:16px;z-index:2;pointer-events:none}.ag-settings-panel::before{left:0;background:linear-gradient(to right, #1c1c1c 0%, transparent 100%)}.ag-settings-panel::after{right:0;background:linear-gradient(to left, #1c1c1c 0%, transparent 100%)}.ag-settings-panel :is(.ag-settings-header,.ag-settings-brand,.ag-settings-version,.ag-settings-section,.ag-settings-label,.ag-settings-cycle,.ag-settings-cycle-dot,.ag-settings-theme-toggle){transition:background-color .25s ease,color .25s ease,border-color .25s ease}.ag-settings-panel.ag-settings-enter{opacity:1;transform:translateY(0) scale(1);filter:blur(0px);transition:opacity .2s ease,transform .2s ease,filter .2s ease}.ag-settings-panel.ag-settings-exit{opacity:0;transform:translateY(8px) scale(0.95);filter:blur(5px);pointer-events:none;transition:opacity .1s ease,transform .1s ease,filter .1s ease}:host([data-agentation-theme=light]) .ag-settings-panel{background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06),0 0 0 1px rgba(0,0,0,.04)}:host([data-agentation-theme=light]) .ag-settings-panel::before{background:linear-gradient(to right, #fff 0%, transparent 100%)}:host([data-agentation-theme=light]) .ag-settings-panel::after{background:linear-gradient(to left, #fff 0%, transparent 100%)}.ag-settings-container{overflow:visible;position:relative;display:flex;padding:0 16px}.ag-settings-page{min-width:100%;flex-basis:0;flex-shrink:0;transition:transform .2s ease,opacity .2s ease;transition-delay:0s;opacity:1}.ag-settings-page.ag-settings-slide-left{transform:translateX(-24px);opacity:0;pointer-events:none}.ag-settings-automations-page{position:absolute;top:0;left:24px;width:100%;height:100%;padding:0 16px 4px;display:flex;flex-direction:column;transition:transform .2s ease,opacity .2s ease;opacity:0;pointer-events:none}.ag-settings-automations-page.ag-settings-slide-in{transform:translateX(-24px);opacity:1;pointer-events:auto}.ag-settings-header{display:flex;align-items:center;justify-content:space-between;height:24px}.ag-settings-brand{font-size:.8125rem;font-weight:600;letter-spacing:-0.0094em;color:#fff;text-decoration:none}.ag-settings-version{font-size:11px;font-weight:400;color:hsla(0,0%,100%,.4);margin-left:auto;letter-spacing:-0.0094em}.ag-settings-theme-toggle{display:flex;align-items:center;justify-content:center;width:22px;height:22px;margin-left:8px;border:none;border-radius:6px;background:rgba(0,0,0,0);color:hsla(0,0%,100%,.4);transition:background-color .15s ease,color .15s ease;cursor:pointer}.ag-settings-theme-toggle:hover{background:hsla(0,0%,100%,.1);color:hsla(0,0%,100%,.8)}.ag-settings-theme-icon-wrapper{display:flex;align-items:center;justify-content:center;position:relative;width:20px;height:20px}.ag-settings-theme-icon{display:flex;align-items:center;justify-content:center;animation:ag-settings-theme-icon-in .35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards}.ag-settings-theme-icon[hidden]{display:none}:host([data-agentation-theme=light]) .ag-settings-brand{color:#e5484d}:host([data-agentation-theme=light]) .ag-settings-version{color:rgba(0,0,0,.4)}:host([data-agentation-theme=light]) .ag-settings-theme-toggle{color:rgba(0,0,0,.4)}:host([data-agentation-theme=light]) .ag-settings-theme-toggle:hover{background:rgba(0,0,0,.06);color:rgba(0,0,0,.7)}.ag-settings-divider{margin-block:8px;width:100%;height:1px;background-color:hsla(0,0%,100%,.07)}:host([data-agentation-theme=light]) .ag-settings-divider{background-color:rgba(26,26,26,.07)}.ag-settings-section-grow{flex:1;display:flex;flex-direction:column}.ag-settings-row{display:flex;align-items:center;justify-content:space-between;min-height:24px}.ag-settings-row.ag-settings-row-margin-top{margin-top:8px}.ag-settings-label{display:flex;align-items:center;column-gap:2px;line-height:20px;font-size:13px;font-weight:400;letter-spacing:-0.15px;color:hsla(0,0%,100%,.6)}.ag-settings-row-disabled .ag-settings-label{color:hsla(0,0%,100%,.2)}:host([data-agentation-theme=light]) .ag-settings-label{color:rgba(0,0,0,.5)}:host([data-agentation-theme=light]) .ag-settings-row-disabled .ag-settings-label{color:rgba(0,0,0,.2)}.ag-settings-label label{cursor:pointer}.ag-settings-row-disabled .ag-settings-label label{cursor:not-allowed}.ag-settings-cycle{display:flex;align-items:center;gap:.5rem;padding:0;border:none;background:rgba(0,0,0,0);font-size:.8125rem;font-weight:500;color:#fff;cursor:pointer;letter-spacing:-0.0094em}.ag-settings-cycle:disabled{opacity:.35;cursor:not-allowed}.ag-settings-cycle-text{display:inline-block;animation:ag-settings-cycle-text-in .2s ease-out}.ag-settings-cycle-text[hidden]{display:none}.ag-settings-cycle-dots{display:flex;flex-direction:column;gap:2px}.ag-settings-cycle-dot{width:3px;height:3px;border-radius:50%;background:hsla(0,0%,100%,.3);transform:scale(0.667)}.ag-settings-cycle-dot.is-active{background:#fff;transform:scale(1)}:host([data-agentation-theme=light]) .ag-settings-cycle{color:rgba(0,0,0,.85)}:host([data-agentation-theme=light]) .ag-settings-cycle-dot{background:rgba(0,0,0,.2)}:host([data-agentation-theme=light]) .ag-settings-cycle-dot.is-active{background:rgba(0,0,0,.7)}.ag-settings-color-options{display:flex;justify-content:space-between;align-items:center;margin-top:6px;height:26px}.ag-settings-color-option{padding:0;position:relative;border-radius:50%;width:20px;height:20px;background-color:#1a1a1a;cursor:pointer}.ag-settings-color-option::before,.ag-settings-color-option::after{content:"";position:absolute;inset:0;border-radius:50%;background-color:var(--swatch);transition:opacity .2s,transform .2s}@supports(color: color(display-p3 0 0 0)){.ag-settings-color-option::before,.ag-settings-color-option::after{--color: var(--swatch-p3)}}.ag-settings-color-option::after{z-index:-1;transform:scale(1.2);opacity:0}.ag-settings-color-option.is-selected::before{transform:scale(0.8)}.ag-settings-color-option.is-selected::after{opacity:1}:host([data-agentation-theme=light]) .ag-settings-color-option{background-color:#fff}.ag-settings-checkbox-field{display:flex;align-items:center;height:24px}.ag-settings-checkbox-field:not(:first-child){margin-top:8px}.ag-settings-checkbox-label{padding-inline:8px 2px;line-height:20px;font-size:13px;letter-spacing:-0.15px;color:hsla(0,0%,100%,.5);cursor:pointer}:host([data-agentation-theme=light]) .ag-settings-checkbox-label{color:rgba(26,26,26,.5)}.ag-settings-checkbox{display:flex;justify-content:center;align-items:center;position:relative;border:1px solid hsla(0,0%,100%,.2);border-radius:4px;width:14px;height:14px;background-color:#252525;transition:background-color .2s ease;flex-shrink:0}.ag-settings-checkbox:has(.ag-settings-checkbox-input:checked){background-color:#fff}.ag-settings-checkbox:has(.ag-settings-checkbox-input:focus-visible){outline:2px solid var(--agentation-color-accent);outline-offset:2px}.ag-settings-checkbox-input{position:absolute;z-index:1;inset:-1px;border-radius:inherit;opacity:0;cursor:pointer;margin:0}.ag-settings-checkbox-check{color:#1a1a1a}.ag-settings-checkbox-check-path{stroke-dasharray:9.29px;stroke-dashoffset:9.29px;color:#1a1a1a;transition:stroke-dashoffset .1s ease}.ag-settings-checkbox:has(.ag-settings-checkbox-input:checked) .ag-settings-checkbox-check-path{transition-duration:.2s;stroke-dashoffset:0}:host([data-agentation-theme=light]) .ag-settings-checkbox{border-color:rgba(26,26,26,.2);background-color:#fff}:host([data-agentation-theme=light]) .ag-settings-checkbox:has(.ag-settings-checkbox-input:checked){background-color:#1a1a1a}:host([data-agentation-theme=light]) .ag-settings-checkbox-check,:host([data-agentation-theme=light]) .ag-settings-checkbox-check-path{color:#fafafa}.ag-settings-switch{display:flex;align-items:center;position:relative;padding:2px;width:24px;height:16px;border-radius:8px;background-color:#484848;flex-shrink:0;transition:background-color .15s,opacity .15s}:host([data-agentation-theme=light]) .ag-settings-switch{background-color:#cdcdcd}.ag-settings-switch:has(.ag-settings-switch-input:checked){background-color:var(--agentation-color-blue)}.ag-settings-switch:has(.ag-settings-switch-input:disabled){opacity:.3}.ag-settings-switch:has(.ag-settings-switch-input:focus-visible){outline:2px solid var(--agentation-color-accent);outline-offset:2px}.ag-settings-switch-input{position:absolute;z-index:1;inset:0;border-radius:inherit;opacity:0;cursor:pointer;margin:0}.ag-settings-switch-input:disabled{cursor:not-allowed}.ag-settings-switch-thumb{border-radius:50%;width:12px;height:12px;background-color:#fff;transition:transform .15s}.ag-settings-switch:has(.ag-settings-switch-input:checked) .ag-settings-switch-thumb{transform:translateX(8px)}.ag-settings-nav-link{display:flex;align-items:center;justify-content:space-between;width:100%;height:24px;padding:0;border:none;background:rgba(0,0,0,0);font-family:inherit;line-height:20px;font-size:13px;font-weight:400;color:hsla(0,0%,100%,.5);transition:color .15s ease;cursor:pointer}.ag-settings-nav-link:hover{color:hsla(0,0%,100%,.9)}.ag-settings-nav-link svg{color:hsla(0,0%,100%,.4);transition:color .15s ease}.ag-settings-nav-link:hover svg{color:#fff}.ag-settings-nav-link-right{display:flex;align-items:center;gap:6px}:host([data-agentation-theme=light]) .ag-settings-nav-link{color:rgba(0,0,0,.5)}:host([data-agentation-theme=light]) .ag-settings-nav-link:hover{color:rgba(0,0,0,.8)}:host([data-agentation-theme=light]) .ag-settings-nav-link svg{color:rgba(0,0,0,.25)}:host([data-agentation-theme=light]) .ag-settings-nav-link:hover svg{color:rgba(0,0,0,.8)}.ag-settings-back-button{display:flex;align-items:center;gap:4px;height:24px;background:rgba(0,0,0,0);font-family:inherit;line-height:20px;font-size:13px;font-weight:500;letter-spacing:-0.15px;color:#fff;cursor:pointer;transition:transform .12s cubic-bezier(0.32, 0.72, 0, 1)}.ag-settings-back-button svg{opacity:.4;flex-shrink:0;transition:opacity .15s ease,transform .18s cubic-bezier(0.32, 0.72, 0, 1)}.ag-settings-back-button:hover svg{opacity:1}:host([data-agentation-theme=light]) .ag-settings-back-button{color:rgba(0,0,0,.85);border-bottom-color:rgba(0,0,0,.08)}.ag-settings-automation-header{display:flex;align-items:center;gap:.125rem;font-size:.8125rem;font-weight:400;color:#fff}.ag-settings-automation-description{font-size:.6875rem;font-weight:300;color:hsla(0,0%,100%,.5);margin-top:2px;line-height:14px}.ag-settings-mcp-description{padding-bottom:6px}.ag-settings-learn-more{color:hsla(0,0%,100%,.8);text-decoration-line:underline;text-decoration-style:dotted;text-decoration-color:hsla(0,0%,100%,.2);text-underline-offset:2px;transition:color .15s ease}.ag-settings-learn-more:hover{color:#fff}:host([data-agentation-theme=light]) .ag-settings-automation-header{color:rgba(0,0,0,.85)}:host([data-agentation-theme=light]) .ag-settings-automation-description{color:rgba(0,0,0,.5)}:host([data-agentation-theme=light]) .ag-settings-learn-more{color:rgba(0,0,0,.6);text-decoration-color:rgba(0,0,0,.2)}:host([data-agentation-theme=light]) .ag-settings-learn-more:hover{color:rgba(0,0,0,.85)}.ag-settings-auto-send{display:flex;align-items:center}.ag-settings-auto-send-label{padding-inline-end:8px;font-size:11px;font-weight:400;color:hsla(0,0%,100%,.4);transition:color .15s,opacity .15s;cursor:pointer}.ag-settings-auto-send-label.is-active{color:#66b8ff;color:color(display-p3 .4 .72 1)}.ag-settings-auto-send-label.is-disabled{opacity:.3;cursor:not-allowed}:host([data-agentation-theme=light]) .ag-settings-auto-send-label{color:rgba(0,0,0,.4)}:host([data-agentation-theme=light]) .ag-settings-auto-send-label.is-active{color:var(--agentation-color-blue)}.ag-settings-mcp-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}.ag-settings-mcp-status-dot.is-connecting{background-color:var(--agentation-color-yellow);animation:ag-settings-mcp-pulse 1.5s infinite}.ag-settings-mcp-status-dot.is-connected{background-color:var(--agentation-color-green);animation:ag-settings-mcp-pulse 2.5s ease-in-out infinite}.ag-settings-mcp-status-dot.is-disconnected{background-color:var(--agentation-color-red);animation:ag-settings-mcp-pulse-error 2s infinite}.ag-settings-mcp-nav-indicator{width:8px;height:8px;border-radius:50%;flex-shrink:0}.ag-settings-mcp-nav-indicator.is-connected{background-color:var(--agentation-color-green);animation:ag-settings-mcp-pulse 2.5s ease-in-out infinite}.ag-settings-mcp-nav-indicator.is-connecting{background-color:var(--agentation-color-yellow);animation:ag-settings-mcp-pulse 1.5s ease-in-out infinite}.ag-settings-mcp-status-dot[hidden],.ag-settings-mcp-nav-indicator[hidden]{display:none}.ag-settings-webhook-field{display:flex;flex-direction:column;width:100%;flex:1;min-height:60px;margin-top:11px;padding:8px 10px;border:1px solid hsla(0,0%,100%,.1);border-radius:6px;background:hsla(0,0%,100%,.03);transition:border-color .15s ease,background-color .15s ease,box-shadow .15s ease}.ag-settings-webhook-field:focus-within{border-color:hsla(0,0%,100%,.3);background:hsla(0,0%,100%,.08)}.ag-settings-webhook-input{display:block;width:100%;padding:0;border:0;background:rgba(0,0,0,0);font-family:inherit;font-size:.75rem;font-weight:400;color:#fff;outline:none;user-select:text}.ag-settings-webhook-input::placeholder{color:hsla(0,0%,100%,.3)}.ag-settings-webhook-error{margin-top:4px;font-size:.6875rem;font-weight:400;line-height:14px;color:var(--agentation-color-red)}.ag-settings-webhook-error[hidden]{display:none}:host([data-agentation-theme=light]) .ag-settings-webhook-field{border-color:rgba(0,0,0,.1);background:rgba(0,0,0,.03)}:host([data-agentation-theme=light]) .ag-settings-webhook-field:focus-within{border-color:rgba(0,0,0,.25);background:rgba(0,0,0,.05)}:host([data-agentation-theme=light]) .ag-settings-webhook-input{color:rgba(0,0,0,.85)}:host([data-agentation-theme=light]) .ag-settings-webhook-input::placeholder{color:rgba(0,0,0,.3)}.ag-settings-help{display:flex;justify-content:center;align-items:center;cursor:help}.ag-settings-help-icon{transform:translateY(0.5px);color:#fff;opacity:.2;transition:opacity .15s ease;will-change:transform}.ag-settings-help:hover .ag-settings-help-icon,.ag-settings-help:focus-visible .ag-settings-help-icon{opacity:.5}:host([data-agentation-theme=light]) .ag-settings-help-icon{color:#000}.ag-settings-tooltip{position:fixed;transform:translateY(-50%);padding:6px 10px;width:180px;background:#383838;color:hsla(0,0%,100%,.7);font-size:11px;font-weight:400;line-height:14px;border-radius:10px;text-align:left;z-index:100020;pointer-events:none;box-shadow:0px 1px 8px rgba(0,0,0,.28);opacity:0;transition:opacity .15s ease}.ag-settings-tooltip[hidden]{display:none}.ag-settings-tooltip.is-visible{opacity:1}@keyframes ag-popup-enter{from{opacity:0;transform:translateX(-50%) scale(0.95) translateY(4px)}to{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}}@keyframes ag-popup-exit{from{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}to{opacity:0;transform:translateX(-50%) scale(0.95) translateY(4px)}}@keyframes ag-popup-shake{0%,100%{transform:translateX(-50%) scale(1) translateY(0) translateX(0)}20%{transform:translateX(-50%) scale(1) translateY(0) translateX(-3px)}40%{transform:translateX(-50%) scale(1) translateY(0) translateX(3px)}60%{transform:translateX(-50%) scale(1) translateY(0) translateX(-2px)}80%{transform:translateX(-50%) scale(1) translateY(0) translateX(2px)}}.ag-popup{position:fixed;transform:translateX(-50%);width:280px;padding:.75rem 1rem 14px;background:#1a1a1a;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.3),0 0 0 1px hsla(0,0%,100%,.08);z-index:calc(var(--agentation-z-index, 100000) + 1);font-family:var(--agentation-font);pointer-events:auto;will-change:transform,opacity;opacity:0;--ag-popup-accent: var(--agentation-color-accent)}.ag-popup.is-multi{--ag-popup-accent: var(--agentation-color-green)}.ag-popup.is-enter{animation:ag-popup-enter .2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards}.ag-popup.is-entered{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}.ag-popup.is-exit{animation:ag-popup-exit .15s ease-in forwards}.ag-popup.is-entered.is-shaking{animation:ag-popup-shake .25s ease-out}.ag-popup[hidden]{display:none}.ag-popup,.ag-popup *,.ag-popup *::before,.ag-popup *::after{box-sizing:border-box}.ag-popup button{font:inherit;color:inherit;background:none;border:0;margin:0;padding:0;cursor:pointer}.ag-popup-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:.5625rem}.ag-popup-element{font-size:.75rem;font-weight:400;color:hsla(0,0%,100%,.5);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.ag-popup-header-toggle{display:flex;align-items:center;gap:.25rem;flex:1;min-width:0;text-align:left}.ag-popup-header-toggle[hidden],.ag-popup-element[hidden],.ag-popup-styles-wrapper[hidden],.ag-popup-quote[hidden],.ag-popup-delete-wrapper[hidden]{display:none}.ag-popup-chevron{color:hsla(0,0%,100%,.5);transition:transform .25s cubic-bezier(0.16, 1, 0.3, 1);flex-shrink:0}.ag-popup-chevron.is-expanded{transform:rotate(90deg)}.ag-popup-styles-wrapper{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s cubic-bezier(0.16, 1, 0.3, 1)}.ag-popup-styles-wrapper.is-expanded{grid-template-rows:1fr}.ag-popup-styles-inner{overflow:hidden}.ag-popup-styles-block{background:hsla(0,0%,100%,.05);border-radius:.375rem;padding:.5rem .625rem;margin-bottom:.5rem;font-family:var(--agentation-mono);font-size:.6875rem;line-height:1.5}.ag-popup-style-line{color:hsla(0,0%,100%,.85);word-break:break-word}.ag-popup-style-property{color:#c792ea}.ag-popup-style-value{color:hsla(0,0%,100%,.85)}.ag-popup-quote{font-size:12px;font-style:italic;color:hsla(0,0%,100%,.6);margin-bottom:.5rem;padding:.4rem .5rem;background:hsla(0,0%,100%,.05);border-radius:.25rem;line-height:1.45}.ag-popup-textarea{width:100%;padding:.5rem .625rem;font-size:.8125rem;font-family:inherit;background:hsla(0,0%,100%,.05);color:#fff;border:1px solid hsla(0,0%,100%,.15);border-radius:8px;resize:none;outline:none;transition:border-color .15s ease}.ag-popup-textarea:focus{border-color:var(--ag-popup-accent)}.ag-popup-textarea::placeholder{color:hsla(0,0%,100%,.35)}.ag-popup-textarea::-webkit-scrollbar{width:6px}.ag-popup-textarea::-webkit-scrollbar-track{background:rgba(0,0,0,0)}.ag-popup-textarea::-webkit-scrollbar-thumb{background:hsla(0,0%,100%,.2);border-radius:3px}.ag-popup-actions{display:flex;justify-content:flex-end;gap:.375rem;margin-top:.5rem}.ag-popup-cancel,.ag-popup-submit{padding:.4rem .875rem;font-size:.75rem;font-weight:500;border-radius:1rem;transition:background-color .15s ease,color .15s ease,opacity .15s ease}.ag-popup-cancel{background:rgba(0,0,0,0);color:hsla(0,0%,100%,.5)}.ag-popup-cancel:hover{background:hsla(0,0%,100%,.1);color:hsla(0,0%,100%,.8)}.ag-popup-submit{background:var(--ag-popup-accent);color:#fff}.ag-popup-submit:hover:not([aria-disabled=true]){filter:brightness(0.9)}.ag-popup-submit[aria-disabled=true]{opacity:.4;cursor:not-allowed}.ag-popup-delete-wrapper{margin-right:auto}.ag-popup-delete{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,0);color:hsla(0,0%,100%,.4);transition:background-color .15s ease,color .15s ease,transform .1s ease}.ag-popup-delete:hover{background-color:color-mix(in srgb, var(--agentation-color-red) 25%, transparent);color:var(--agentation-color-red)}.ag-popup-delete:active{transform:scale(0.92)}.ag-popup.is-light{background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.06)}.ag-popup.is-light .ag-popup-element{color:rgba(0,0,0,.6)}.ag-popup.is-light .ag-popup-chevron{color:rgba(0,0,0,.4)}.ag-popup.is-light .ag-popup-styles-block{background:rgba(0,0,0,.03)}.ag-popup.is-light .ag-popup-style-line{color:rgba(0,0,0,.75)}.ag-popup.is-light .ag-popup-style-property{color:#7c3aed}.ag-popup.is-light .ag-popup-style-value{color:rgba(0,0,0,.75)}.ag-popup.is-light .ag-popup-quote{color:rgba(0,0,0,.55);background:rgba(0,0,0,.04)}.ag-popup.is-light .ag-popup-textarea{background:rgba(0,0,0,.03);color:#1a1a1a;border-color:rgba(0,0,0,.12)}.ag-popup.is-light .ag-popup-textarea::placeholder{color:rgba(0,0,0,.4)}.ag-popup.is-light .ag-popup-textarea::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15)}.ag-popup.is-light .ag-popup-cancel{color:rgba(0,0,0,.5)}.ag-popup.is-light .ag-popup-cancel:hover{background:rgba(0,0,0,.06);color:rgba(0,0,0,.75)}.ag-popup.is-light .ag-popup-delete{color:rgba(0,0,0,.4)}@keyframes ag-marker-in{0%{opacity:0;transform:translate(-50%, -50%) scale(0.3)}100%{opacity:1;transform:translate(-50%, -50%) scale(1)}}@keyframes ag-marker-out{0%{opacity:1;transform:translate(-50%, -50%) scale(1)}100%{opacity:0;transform:translate(-50%, -50%) scale(0.3)}}@keyframes ag-marker-tooltip-in{from{opacity:0;transform:translateX(-50%) translateY(2px) scale(0.891)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(0.909)}}@keyframes ag-marker-renumber-roll{0%{opacity:0;transform:translateX(-40%)}100%{opacity:1;transform:translateX(0)}}.ag-marker-region{display:contents}.ag-marker-region[hidden]{display:none}.ag-marker-layer,.ag-marker-layer-fixed{z-index:calc(var(--agentation-z-index, 100000) - 2)}.ag-marker-layer>*,.ag-marker-layer-fixed>*{pointer-events:auto}.ag-marker-layer .ag-marker,.ag-marker-layer-fixed .ag-marker{position:absolute;z-index:1;display:flex;align-items:center;justify-content:center;width:22px;height:22px;background:var(--agentation-color-blue);border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.2),inset 0 0 0 1px rgba(0,0,0,.04);color:#fff;font-family:var(--agentation-font);font-size:.6875rem;font-weight:600;opacity:1;transform:translate(-50%, -50%) scale(1);cursor:pointer;user-select:none;contain:layout style;will-change:transform,opacity}.ag-marker-layer .ag-marker:hover,.ag-marker-layer-fixed .ag-marker:hover{z-index:2}.ag-marker-layer .ag-marker:focus-visible,.ag-marker-layer-fixed .ag-marker:focus-visible{outline:2px solid var(--agentation-text);outline-offset:2px}.ag-marker-layer .ag-marker:not(.ag-marker-enter):not(.ag-marker-exit):not(.ag-marker-clearing),.ag-marker-layer-fixed .ag-marker:not(.ag-marker-enter):not(.ag-marker-exit):not(.ag-marker-clearing){transition:background-color .15s ease,transform .1s ease}.ag-marker-layer .ag-marker:not(.ag-marker-enter):not(.ag-marker-exit):not(.ag-marker-clearing):hover,.ag-marker-layer-fixed .ag-marker:not(.ag-marker-enter):not(.ag-marker-exit):not(.ag-marker-clearing):hover{transform:translate(-50%, -50%) scale(1.1)}.ag-marker-layer .ag-marker.ag-marker-enter,.ag-marker-layer-fixed .ag-marker.ag-marker-enter{animation:ag-marker-in .25s cubic-bezier(0.22, 1, 0.36, 1) both}.ag-marker-layer .ag-marker.ag-marker-exit,.ag-marker-layer-fixed .ag-marker.ag-marker-exit{animation:ag-marker-out .2s ease-out both;pointer-events:none}.ag-marker-layer .ag-marker.ag-marker-clearing,.ag-marker-layer-fixed .ag-marker.ag-marker-clearing{animation:ag-marker-out .15s ease-out both;pointer-events:none}.ag-marker-layer .ag-marker.ag-marker-multi,.ag-marker-layer-fixed .ag-marker.ag-marker-multi{width:26px;height:26px;border-radius:6px;background-color:var(--agentation-color-green);font-size:.75rem}.ag-marker-layer .ag-marker.ag-marker-hovered,.ag-marker-layer-fixed .ag-marker.ag-marker-hovered{background-color:var(--agentation-color-red)}.ag-marker-layer .ag-marker-label,.ag-marker-layer-fixed .ag-marker-label{display:inline}.ag-marker-layer .ag-marker-label.ag-marker-renumber,.ag-marker-layer-fixed .ag-marker-label.ag-marker-renumber{display:block;animation:ag-marker-renumber-roll .2s ease-out}.ag-marker-layer .ag-marker-label[hidden],.ag-marker-layer .ag-marker-glyph[hidden],.ag-marker-layer-fixed .ag-marker-label[hidden],.ag-marker-layer-fixed .ag-marker-glyph[hidden]{display:none}.ag-marker-layer .ag-marker-tooltip,.ag-marker-layer-fixed .ag-marker-tooltip{position:absolute;top:calc(100% + 10px);left:50%;z-index:100002;display:block;min-width:120px;max-width:200px;padding:8px .75rem;border-radius:.75rem;background:var(--agentation-surface-solid);box-shadow:0 4px 20px var(--ag-marker-tooltip-shadow, rgba(0, 0, 0, 0.3)),0 0 0 1px var(--ag-marker-tooltip-ring, rgba(255, 255, 255, 0.08));color:var(--agentation-text);font-family:var(--agentation-font);font-weight:400;transform:translateX(-50%) scale(0.909);animation:ag-marker-tooltip-in .1s ease-out forwards;pointer-events:none;cursor:default}.ag-marker-layer .ag-marker-tooltip[hidden],.ag-marker-layer-fixed .ag-marker-tooltip[hidden]{display:none}.ag-marker-layer .ag-marker-quote,.ag-marker-layer-fixed .ag-marker-quote{display:block;overflow:hidden;margin-bottom:.3125rem;color:var(--agentation-text-muted);font-size:12px;font-style:italic;line-height:1.4;white-space:nowrap;text-overflow:ellipsis}.ag-marker-layer .ag-marker-note,.ag-marker-layer-fixed .ag-marker-note{display:block;overflow:hidden;padding-bottom:2px;color:var(--agentation-text);font-size:13px;font-weight:400;line-height:1.4;white-space:nowrap;text-overflow:ellipsis}:host([data-agentation-theme=light]) .ag-marker-tooltip{--ag-marker-tooltip-shadow: rgba(0, 0, 0, 0.12);--ag-marker-tooltip-ring: rgba(0, 0, 0, 0.06)}@keyframes ag-overlay-hover-highlight-in{from{opacity:0;transform:scale(0.98)}to{opacity:1;transform:scale(1)}}@keyframes ag-overlay-hover-tooltip-in{from{opacity:0;transform:scale(0.95) translateY(4px)}to{opacity:1;transform:scale(1) translateY(0)}}@keyframes ag-overlay-fade-in{from{opacity:0}to{opacity:1}}@keyframes ag-overlay-fade-out{from{opacity:1}to{opacity:0}}.ag-overlay{display:contents;--ag-overlay-layer: calc(var(--agentation-z-index, 100000) - 3)}.ag-overlay.is-editing{--ag-overlay-layer: calc(var(--agentation-z-index, 100000) - 1)}.ag-overlay :is(*,*::before,*::after){box-sizing:border-box}.ag-overlay [hidden]{display:none}.ag-overlay-group{display:contents}.ag-overlay-blank-canvas{position:fixed;inset:0;z-index:calc(var(--agentation-z-index, 100000) - 6);background:#fff;opacity:0;pointer-events:none;transition:opacity .25s ease}.ag-overlay-blank-canvas.is-visible{opacity:var(--canvas-opacity, 1);pointer-events:auto}.ag-overlay-blank-canvas::after{position:absolute;inset:0;content:"";background-image:radial-gradient(circle, rgba(0, 0, 0, 0.08) 1px, transparent 1px);background-position:12px 12px;background-size:24px 24px;pointer-events:none;transition:opacity .2s ease}.ag-overlay-blank-canvas.is-grid-active::after{opacity:1;background-image:radial-gradient(circle, rgba(0, 0, 0, 0.22) 1px, transparent 1px)}.ag-overlay-wireframe-notice{position:fixed;bottom:16px;left:24px;z-index:calc(var(--agentation-z-index, 100000) - 5);max-width:280px;color:rgba(0,0,0,.4);pointer-events:none;font-family:var(--agentation-font);font-size:9.5px;font-weight:400;line-height:1.5;animation:ag-overlay-fade-in .3s ease}.ag-overlay-wireframe-opacity-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}.ag-overlay-wireframe-opacity-label{color:rgba(0,0,0,.32);font-size:9px;font-weight:500;letter-spacing:.02em;user-select:none;white-space:nowrap}.ag-overlay-wireframe-opacity-slider{width:56px;height:4px;flex-shrink:0;appearance:none;-webkit-appearance:none;outline:none;border-radius:2px;background:rgba(0,0,0,.08);cursor:pointer;pointer-events:auto;transition:background .15s ease}.ag-overlay-wireframe-opacity-slider:hover{background:rgba(0,0,0,.13)}.ag-overlay-wireframe-opacity-slider::-webkit-slider-thumb{width:10px;height:10px;appearance:none;-webkit-appearance:none;border-radius:50%;background:#f97316;cursor:pointer;transition:background .15s ease}.ag-overlay-wireframe-opacity-slider::-webkit-slider-thumb:hover{background:#e05f06}.ag-overlay-wireframe-opacity-slider::-moz-range-thumb{width:10px;height:10px;border:none;border-radius:50%;background:#f97316;cursor:pointer}.ag-overlay-wireframe-opacity-slider::-moz-range-track{height:4px;border-radius:2px;background:rgba(0,0,0,.08)}.ag-overlay-wireframe-notice-title-row{display:flex;align-items:center;gap:0;margin-bottom:2px}.ag-overlay-wireframe-notice-title{color:rgba(0,0,0,.55);font-weight:600}.ag-overlay-wireframe-notice-divider{width:1px;height:8px;flex-shrink:0;margin:0 8px;background:rgba(0,0,0,.12)}.ag-overlay-wireframe-start-over{padding:0;border:none;color:rgba(0,0,0,.35);background:none;cursor:pointer;pointer-events:auto;font-family:inherit;font-size:9.5px;font-weight:500;text-decoration:none;white-space:nowrap;transition:color .12s ease}.ag-overlay-wireframe-start-over:hover{color:rgba(0,0,0,.6)}.ag-overlay-layer{position:fixed;inset:0;z-index:var(--ag-overlay-layer);pointer-events:none}.ag-overlay-hover-highlight{position:fixed;border:2px solid color-mix(in srgb, var(--agentation-color-accent) 50%, transparent);border-radius:4px;background-color:color-mix(in srgb, var(--agentation-color-accent) 4%, transparent);pointer-events:none;will-change:opacity;contain:layout style;animation:ag-overlay-hover-highlight-in .12s ease-out forwards}.ag-overlay-hover-tooltip{position:fixed;max-width:280px;padding:.35rem .6rem;overflow:hidden;border-radius:.375rem;color:#fff;background:rgba(0,0,0,.85);pointer-events:none;font-size:.6875rem;font-weight:500;white-space:nowrap;text-overflow:ellipsis;animation:ag-overlay-hover-tooltip-in .1s ease-out forwards}.ag-overlay-hover-component-path{margin-bottom:.15rem;overflow:hidden;color:hsla(0,0%,100%,.6);font-size:.625rem;text-overflow:ellipsis}.ag-overlay-hover-element-name{overflow:hidden;text-overflow:ellipsis}.ag-overlay-outline{position:fixed;border-radius:4px;pointer-events:none;will-change:opacity;animation:ag-overlay-fade-in .15s ease-out forwards}.ag-overlay-outline.is-exiting{animation:ag-overlay-fade-out .15s ease-out forwards}.ag-overlay-outline-multi{border:2px dashed color-mix(in srgb, var(--agentation-color-green) 60%, transparent);background-color:color-mix(in srgb, var(--agentation-color-green) 5%, transparent)}.ag-overlay-outline-single{border:2px solid color-mix(in srgb, var(--agentation-color-accent) 60%, transparent);background-color:color-mix(in srgb, var(--agentation-color-accent) 5%, transparent)}.ag-overlay-drag-selection{position:fixed;top:0;left:0;border:2px solid color-mix(in srgb, var(--agentation-color-green) 60%, transparent);border-radius:4px;background-color:color-mix(in srgb, var(--agentation-color-green) 8%, transparent);pointer-events:none;will-change:transform,width,height;contain:layout style}.ag-overlay-selected-element-highlight{position:fixed;top:0;left:0;border:2px solid color-mix(in srgb, var(--agentation-color-green) 50%, transparent);border-radius:4px;background:color-mix(in srgb, var(--agentation-color-green) 6%, transparent);pointer-events:none;will-change:transform,width,height;contain:layout style}.ag-layout{display:contents}.ag-layout :is(*,*::before,*::after){box-sizing:border-box}.ag-layout [hidden]{display:none}.ag-layout button{margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}.ag-layout svg[fill=none]{fill:none}.ag-layout-anchor{position:fixed;top:var(--agentation-toolbar-top, auto);right:var(--agentation-toolbar-right, 1.25rem);bottom:var(--agentation-toolbar-bottom, 1.25rem);left:var(--agentation-toolbar-left, auto);width:337px;height:44px;z-index:calc(var(--agentation-z-index, 100000) + 1);pointer-events:none}.ag-layout-palette{position:absolute;right:5px;bottom:calc(100% + .5rem);width:256px;padding:13px 0 16px;overflow:hidden;border:none;border-radius:1rem;background:#1c1c1c;box-shadow:0 1px 8px rgba(0,0,0,.25),0 0 0 1px rgba(0,0,0,.04);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;cursor:default;pointer-events:auto;opacity:0;filter:blur(5px)}.ag-layout-palette.is-enter{opacity:1;transform:translateY(0);filter:blur(0px);transition:opacity .2s ease,transform .2s ease,filter .2s ease}.ag-layout-palette.is-exit{opacity:0;transform:translateY(6px);filter:blur(5px);pointer-events:none;transition:opacity .1s ease,transform .1s ease,filter .1s ease}.ag-layout-item,.ag-layout-item-label,.ag-layout-palette-section-title,.ag-layout-footer{transition:background .25s ease,color .25s ease,border-color .25s ease}.ag-layout.is-light .ag-layout-palette{background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06),0 0 0 1px rgba(0,0,0,.04)}.ag-layout-palette-header{padding:0 1rem .375rem}.ag-layout-palette-title{color:#fff;font-size:.8125rem;font-weight:500;letter-spacing:-0.0094em}.ag-layout.is-light .ag-layout-palette-title{color:rgba(0,0,0,.85)}.ag-layout-palette-desc{margin-top:2px;color:hsla(0,0%,100%,.45);font-size:.6875rem;font-weight:300;line-height:14px}.ag-layout-palette-desc a{color:hsla(0,0%,100%,.8);text-decoration:underline dotted;text-decoration-color:hsla(0,0%,100%,.2);text-underline-offset:2px;transition:color .15s ease}.ag-layout-palette-desc a:hover{color:#fff}.ag-layout.is-light .ag-layout-palette-desc{color:rgba(0,0,0,.45)}.ag-layout.is-light .ag-layout-palette-desc a{color:rgba(0,0,0,.6);text-decoration-color:rgba(0,0,0,.2)}.ag-layout.is-light .ag-layout-palette-desc a:hover{color:rgba(0,0,0,.85)}.ag-layout-canvas-toggle{display:flex;width:calc(100% - 2rem);margin:.25rem 1rem .25rem;padding:.375rem .5rem;align-items:center;justify-content:center;gap:.375rem;border:1px dashed hsla(0,0%,100%,.1);border-radius:.5rem;background:rgba(0,0,0,0);transition:background .15s ease,border-color .15s ease}.ag-layout-canvas-toggle:hover{border-color:hsla(0,0%,100%,.15);background:hsla(0,0%,100%,.04)}.ag-layout-canvas-toggle.is-active{border-color:rgba(0,0,0,0);border-style:solid;background:#f97316;box-shadow:none}.ag-layout.is-light .ag-layout-canvas-toggle{border-color:rgba(0,0,0,.08)}.ag-layout.is-light .ag-layout-canvas-toggle:hover{border-color:rgba(0,0,0,.12);background:rgba(0,0,0,.02)}.ag-layout.is-light .ag-layout-canvas-toggle.is-active{border-color:rgba(0,0,0,0);border-style:solid;background:#f97316;box-shadow:none}.ag-layout-canvas-toggle-icon{display:flex;width:14px;height:14px;flex-shrink:0;align-items:center;justify-content:center;color:hsla(0,0%,100%,.35)}.ag-layout-canvas-toggle.is-active .ag-layout-canvas-toggle-icon{color:hsla(0,0%,100%,.85)}.ag-layout.is-light .ag-layout-canvas-toggle-icon{color:rgba(0,0,0,.25)}.ag-layout.is-light .ag-layout-canvas-toggle.is-active .ag-layout-canvas-toggle-icon{color:hsla(0,0%,100%,.85)}.ag-layout-canvas-toggle-label{color:hsla(0,0%,100%,.6);font-size:.8125rem;font-weight:400;letter-spacing:-0.0094em}.ag-layout-canvas-toggle.is-active .ag-layout-canvas-toggle-label{color:#fff}.ag-layout.is-light .ag-layout-canvas-toggle-label{color:rgba(0,0,0,.5)}.ag-layout.is-light .ag-layout-canvas-toggle.is-active .ag-layout-canvas-toggle-label{color:#fff}.ag-layout-purpose-wrap{display:grid;grid-template-rows:1fr;opacity:1;transition:grid-template-rows .2s ease,opacity .15s ease}.ag-layout-purpose-wrap.is-collapsed{grid-template-rows:0fr;opacity:0}.ag-layout-purpose-inner{overflow:hidden}.ag-layout-purpose-input{display:block;width:calc(100% - 2rem);margin:.25rem 1rem .375rem;padding:.375rem .5rem;border:1px solid hsla(0,0%,100%,.1);border-radius:.375rem;background:hsla(0,0%,100%,.03);color:hsla(0,0%,100%,.85);font-family:inherit;font-size:.8125rem;letter-spacing:-0.0094em;resize:none;outline:none;transition:border-color .15s ease}.ag-layout-purpose-input::placeholder{color:hsla(0,0%,100%,.3)}.ag-layout-purpose-input:focus{border-color:hsla(0,0%,100%,.3);background:hsla(0,0%,100%,.05)}.ag-layout.is-light .ag-layout-purpose-input{border-color:rgba(0,0,0,.1);background:rgba(0,0,0,.03);color:rgba(0,0,0,.7)}.ag-layout.is-light .ag-layout-purpose-input::placeholder{color:rgba(0,0,0,.3)}.ag-layout.is-light .ag-layout-purpose-input:focus{border-color:rgba(0,0,0,.25);background:rgba(0,0,0,.05)}.ag-layout-scroll{max-height:240px;padding-top:.25rem;overflow-x:hidden;overflow-y:auto}.ag-layout-scroll.is-fade-top{-webkit-mask-image:linear-gradient(to bottom, transparent 0, black 32px);mask-image:linear-gradient(to bottom, transparent 0, black 32px)}.ag-layout-scroll.is-fade-bottom{-webkit-mask-image:linear-gradient(to bottom, black calc(100% - 32px), transparent 100%);mask-image:linear-gradient(to bottom, black calc(100% - 32px), transparent 100%)}.ag-layout-scroll.is-fade-top.is-fade-bottom{-webkit-mask-image:linear-gradient(to bottom, transparent 0, black 32px, black calc(100% - 32px), transparent 100%);mask-image:linear-gradient(to bottom, transparent 0, black 32px, black calc(100% - 32px), transparent 100%)}.ag-layout-scroll::-webkit-scrollbar{width:3px}.ag-layout-scroll::-webkit-scrollbar-thumb{border-radius:2px;background:hsla(0,0%,100%,.12)}.ag-layout.is-light .ag-layout-scroll::-webkit-scrollbar-thumb{background:rgba(0,0,0,.1)}.ag-layout-palette-section{padding:0 1rem}.ag-layout-palette-section+.ag-layout-palette-section{margin-top:.5rem;padding-top:.5rem;border-top:1px solid hsla(0,0%,100%,.07)}.ag-layout.is-light .ag-layout-palette-section+.ag-layout-palette-section{border-top-color:rgba(0,0,0,.07)}.ag-layout-palette-section-title{padding:0 0 3px 3px;color:hsla(0,0%,100%,.5);font-size:.6875rem;font-weight:500;letter-spacing:-0.0094em}.ag-layout.is-light .ag-layout-palette-section-title{color:rgba(0,0,0,.4)}.ag-layout-item{display:flex;width:100%;min-height:24px;margin-bottom:1px;padding:.25rem .25rem;align-items:center;gap:.375rem;border:1px solid rgba(0,0,0,0);border-radius:.375rem;text-align:left;user-select:none}.ag-layout-item:hover{background:hsla(0,0%,100%,.1)}.ag-layout-item.is-active{border-color:rgba(0,0,0,0);background:#3c82f7}.ag-layout.is-wireframe .ag-layout-item.is-active{background:#f97316}.ag-layout.is-light .ag-layout-item:hover{background:rgba(0,0,0,.05)}.ag-layout.is-light .ag-layout-item.is-active{border-color:rgba(0,0,0,0);background:#3c82f7}.ag-layout.is-light.is-wireframe .ag-layout-item.is-active{background:#f97316}.ag-layout-item-icon{display:flex;width:20px;height:16px;flex-shrink:0;align-items:center;justify-content:center;overflow:hidden;border:1px dashed hsla(0,0%,100%,.15);border-radius:2px;background:hsla(0,0%,100%,.04);color:hsla(0,0%,100%,.45)}.ag-layout-item-icon svg{display:block;width:20px;height:16px}.ag-layout-item.is-active .ag-layout-item-icon{border-color:hsla(0,0%,100%,.3);background:hsla(0,0%,100%,.15);color:#fff}.ag-layout.is-light .ag-layout-item-icon{border-color:rgba(0,0,0,.12);background:rgba(0,0,0,.02);color:rgba(0,0,0,.4)}.ag-layout.is-light .ag-layout-item.is-active .ag-layout-item-icon{border-color:hsla(0,0%,100%,.3);background:hsla(0,0%,100%,.15);color:#fff}.ag-layout-item-label{min-width:0;color:hsla(0,0%,100%,.85);font-size:.8125rem;font-weight:500;line-height:1;letter-spacing:-0.0094em}.ag-layout-item.is-active .ag-layout-item-label{color:#fff;font-weight:600}.ag-layout.is-light .ag-layout-item-label{color:rgba(0,0,0,.7)}.ag-layout.is-light .ag-layout-item.is-active .ag-layout-item-label{color:#fff;font-weight:600}.ag-layout-footer-wrap{display:grid;grid-template-rows:1fr;transition:grid-template-rows .25s cubic-bezier(0.32, 0.72, 0, 1)}.ag-layout-footer-wrap.is-collapsed{grid-template-rows:0fr}.ag-layout-footer-inner{overflow:hidden}.ag-layout-footer-content{opacity:1;transform:translateY(0);transition:opacity .15s ease,transform .15s ease}.ag-layout-footer-wrap.is-collapsed .ag-layout-footer-content{opacity:0;transform:translateY(4px)}.ag-layout-footer{display:flex;min-height:24px;margin-top:.5rem;padding:.5rem 1rem 0;align-items:center;justify-content:space-between;border-top:1px solid hsla(0,0%,100%,.07)}.ag-layout.is-light .ag-layout-footer{border-top-color:rgba(0,0,0,.07)}.ag-layout-footer-count{color:hsla(0,0%,100%,.5);font-size:.8125rem;font-weight:400;letter-spacing:-0.0094em}.ag-layout-footer-clear{color:hsla(0,0%,100%,.5);font-family:inherit;font-size:.8125rem;font-weight:400;letter-spacing:-0.0094em;transition:color .15s ease}.ag-layout-footer-clear:hover{color:hsla(0,0%,100%,.7)}.ag-layout.is-light .ag-layout-footer-count{color:rgba(0,0,0,.5)}.ag-layout.is-light .ag-layout-footer-clear{color:rgba(0,0,0,.5)}.ag-layout.is-light .ag-layout-footer-clear:hover{color:rgba(0,0,0,.6)}.ag-layout-rolling-wrap{display:inline-block;position:relative;height:1.15em;overflow:hidden;vertical-align:bottom}.ag-layout-rolling-ghost{visibility:hidden}.ag-layout-rolling-num{position:absolute;top:0;left:0}.ag-layout-exit-up{animation:ag-layout-num-exit-up .25s cubic-bezier(0.32, 0.72, 0, 1) forwards}.ag-layout-enter-up{animation:ag-layout-num-enter-up .25s cubic-bezier(0.32, 0.72, 0, 1) forwards}.ag-layout-exit-down{animation:ag-layout-num-exit-down .25s cubic-bezier(0.32, 0.72, 0, 1) forwards}.ag-layout-enter-down{animation:ag-layout-num-enter-down .25s cubic-bezier(0.32, 0.72, 0, 1) forwards}@keyframes ag-layout-num-exit-up{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-110%)}}@keyframes ag-layout-num-enter-up{from{opacity:0;transform:translateY(110%)}to{opacity:1;transform:translateY(0)}}@keyframes ag-layout-num-exit-down{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(110%)}}@keyframes ag-layout-num-enter-down{from{opacity:0;transform:translateY(-110%)}to{opacity:1;transform:translateY(0)}}.ag-layout-overlay{position:fixed;inset:0;z-index:calc(var(--agentation-z-index, 100000) - 5);cursor:default;pointer-events:auto;animation:ag-layout-overlay-fade-in .15s ease;--agd-stroke: rgba(59, 130, 246, 0.35);--agd-fill: rgba(59, 130, 246, 0.06);--agd-bar: rgba(59, 130, 246, 0.18);--agd-bar-strong: rgba(59, 130, 246, 0.28);--agd-text-3: rgba(255, 255, 255, 0.6);--agd-surface: #141414}.ag-layout-overlay.is-placing{cursor:crosshair}.ag-layout-overlay.is-passthrough{pointer-events:none}.ag-layout.is-light .ag-layout-overlay{--agd-surface: #fff}.ag-layout.is-wireframe .ag-layout-overlay{--agd-stroke: rgba(249, 115, 22, 0.35);--agd-fill: rgba(249, 115, 22, 0.06);--agd-bar: rgba(249, 115, 22, 0.18);--agd-bar-strong: rgba(249, 115, 22, 0.28)}.ag-layout-overlay.is-exiting,.ag-layout-rearrange.is-exiting{opacity:0;pointer-events:none;transition:opacity .25s ease}.ag-layout-placement{position:absolute;border:1.5px dashed rgba(59,130,246,.4);border-radius:6px;background:rgba(59,130,246,.08);box-shadow:0 1px 4px rgba(0,0,0,.08);cursor:grab;user-select:none;pointer-events:auto;transition:box-shadow .15s,border-color .15s,opacity .15s ease,transform .15s ease;animation:ag-layout-placement-enter .25s cubic-bezier(0.34, 1.2, 0.64, 1)}.ag-layout-placement:active{cursor:grabbing}.ag-layout-placement:hover{border-color:rgba(59,130,246,.5);background:rgba(59,130,246,.1);box-shadow:0 2px 8px rgba(59,130,246,.12)}.ag-layout-placement.is-selected{border-style:solid;border-color:#3c82f7;background:rgba(59,130,246,.1);box-shadow:0 0 0 2px rgba(59,130,246,.15),0 2px 8px rgba(59,130,246,.15)}.ag-layout-placement.is-selected:hover{box-shadow:0 0 0 2px rgba(59,130,246,.15),0 2px 8px rgba(59,130,246,.15)}.ag-layout-placement.is-exiting{opacity:0;transform:scale(0.97);pointer-events:none;animation:none;transition:opacity .2s ease,transform .2s cubic-bezier(0.32, 0.72, 0, 1)}.ag-layout.is-wireframe .ag-layout-placement{border-color:rgba(249,115,22,.4);background:rgba(249,115,22,.08)}.ag-layout.is-wireframe .ag-layout-placement:hover{border-color:rgba(249,115,22,.5);background:rgba(249,115,22,.1);box-shadow:0 2px 8px rgba(249,115,22,.12)}.ag-layout.is-wireframe .ag-layout-placement.is-selected{border-color:#f97316;background:rgba(249,115,22,.1);box-shadow:0 0 0 2px rgba(249,115,22,.15),0 2px 8px rgba(249,115,22,.15)}.ag-layout.is-wireframe .ag-layout-placement.is-selected:hover{box-shadow:0 0 0 2px rgba(249,115,22,.15),0 2px 8px rgba(249,115,22,.15)}.ag-layout-placement-content{width:100%;height:100%;overflow:hidden;pointer-events:none}.ag-layout-placement-label{position:absolute;top:-18px;left:0;color:rgba(59,130,246,.7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:10px;font-weight:600;white-space:nowrap;text-shadow:0 0 4px hsla(0,0%,100%,.8),0 0 8px hsla(0,0%,100%,.5);pointer-events:none}.ag-layout-placement.is-selected .ag-layout-placement-label{color:#3c82f7}.ag-layout.is-wireframe .ag-layout-placement-label{color:rgba(249,115,22,.7)}.ag-layout.is-wireframe .ag-layout-placement.is-selected .ag-layout-placement-label{color:#f97316}.ag-layout-placement-note,.ag-layout-section-note{position:absolute;right:0;bottom:-18px;left:0;overflow:hidden;opacity:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:10px;font-weight:450;white-space:nowrap;text-overflow:ellipsis;text-shadow:0 0 4px hsla(0,0%,100%,.9),0 0 8px hsla(0,0%,100%,.6);transform:translateY(-2px);pointer-events:none;transition:opacity .2s ease,transform .2s ease}.ag-layout-placement-note.is-visible,.ag-layout-section-note.is-visible{opacity:1;transform:translateY(0)}.ag-layout-placement-note{color:rgba(0,0,0,.5)}.ag-layout-section-note{color:rgba(59,130,246,.6)}.ag-layout-handle{position:absolute;width:8px;height:8px;z-index:12;border:1.5px solid #3c82f7;border-radius:2px;background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.1),0 1px 2px rgba(0,0,0,.12);opacity:0;transform:scale(0.3);pointer-events:none;will-change:opacity,transform;transition:opacity .2s ease-out,transform .25s cubic-bezier(0.34, 1.56, 0.64, 1)}.ag-layout-placement:hover .ag-layout-handle,.ag-layout-placement:active .ag-layout-handle,.ag-layout-placement.is-selected .ag-layout-handle,.ag-layout-section-outline:hover .ag-layout-handle,.ag-layout-section-outline:active .ag-layout-handle,.ag-layout-section-outline.is-selected .ag-layout-handle{opacity:1;transform:scale(1);pointer-events:auto}.ag-layout.is-wireframe .ag-layout-handle{border-color:#f97316}.ag-layout-handle-nw{top:-4px;left:-4px;cursor:nw-resize}.ag-layout-handle-ne{top:-4px;right:-4px;cursor:ne-resize}.ag-layout-handle-se{right:-4px;bottom:-4px;cursor:se-resize}.ag-layout-handle-sw{bottom:-4px;left:-4px;cursor:sw-resize}.ag-layout-handle-n,.ag-layout-handle-e,.ag-layout-handle-s,.ag-layout-handle-w{opacity:0;pointer-events:none}.ag-layout-section-outline .ag-layout-handle-n{top:-4px;left:calc(50% - 4px);cursor:n-resize}.ag-layout-section-outline .ag-layout-handle-e{top:calc(50% - 4px);right:-4px;cursor:e-resize}.ag-layout-section-outline .ag-layout-handle-s{bottom:-4px;left:calc(50% - 4px);cursor:s-resize}.ag-layout-section-outline .ag-layout-handle-w{top:calc(50% - 4px);left:-4px;cursor:w-resize}.ag-layout-edge{display:flex;position:absolute;z-index:11;align-items:center;justify-content:center;color:#3c82f7}.ag-layout-edge::after{position:absolute;border-radius:4px;background:currentcolor;content:"";opacity:0;transform:scale(0.8);transition:opacity .1s ease,transform .1s ease}.ag-layout-edge:hover::after{opacity:.85;transform:scale(1)}.ag-layout-edge svg{position:relative;z-index:1;opacity:0;filter:drop-shadow(0 0 2px var(--agd-surface));transition:opacity .1s ease}.ag-layout-edge:hover svg{opacity:1}.ag-layout.is-wireframe .ag-layout-edge{color:#f97316}.ag-layout-edge-n,.ag-layout-edge-s{right:12px;left:12px;height:12px;cursor:n-resize}.ag-layout-edge-n::after,.ag-layout-edge-s::after{width:24px;height:4px}.ag-layout-edge-n{top:-6px}.ag-layout-edge-s{bottom:-6px;cursor:s-resize}.ag-layout-edge-e,.ag-layout-edge-w{top:12px;bottom:12px;width:12px;cursor:e-resize}.ag-layout-edge-e::after,.ag-layout-edge-w::after{width:4px;height:24px}.ag-layout-edge-e{right:-6px}.ag-layout-edge-w{left:-6px;cursor:w-resize}.ag-layout-delete{display:flex;position:absolute;top:-8px;right:-8px;width:18px;height:18px;z-index:15;align-items:center;justify-content:center;border:1px solid rgba(0,0,0,.08);border-radius:50%;background:hsla(0,0%,100%,.9);backdrop-filter:blur(8px);box-shadow:0 1px 3px rgba(0,0,0,.1);color:rgba(0,0,0,.35);font-size:10px;line-height:1;opacity:0;transform:scale(0.8);pointer-events:none;will-change:opacity,transform;transition:opacity .2s ease-out,transform .2s cubic-bezier(0.34, 1.56, 0.64, 1),background .12s ease,color .12s ease,border-color .12s ease,box-shadow .12s ease}.ag-layout-delete:hover{border-color:#ef4444;background:#ef4444;box-shadow:0 1px 4px rgba(239,68,68,.3);color:#fff;transform:scale(1.1)}.ag-layout-placement:hover .ag-layout-delete,.ag-layout-placement.is-selected .ag-layout-delete,.ag-layout-section-outline:hover .ag-layout-delete,.ag-layout-section-outline.is-selected .ag-layout-delete{opacity:1;transform:scale(1);pointer-events:auto}.ag-layout:not(.is-light) .ag-layout-delete{border-color:hsla(0,0%,100%,.1);background:rgba(40,40,40,.9);box-shadow:0 1px 3px rgba(0,0,0,.25);color:hsla(0,0%,100%,.5)}.ag-layout:not(.is-light) .ag-layout-delete:hover{border-color:#ef4444;background:#ef4444;color:#fff}.ag-layout-draw-box{position:fixed;z-index:calc(var(--agentation-z-index, 100000) - 4);border:2px solid #3c82f7;border-radius:6px;background:rgba(59,130,246,.15);pointer-events:none}.ag-layout-select-box{position:fixed;z-index:calc(var(--agentation-z-index, 100000) - 4);border:1px dashed #3c82f7;border-radius:2px;background:rgba(59,130,246,.08);pointer-events:none}.ag-layout-size-indicator{position:fixed;z-index:calc(var(--agentation-z-index, 100000) + 1);padding:2px 6px;border-radius:4px;background:#3c82f7;box-shadow:0 2px 6px rgba(0,0,0,.2);color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:10px;font-weight:500;white-space:nowrap;pointer-events:none}.ag-layout-guides{display:contents}.ag-layout-guide{position:fixed;z-index:calc(var(--agentation-z-index, 100000) + 1);background:#f0f;opacity:.5;pointer-events:none}.ag-layout-guide.is-x{width:1px;height:100vh}.ag-layout-guide.is-y{width:100vw;height:1px}.ag-layout-drag-preview{display:flex;position:fixed;z-index:calc(var(--agentation-z-index, 100000) + 2);align-items:center;justify-content:center;border:1.5px dashed #3c82f7;border-radius:6px;background:rgba(59,130,246,.1);backdrop-filter:blur(8px);box-shadow:0 4px 16px rgba(59,130,246,.15);color:#3c82f7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:9px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;pointer-events:none;transition:width .08s ease,height .08s ease,opacity .08s ease}.ag-layout-drag-preview.is-wireframe{border-color:#f97316;background:rgba(249,115,22,.1);box-shadow:0 4px 16px rgba(249,115,22,.15);color:#f97316}.ag-layout-rearrange{position:fixed;inset:0;z-index:calc(var(--agentation-z-index, 100000) - 5);cursor:default;user-select:none;pointer-events:none;animation:ag-layout-overlay-fade-in .15s ease}.ag-layout-hover-highlight{position:fixed;z-index:calc(var(--agentation-z-index, 100000) - 6);border:2px dashed rgba(59,130,246,.5);border-radius:4px;background:rgba(59,130,246,.06);pointer-events:none;animation:ag-layout-highlight-fade-in .12s ease}.ag-layout-section-outline{position:fixed;border:2px solid rgba(59,130,246,.5);border-radius:4px;background-color:rgba(59,130,246,.08);cursor:grab;user-select:none;pointer-events:auto;transition:box-shadow .15s,border-color .3s,background-color .3s,border-style 0s;animation:ag-layout-section-enter .2s ease}.ag-layout-section-outline:active{cursor:grabbing}.ag-layout-section-outline:hover{box-shadow:0 0 0 1px hsla(0,0%,100%,.1),0 4px 12px rgba(0,0,0,.15)}.ag-layout-section-outline.is-selected{border-style:solid;box-shadow:0 0 0 2px rgba(59,130,246,.15),0 2px 8px rgba(59,130,246,.15)}.ag-layout-section-outline.is-selected:hover{box-shadow:0 0 0 2px rgba(59,130,246,.15),0 2px 8px rgba(59,130,246,.15)}.ag-layout-section-outline.is-ghost{border:1.5px dashed rgba(59,130,246,.4);background:rgba(59,130,246,.04);opacity:.5;transition:box-shadow .15s,border-color .3s,opacity .25s;animation:ag-layout-ghost-enter .25s ease}.ag-layout-section-outline.is-ghost:hover{opacity:.7;box-shadow:0 0 0 1px rgba(59,130,246,.1),0 4px 12px rgba(0,0,0,.08)}.ag-layout-section-outline.is-ghost.is-selected{border-width:2px;border-style:solid;border-color:#3c82f7;background:rgba(59,130,246,.08);opacity:1;box-shadow:0 0 0 2px rgba(59,130,246,.15),0 2px 8px rgba(59,130,246,.15)}.ag-layout-section-outline.is-pending{opacity:0;animation:none;transition:none}.ag-layout-section-outline.is-exiting{opacity:0;transform:scale(0.97);pointer-events:none;animation:none;transition:opacity .2s ease,transform .2s cubic-bezier(0.32, 0.72, 0, 1)}.ag-layout-section-label{position:absolute;top:4px;left:4px;max-width:calc(100% - 8px);padding:2px 8px;overflow:hidden;border-radius:4px;background-color:#3b82f6;box-shadow:0 1px 4px rgba(0,0,0,.2);color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:10px;font-weight:600;white-space:nowrap;text-overflow:ellipsis;pointer-events:none}.ag-layout-section-dimensions{position:absolute;right:4px;bottom:4px;padding:1px 5px;border-radius:3px;background:rgba(0,0,0,.5);color:hsla(0,0%,100%,.7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:9px;font-weight:500;white-space:nowrap;pointer-events:none}.ag-layout.is-light .ag-layout-section-dimensions{background:hsla(0,0%,100%,.7);color:rgba(0,0,0,.5)}.ag-layout-ghost-badge{position:absolute;bottom:calc(100% + 4px);left:-1px;padding:1px 5px;border:1px solid rgba(59,130,246,.2);border-radius:3px;background:rgba(59,130,246,.08);color:rgba(59,130,246,.9);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:9px;font-weight:600;line-height:1.2;letter-spacing:.02em;white-space:nowrap;pointer-events:none;animation:ag-layout-badge-slide-in .2s ease both}.ag-layout-ghost-badge-extra{display:inline;animation:ag-layout-badge-extra-in .2s ease both}.ag-layout-connectors{position:fixed;inset:0;width:100vw;height:100vh;z-index:calc(var(--agentation-z-index, 100000) - 4);pointer-events:none}.ag-layout-connector-line{transition:opacity .2s ease;animation:ag-layout-connector-draw .3s ease both}.ag-layout-connector-dot{transform-box:fill-box;transform-origin:center;animation:ag-layout-connector-dot-in .25s cubic-bezier(0.34, 1.56, 0.64, 1) .15s both}.ag-layout-connectors.is-exiting,.ag-layout-connector-exiting{animation:ag-layout-connector-out .2s ease forwards}.ag-layout-connectors.is-exiting .ag-layout-connector-dot,.ag-layout-connector-exiting .ag-layout-connector-dot{animation:ag-layout-connector-dot-out .2s ease forwards}@keyframes ag-layout-editor-enter{from{opacity:0;transform:translateX(-50%) scale(0.95) translateY(4px)}to{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}}@keyframes ag-layout-editor-exit{from{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}to{opacity:0;transform:translateX(-50%) scale(0.95) translateY(4px)}}.ag-layout-editor{position:fixed;width:280px;padding:.75rem 1rem 14px;z-index:calc(var(--agentation-z-index, 100000) + 1);border-radius:16px;background:#1a1a1a;box-shadow:0 4px 24px rgba(0,0,0,.3),0 0 0 1px hsla(0,0%,100%,.08);font-family:var(--agentation-font);opacity:0;transform:translateX(-50%);pointer-events:auto;will-change:transform,opacity;--ag-layout-editor-accent: #3c82f7}.ag-layout-editor.is-enter{animation:ag-layout-editor-enter .2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards}.ag-layout-editor.is-exit{animation:ag-layout-editor-exit .15s ease-in forwards}.ag-layout.is-wireframe .ag-layout-editor{--ag-layout-editor-accent: #f97316}.ag-layout-editor-header{display:flex;margin-bottom:.5625rem;align-items:center;justify-content:space-between}.ag-layout-editor-element{flex:1;max-width:100%;overflow:hidden;color:hsla(0,0%,100%,.5);font-size:.75rem;font-weight:400;white-space:nowrap;text-overflow:ellipsis}.ag-layout-editor-textarea{width:100%;padding:.5rem .625rem;border:1px solid hsla(0,0%,100%,.15);border-radius:8px;background:hsla(0,0%,100%,.05);color:#fff;font-family:inherit;font-size:.8125rem;resize:none;outline:none;transition:border-color .15s ease}.ag-layout-editor-textarea:focus{border-color:var(--ag-layout-editor-accent)}.ag-layout-editor-textarea::placeholder{color:hsla(0,0%,100%,.35)}.ag-layout-editor-actions{display:flex;margin-top:.5rem;justify-content:flex-end;gap:.375rem}.ag-layout-editor-cancel,.ag-layout-editor-submit{padding:.4rem .875rem;border-radius:1rem;font-size:.75rem;font-weight:500;transition:background-color .15s ease,color .15s ease,opacity .15s ease}.ag-layout-editor-cancel{background:rgba(0,0,0,0);color:hsla(0,0%,100%,.5)}.ag-layout-editor-cancel:hover{background:hsla(0,0%,100%,.1);color:hsla(0,0%,100%,.8)}.ag-layout-editor-submit{background:var(--ag-layout-editor-accent);color:#fff}.ag-layout-editor-submit:hover{filter:brightness(0.9)}.ag-layout-editor-delete-wrapper{margin-right:auto}.ag-layout-editor-delete{display:flex;width:28px;height:28px;align-items:center;justify-content:center;border-radius:50%;background:rgba(0,0,0,0);color:hsla(0,0%,100%,.4);transition:background-color .15s ease,color .15s ease,transform .1s ease}.ag-layout-editor-delete:hover{background-color:color-mix(in srgb, var(--agentation-color-red) 25%, transparent);color:var(--agentation-color-red)}.ag-layout-editor-delete:active{transform:scale(0.92)}.ag-layout.is-light .ag-layout-editor{background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.06)}.ag-layout.is-light .ag-layout-editor .ag-layout-editor-element{color:rgba(0,0,0,.6)}.ag-layout.is-light .ag-layout-editor .ag-layout-editor-textarea{border-color:rgba(0,0,0,.12);background:rgba(0,0,0,.03);color:#1a1a1a}.ag-layout.is-light .ag-layout-editor .ag-layout-editor-textarea::placeholder{color:rgba(0,0,0,.4)}.ag-layout.is-light .ag-layout-editor .ag-layout-editor-cancel{color:rgba(0,0,0,.5)}.ag-layout.is-light .ag-layout-editor .ag-layout-editor-cancel:hover{background:rgba(0,0,0,.06);color:rgba(0,0,0,.75)}.ag-layout.is-light .ag-layout-editor .ag-layout-editor-delete{color:rgba(0,0,0,.4)}@keyframes ag-layout-placement-enter{from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:scale(1)}}@keyframes ag-layout-section-enter{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}@keyframes ag-layout-ghost-enter{from{opacity:0;transform:scale(0.96)}to{opacity:.6;transform:scale(1)}}@keyframes ag-layout-highlight-fade-in{from{opacity:0}to{opacity:1}}@keyframes ag-layout-overlay-fade-in{from{opacity:0}to{opacity:1}}@keyframes ag-layout-badge-slide-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}@keyframes ag-layout-badge-extra-in{from{opacity:0}to{opacity:1}}@keyframes ag-layout-connector-draw{from{opacity:0}to{opacity:1}}@keyframes ag-layout-connector-dot-in{from{opacity:0;transform:scale(0)}to{opacity:1;transform:scale(1)}}@keyframes ag-layout-connector-out{from{opacity:1}to{opacity:0}}@keyframes ag-layout-connector-dot-out{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(0)}}';

// src/browser/layout/geometry.ts
var HANDLE_DIRECTIONS = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w"
];
var MIN_SIZE = 24;
var SNAP_THRESHOLD = 5;
function computeSnap(rect, targets, activeEdges) {
  let bestDx = Infinity;
  let bestDy = Infinity;
  const mL = rect.x, mR = rect.x + rect.width, mCx = rect.x + rect.width / 2;
  const mT = rect.y, mB = rect.y + rect.height, mCy = rect.y + rect.height / 2;
  const checkAll = !activeEdges;
  const xFroms = checkAll ? [mL, mR, mCx] : [
    ...activeEdges.left ? [mL] : [],
    ...activeEdges.right ? [mR] : []
  ];
  const yFroms = checkAll ? [mT, mB, mCy] : [
    ...activeEdges.top ? [mT] : [],
    ...activeEdges.bottom ? [mB] : []
  ];
  for (const o of targets) {
    const oL = o.x, oR = o.x + o.width, oCx = o.x + o.width / 2;
    const oT = o.y, oB = o.y + o.height, oCy = o.y + o.height / 2;
    for (const from of xFroms) {
      for (const to of [oL, oR, oCx]) {
        const d = to - from;
        if (Math.abs(d) < SNAP_THRESHOLD && Math.abs(d) < Math.abs(bestDx)) bestDx = d;
      }
    }
    for (const from of yFroms) {
      for (const to of [oT, oB, oCy]) {
        const d = to - from;
        if (Math.abs(d) < SNAP_THRESHOLD && Math.abs(d) < Math.abs(bestDy)) bestDy = d;
      }
    }
  }
  const dx = Math.abs(bestDx) < SNAP_THRESHOLD ? bestDx : 0;
  const dy = Math.abs(bestDy) < SNAP_THRESHOLD ? bestDy : 0;
  const guides = [];
  const seen = /* @__PURE__ */ new Set();
  const sL = mL + dx, sR = mR + dx, sCx = mCx + dx;
  const sT = mT + dy, sB = mB + dy, sCy = mCy + dy;
  for (const o of targets) {
    const oL = o.x, oR = o.x + o.width, oCx = o.x + o.width / 2;
    const oT = o.y, oB = o.y + o.height, oCy = o.y + o.height / 2;
    for (const xPos of [oL, oCx, oR]) {
      for (const sx of [sL, sCx, sR]) {
        if (Math.abs(sx - xPos) < 0.5) {
          const key = `x:${Math.round(xPos)}`;
          if (!seen.has(key)) {
            seen.add(key);
            guides.push({ axis: "x", pos: xPos });
          }
        }
      }
    }
    for (const yPos of [oT, oCy, oB]) {
      for (const sy of [sT, sCy, sB]) {
        if (Math.abs(sy - yPos) < 0.5) {
          const key = `y:${Math.round(yPos)}`;
          if (!seen.has(key)) {
            seen.add(key);
            guides.push({ axis: "y", pos: yPos });
          }
        }
      }
    }
  }
  return { dx, dy, guides };
}
function edgesForHandle(dir) {
  return {
    left: dir.includes("w"),
    right: dir.includes("e"),
    top: dir.includes("n"),
    bottom: dir.includes("s")
  };
}
function resizeRect(start, dir, dx, dy) {
  let nx = start.x, ny = start.y, nw = start.width, nh = start.height;
  if (dir.includes("e")) nw = Math.max(MIN_SIZE, start.width + dx);
  if (dir.includes("w")) {
    nw = Math.max(MIN_SIZE, start.width - dx);
    nx = start.x + start.width - nw;
  }
  if (dir.includes("s")) nh = Math.max(MIN_SIZE, start.height + dy);
  if (dir.includes("n")) {
    nh = Math.max(MIN_SIZE, start.height - dy);
    ny = start.y + start.height - nh;
  }
  return { x: nx, y: ny, width: nw, height: nh };
}
function constrainAspectRatio(resized, start, dir, aspectRatio) {
  let { x: nx, y: ny, width: nw, height: nh } = resized;
  const isCorner = dir.length === 2;
  if (isCorner) {
    const wDelta = Math.abs(nw - start.width);
    const hDelta = Math.abs(nh - start.height);
    if (wDelta > hDelta) {
      nh = nw / aspectRatio;
    } else {
      nw = nh * aspectRatio;
    }
    if (dir.includes("w")) nx = start.x + start.width - nw;
    if (dir.includes("n")) ny = start.y + start.height - nh;
  } else {
    if (dir === "e" || dir === "w") {
      nh = nw / aspectRatio;
    } else {
      nw = nh * aspectRatio;
    }
    if (dir === "w") nx = start.x + start.width - nw;
    if (dir === "n") ny = start.y + start.height - nh;
  }
  return { x: nx, y: ny, width: nw, height: nh };
}
function applyResizeSnap(rect, snap, activeEdges) {
  let { x: nx, y: ny, width: nw, height: nh } = rect;
  if (snap.dx !== 0) {
    if (activeEdges.right) nw += snap.dx;
    else if (activeEdges.left) {
      nx += snap.dx;
      nw -= snap.dx;
    }
  }
  if (snap.dy !== 0) {
    if (activeEdges.bottom) nh += snap.dy;
    else if (activeEdges.top) {
      ny += snap.dy;
      nh -= snap.dy;
    }
  }
  return { x: nx, y: ny, width: nw, height: nh };
}
function clampToOrigin(box2) {
  return {
    x: Math.max(0, box2.x),
    y: Math.max(0, box2.y),
    width: box2.width,
    height: box2.height
  };
}

// src/browser/layout/skeletons.ts
var UNITLESS = {
  flex: true,
  flexGrow: true,
  flexShrink: true,
  fontWeight: true,
  lineHeight: true,
  opacity: true,
  order: true,
  zIndex: true
};
function applyStyle(node, style) {
  const target = node.style;
  for (const [property, value] of Object.entries(style)) {
    target[property] = typeof value === "number" && !UNITLESS[property] ? `${value}px` : String(value);
  }
}
function box(environment, style, ...children) {
  const node = environment.createElement("div");
  applyStyle(node, style);
  for (const child of children) if (child) node.appendChild(child);
  return node;
}
function label(environment, style, text) {
  const node = environment.createElement("span");
  applyStyle(node, style);
  node.textContent = text;
  return node;
}
function svg(environment, attributes, ...children) {
  const node = environment.createSvg("svg", attributes);
  for (const child of children) node.appendChild(child);
  return node;
}
function bar(environment, w, h = 3, strong) {
  return box(environment, {
    width: typeof w === "number" ? `${w}px` : w,
    height: h,
    borderRadius: 2,
    background: strong ? "var(--agd-bar-strong)" : "var(--agd-bar)",
    flexShrink: 0
  });
}
function block(environment, w, h, radius = 3, style) {
  return box(environment, {
    width: typeof w === "number" ? `${w}px` : w,
    height: typeof h === "number" ? `${h}px` : h,
    borderRadius: radius,
    border: "1px dashed var(--agd-stroke)",
    background: "var(--agd-fill)",
    flexShrink: 0,
    ...style
  });
}
function circle(environment, size) {
  return box(environment, {
    width: size,
    height: size,
    borderRadius: "50%",
    border: "1px dashed var(--agd-stroke)",
    background: "var(--agd-fill)",
    flexShrink: 0
  });
}
var navigationSkeleton = (e, { width, height }) => {
  const pad = Math.max(8, height * 0.2);
  return box(
    e,
    { display: "flex", alignItems: "center", height: "100%", padding: `0 ${pad}px`, gap: width * 0.02 },
    block(e, Math.max(20, height * 0.5), Math.max(12, height * 0.4), 2),
    box(
      e,
      { flex: 1, display: "flex", gap: width * 0.03, marginLeft: width * 0.04 },
      bar(e, width * 0.06),
      bar(e, width * 0.07),
      bar(e, width * 0.05),
      bar(e, width * 0.06)
    ),
    block(e, width * 0.1, Math.min(28, height * 0.5), 4)
  );
};
var heroSkeleton = (e, { width, height, text }) => box(
  e,
  {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: height * 0.05
  },
  text ? label(
    e,
    {
      fontSize: Math.min(20, height * 0.08),
      fontWeight: 600,
      color: "var(--agd-text-3)",
      textAlign: "center",
      maxWidth: "80%"
    },
    text
  ) : bar(e, width * 0.5, Math.max(6, height * 0.04), true),
  bar(e, width * 0.6),
  bar(e, width * 0.4),
  block(e, Math.min(140, width * 0.2), Math.min(36, height * 0.12), 6, {
    marginTop: height * 0.06
  })
);
var sidebarSkeleton = (e, { width, height }) => {
  const items = Math.max(3, Math.floor(height / 36));
  const root = box(e, {
    padding: width * 0.08,
    display: "flex",
    flexDirection: "column",
    gap: height * 0.03
  });
  root.appendChild(bar(e, width * 0.6, 4, true));
  for (let i = 0; i < items; i++) {
    root.appendChild(
      box(
        e,
        { display: "flex", alignItems: "center", gap: 6 },
        block(e, 10, 10, 2),
        bar(e, width * (0.4 + i * 17 % 30 / 100))
      )
    );
  }
  return root;
};
var footerSkeleton = (e, { width, height }) => {
  const cols = Math.max(2, Math.min(4, Math.floor(width / 160)));
  const root = box(e, {
    display: "flex",
    padding: `${height * 0.12}px ${width * 0.03}px`,
    gap: width * 0.05
  });
  for (let i = 0; i < cols; i++) {
    root.appendChild(
      box(
        e,
        { flex: 1, display: "flex", flexDirection: "column", gap: 4 },
        bar(e, "60%", 3, true),
        bar(e, "80%", 2),
        bar(e, "70%", 2),
        bar(e, "60%", 2)
      )
    );
  }
  return root;
};
var modalSkeleton = (e, { width }) => box(
  e,
  { height: "100%", display: "flex", flexDirection: "column" },
  box(
    e,
    {
      padding: "10px 12px",
      borderBottom: "1px solid var(--agd-stroke)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    },
    bar(e, width * 0.3, 4, true),
    box(e, { width: 14, height: 14, border: "1px solid var(--agd-stroke)", borderRadius: 3 })
  ),
  box(
    e,
    { flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 6 },
    bar(e, "90%"),
    bar(e, "70%"),
    bar(e, "80%")
  ),
  box(
    e,
    {
      padding: "10px 12px",
      borderTop: "1px solid var(--agd-stroke)",
      display: "flex",
      justifyContent: "flex-end",
      gap: 8
    },
    block(e, 70, 26, 4),
    block(e, 70, 26, 4, { background: "var(--agd-bar)" })
  )
);
var cardSkeleton = (e) => box(
  e,
  { height: "100%", display: "flex", flexDirection: "column" },
  box(e, {
    height: "40%",
    background: "var(--agd-fill)",
    borderBottom: "1px dashed var(--agd-stroke)"
  }),
  box(
    e,
    { flex: 1, padding: 10, display: "flex", flexDirection: "column", gap: 5 },
    bar(e, "70%", 4, true),
    bar(e, "95%", 2),
    bar(e, "85%", 2),
    bar(e, "50%", 2)
  )
);
var textSkeleton = (e, { width, height, text }) => {
  if (text) {
    const node = box(e, {
      padding: 4,
      fontSize: Math.min(14, height * 0.3),
      lineHeight: 1.5,
      color: "var(--agd-text-3)",
      wordBreak: "break-word",
      overflow: "hidden"
    });
    node.textContent = text;
    return node;
  }
  const lines = Math.max(2, Math.floor(height / 18));
  const root = box(e, { display: "flex", flexDirection: "column", gap: 6, padding: 4 });
  root.appendChild(bar(e, width * 0.6, 5, true));
  for (let i = 0; i < lines; i++) {
    root.appendChild(bar(e, `${70 + i * 13 % 25}%`, 2));
  }
  return root;
};
var imageSkeleton = (e, { width, height }) => box(
  e,
  { height: "100%", position: "relative" },
  svg(
    e,
    {
      width: "100%",
      height: "100%",
      viewBox: `0 0 ${width} ${height}`,
      preserveAspectRatio: "none",
      fill: "none"
    },
    e.createSvg("line", {
      x1: "0",
      y1: "0",
      x2: String(width),
      y2: String(height),
      stroke: "var(--agd-stroke)",
      "stroke-width": "1"
    }),
    e.createSvg("line", {
      x1: String(width),
      y1: "0",
      x2: "0",
      y2: String(height),
      stroke: "var(--agd-stroke)",
      "stroke-width": "1"
    }),
    e.createSvg("circle", {
      cx: String(width * 0.3),
      cy: String(height * 0.3),
      r: String(Math.min(width, height) * 0.08),
      fill: "var(--agd-fill)",
      stroke: "var(--agd-stroke)",
      "stroke-width": "0.8"
    })
  )
);
var tableSkeleton = (e, { width, height }) => {
  const cols = Math.max(2, Math.min(5, Math.floor(width / 100)));
  const rows = Math.max(2, Math.min(6, Math.floor(height / 32)));
  const root = box(e, { height: "100%", display: "flex", flexDirection: "column" });
  const head = box(e, {
    display: "flex",
    borderBottom: "1px solid var(--agd-stroke)",
    padding: "6px 0"
  });
  for (let i = 0; i < cols; i++) {
    head.appendChild(box(e, { flex: 1, padding: "0 8px" }, bar(e, "70%", 3, true)));
  }
  root.appendChild(head);
  for (let r = 0; r < rows; r++) {
    const row = box(e, {
      display: "flex",
      borderBottom: "1px solid rgba(255,255,255,0.03)",
      padding: "6px 0"
    });
    for (let c = 0; c < cols; c++) {
      row.appendChild(
        box(e, { flex: 1, padding: "0 8px" }, bar(e, `${50 + (r * 7 + c * 13) % 40}%`, 2))
      );
    }
    root.appendChild(row);
  }
  return root;
};
var listSkeleton = (e, { height }) => {
  const items = Math.max(2, Math.floor(height / 28));
  const root = box(e, { display: "flex", flexDirection: "column", gap: 4, padding: 4 });
  for (let i = 0; i < items; i++) {
    root.appendChild(
      box(
        e,
        { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" },
        circle(e, 8),
        bar(e, `${55 + i * 17 % 35}%`, 2)
      )
    );
  }
  return root;
};
var buttonSkeleton = (e, { width, height, text }) => box(
  e,
  {
    height: "100%",
    borderRadius: Math.min(8, height / 3),
    border: "1px solid var(--agd-stroke)",
    background: "var(--agd-fill)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  text ? label(
    e,
    {
      fontSize: Math.min(13, height * 0.4),
      fontWeight: 500,
      color: "var(--agd-text-3)",
      letterSpacing: "-0.01em"
    },
    text
  ) : bar(e, Math.max(20, width * 0.5), 3, true)
);
var inputSkeleton = (e, { width, height }) => box(
  e,
  { display: "flex", flexDirection: "column", gap: 4, height: "100%", justifyContent: "center" },
  bar(e, Math.min(80, width * 0.3), 2),
  box(
    e,
    {
      height: Math.min(36, height * 0.6),
      borderRadius: 4,
      border: "1px dashed var(--agd-stroke)",
      background: "var(--agd-fill)",
      display: "flex",
      alignItems: "center",
      paddingLeft: 8
    },
    bar(e, "40%", 2)
  )
);
var formSkeleton = (e, { width, height }) => {
  const fields = Math.max(2, Math.min(5, Math.floor(height / 56)));
  const root = box(e, {
    display: "flex",
    flexDirection: "column",
    gap: height * 0.04,
    padding: 8
  });
  for (let i = 0; i < fields; i++) {
    root.appendChild(
      box(
        e,
        { display: "flex", flexDirection: "column", gap: 4 },
        bar(e, 60 + i * 17 % 30, 2),
        block(e, "100%", 28, 4)
      )
    );
  }
  root.appendChild(
    block(e, Math.min(120, width * 0.35), 30, 6, {
      marginTop: 8,
      alignSelf: "flex-end",
      background: "var(--agd-bar)"
    })
  );
  return root;
};
var tabsSkeleton = (e, { width }) => {
  const tabCount = Math.max(2, Math.min(4, Math.floor(width / 120)));
  const strip = box(e, {
    display: "flex",
    gap: 2,
    borderBottom: "1px solid var(--agd-stroke)"
  });
  for (let i = 0; i < tabCount; i++) {
    strip.appendChild(
      box(
        e,
        {
          padding: "8px 12px",
          borderBottom: i === 0 ? "2px solid var(--agd-bar-strong)" : "none"
        },
        bar(e, 60, 3, i === 0)
      )
    );
  }
  return box(
    e,
    { height: "100%", display: "flex", flexDirection: "column" },
    strip,
    box(
      e,
      { flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 6 },
      bar(e, "80%", 2),
      bar(e, "65%", 2),
      bar(e, "75%", 2)
    )
  );
};
var avatarSkeleton = (e, { width, height }) => {
  const r = Math.min(width, height) / 2;
  return svg(
    e,
    { width: "100%", height: "100%", viewBox: `0 0 ${width} ${height}`, fill: "none" },
    e.createSvg("circle", {
      cx: String(width / 2),
      cy: String(height / 2),
      r: String(r - 1),
      stroke: "var(--agd-stroke)",
      fill: "var(--agd-fill)",
      "stroke-width": "1.5",
      "stroke-dasharray": "3 2"
    }),
    e.createSvg("circle", {
      cx: String(width / 2),
      cy: String(height * 0.38),
      r: String(r * 0.28),
      stroke: "var(--agd-stroke)",
      fill: "var(--agd-fill)",
      "stroke-width": "0.8"
    }),
    e.createSvg("path", {
      d: `M${width / 2 - r * 0.55} ${height * 0.78} C${width / 2 - r * 0.55} ${height * 0.55} ${width / 2 + r * 0.55} ${height * 0.55} ${width / 2 + r * 0.55} ${height * 0.78}`,
      stroke: "var(--agd-stroke)",
      fill: "var(--agd-fill)",
      "stroke-width": "0.8"
    })
  );
};
var badgeSkeleton = (e, { width, height }) => box(
  e,
  {
    height: "100%",
    borderRadius: height / 2,
    border: "1px solid var(--agd-stroke)",
    background: "var(--agd-fill)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  bar(e, Math.max(16, width * 0.5), 2, true)
);
var headerSkeleton = (e, { width, height }) => box(
  e,
  {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: height * 0.08
  },
  bar(e, width * 0.5, Math.max(5, height * 0.06), true),
  bar(e, width * 0.35)
);
var sectionSkeleton = (e, { width, height }) => box(
  e,
  {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    gap: height * 0.04,
    padding: width * 0.04
  },
  bar(e, width * 0.3, 4, true),
  bar(e, width * 0.7),
  bar(e, width * 0.5),
  box(
    e,
    { flex: 1, display: "flex", gap: width * 0.03, marginTop: height * 0.06 },
    block(e, "33%", "100%", 4),
    block(e, "33%", "100%", 4),
    block(e, "33%", "100%", 4)
  )
);
var gridSkeleton = (e, { width, height }) => {
  const cols = Math.max(2, Math.min(4, Math.floor(width / 140)));
  const rows = Math.max(1, Math.min(3, Math.floor(height / 120)));
  const root = box(e, {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
    gap: 6,
    height: "100%"
  });
  for (let i = 0; i < cols * rows; i++) root.appendChild(block(e, "100%", "100%", 4));
  return root;
};
var dropdownSkeleton = (e, { width, height }) => {
  const items = Math.max(2, Math.floor((height - 32) / 28));
  const list = box(e, {
    flex: 1,
    padding: 4,
    display: "flex",
    flexDirection: "column",
    gap: 2
  });
  for (let i = 0; i < items; i++) {
    list.appendChild(
      box(
        e,
        {
          padding: "4px 6px",
          borderRadius: 3,
          background: i === 0 ? "var(--agd-fill)" : "transparent"
        },
        bar(e, `${50 + i * 17 % 35}%`, 2, i === 0)
      )
    );
  }
  return box(
    e,
    { height: "100%", display: "flex", flexDirection: "column" },
    box(
      e,
      { padding: "6px 8px", borderBottom: "1px solid var(--agd-stroke)" },
      bar(e, width * 0.5, 3, true)
    ),
    list
  );
};
var toggleSkeleton = (e, { width, height }) => {
  const r = Math.min(width, height) / 2;
  return svg(
    e,
    { width: "100%", height: "100%", viewBox: `0 0 ${width} ${height}`, fill: "none" },
    e.createSvg("rect", {
      x: "1",
      y: "1",
      width: String(width - 2),
      height: String(height - 2),
      rx: String(r),
      stroke: "var(--agd-stroke)",
      "stroke-width": "1"
    }),
    e.createSvg("circle", {
      cx: String(width - r),
      cy: String(height / 2),
      r: String(r * 0.7),
      fill: "var(--agd-bar)"
    })
  );
};
var searchSkeleton = (e, { height }) => {
  const r = Math.min(height / 2, 20);
  return box(
    e,
    {
      height: "100%",
      borderRadius: r,
      border: "1px dashed var(--agd-stroke)",
      background: "var(--agd-fill)",
      display: "flex",
      alignItems: "center",
      padding: `0 ${r * 0.6}px`,
      gap: 6
    },
    circle(e, Math.min(14, height * 0.4)),
    bar(e, "50%", 2)
  );
};
var toastSkeleton = (e, { height }) => box(
  e,
  {
    height: "100%",
    borderRadius: 8,
    border: "1px dashed var(--agd-stroke)",
    background: "var(--agd-fill)",
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    gap: 8
  },
  circle(e, Math.min(20, height * 0.5)),
  box(
    e,
    { flex: 1, display: "flex", flexDirection: "column", gap: 3 },
    bar(e, "60%", 3, true),
    bar(e, "80%", 2)
  ),
  box(e, {
    width: 14,
    height: 14,
    border: "1px solid var(--agd-stroke)",
    borderRadius: 3,
    flexShrink: 0
  })
);
var progressSkeleton = (e, { width, height }) => svg(
  e,
  { width: "100%", height: "100%", viewBox: `0 0 ${width} ${height}`, fill: "none" },
  e.createSvg("rect", {
    x: "0",
    y: "0",
    width: String(width),
    height: String(height),
    rx: String(height / 2),
    stroke: "var(--agd-stroke)",
    "stroke-width": "0.8"
  }),
  e.createSvg("rect", {
    x: "1",
    y: "1",
    width: String(width * 0.65),
    height: String(height - 2),
    rx: String((height - 2) / 2),
    fill: "var(--agd-bar)"
  })
);
var chartSkeleton = (e, { width }) => {
  const bars = Math.max(3, Math.min(7, Math.floor(width / 50)));
  const barW = width / (bars * 2);
  const root = box(e, {
    height: "100%",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-around",
    padding: "0 4px",
    borderBottom: "1px solid var(--agd-stroke)"
  });
  for (let i = 0; i < bars; i++) {
    const h = 30 + (i * 37 + 17) % 55;
    root.appendChild(block(e, barW, `${h}%`, 2));
  }
  return root;
};
var videoSkeleton = (e, { width, height }) => {
  const btnR = Math.min(width, height) * 0.12;
  return box(
    e,
    {
      height: "100%",
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    block(e, "100%", "100%", 4),
    box(
      e,
      {
        position: "absolute",
        width: btnR * 2,
        height: btnR * 2,
        borderRadius: "50%",
        border: "1.5px solid var(--agd-stroke)",
        background: "var(--agd-fill)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      },
      box(e, {
        width: 0,
        height: 0,
        borderLeft: `${btnR * 0.6}px solid var(--agd-bar-strong)`,
        borderTop: `${btnR * 0.4}px solid transparent`,
        borderBottom: `${btnR * 0.4}px solid transparent`,
        marginLeft: btnR * 0.15
      })
    )
  );
};
var tooltipSkeleton = (e) => box(
  e,
  { height: "100%", display: "flex", flexDirection: "column", alignItems: "center" },
  box(
    e,
    {
      flex: 1,
      width: "100%",
      borderRadius: 6,
      border: "1px dashed var(--agd-stroke)",
      background: "var(--agd-fill)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    bar(e, "60%", 2)
  ),
  box(e, {
    width: 8,
    height: 8,
    background: "var(--agd-fill)",
    border: "1px dashed var(--agd-stroke)",
    borderTop: "none",
    borderLeft: "none",
    transform: "rotate(45deg)",
    marginTop: -5
  })
);
var breadcrumbSkeleton = (e, { width }) => {
  const items = Math.max(2, Math.min(4, Math.floor(width / 80)));
  const root = box(e, { display: "flex", alignItems: "center", height: "100%", gap: 4 });
  for (let i = 0; i < items; i++) {
    root.appendChild(
      box(
        e,
        { display: "flex", alignItems: "center", gap: 4 },
        i > 0 ? label(e, { color: "var(--agd-stroke)", fontSize: 10 }, "/") : null,
        bar(e, 40 + i * 13 % 20, 2, i === items - 1)
      )
    );
  }
  return root;
};
var paginationSkeleton = (e, { width, height }) => {
  const count = Math.max(3, Math.min(5, Math.floor(width / 40)));
  const sz = Math.min(28, height * 0.8);
  const root = box(e, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 4
  });
  for (let i = 0; i < count; i++) {
    root.appendChild(block(e, sz, sz, 4, i === 1 ? { background: "var(--agd-bar)" } : void 0));
  }
  return root;
};
var dividerSkeleton = (e) => box(
  e,
  { display: "flex", alignItems: "center", height: "100%" },
  box(e, { width: "100%", height: 1, background: "var(--agd-stroke)" })
);
var accordionSkeleton = (e, { height }) => {
  const items = Math.max(2, Math.min(4, Math.floor(height / 40)));
  const root = box(e, { display: "flex", flexDirection: "column", height: "100%" });
  for (let i = 0; i < items; i++) {
    root.appendChild(
      box(
        e,
        {
          borderBottom: "1px solid var(--agd-stroke)",
          padding: "8px 6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flex: i === 0 ? 2 : 1
        },
        bar(e, `${40 + i * 17 % 25}%`, 3, true),
        label(e, { fontSize: 8, color: "var(--agd-stroke)" }, i === 0 ? "\u25BC" : "\u25B6")
      )
    );
  }
  return root;
};
var carouselSkeleton = (e) => box(
  e,
  { height: "100%", display: "flex", flexDirection: "column", gap: 6 },
  box(
    e,
    { flex: 1, display: "flex", gap: 6, alignItems: "center" },
    label(e, { fontSize: 12, color: "var(--agd-stroke)" }, "\u2039"),
    block(e, "100%", "100%", 4),
    label(e, { fontSize: 12, color: "var(--agd-stroke)" }, "\u203A")
  ),
  box(
    e,
    { display: "flex", justifyContent: "center", gap: 4 },
    circle(e, 5),
    circle(e, 5),
    circle(e, 5)
  )
);
var pricingSkeleton = (e, { width, height }) => {
  const features = box(e, {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    width: "100%",
    padding: "8px 0"
  });
  for (let i = 0; i < 4; i++) {
    features.appendChild(
      box(
        e,
        { display: "flex", alignItems: "center", gap: 4 },
        circle(e, 5),
        bar(e, `${50 + i * 17 % 35}%`, 2)
      )
    );
  }
  return box(
    e,
    {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: 10,
      gap: height * 0.04
    },
    bar(e, width * 0.4, 3, true),
    bar(e, width * 0.3, 6, true),
    features,
    block(e, width * 0.7, Math.min(32, height * 0.1), 6, { background: "var(--agd-bar)" })
  );
};
var testimonialSkeleton = (e) => box(
  e,
  { height: "100%", display: "flex", flexDirection: "column", padding: 10, gap: 8 },
  label(
    e,
    { fontSize: 18, lineHeight: 1, color: "var(--agd-stroke)", fontFamily: "serif" },
    "\u201C"
  ),
  box(
    e,
    { flex: 1, display: "flex", flexDirection: "column", gap: 4 },
    bar(e, "90%", 2),
    bar(e, "75%", 2),
    bar(e, "60%", 2)
  ),
  box(
    e,
    { display: "flex", alignItems: "center", gap: 6 },
    circle(e, 20),
    box(
      e,
      { display: "flex", flexDirection: "column", gap: 2 },
      bar(e, 60, 3, true),
      bar(e, 40, 2)
    )
  )
);
var ctaSkeleton = (e, { width, height }) => box(
  e,
  {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: height * 0.08
  },
  bar(e, width * 0.5, Math.max(4, height * 0.05), true),
  bar(e, width * 0.35),
  block(e, Math.min(140, width * 0.25), Math.min(32, height * 0.15), 6, {
    marginTop: height * 0.04,
    background: "var(--agd-bar)"
  })
);
var alertSkeleton = (e) => box(
  e,
  {
    height: "100%",
    borderRadius: 6,
    border: "1px dashed var(--agd-stroke)",
    background: "var(--agd-fill)",
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    gap: 8
  },
  box(
    e,
    {
      width: 16,
      height: 16,
      borderRadius: "50%",
      border: "1.5px solid var(--agd-bar-strong)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    },
    box(e, { width: 2, height: 6, background: "var(--agd-bar-strong)", borderRadius: 1 })
  ),
  box(
    e,
    { flex: 1, display: "flex", flexDirection: "column", gap: 3 },
    bar(e, "40%", 3, true),
    bar(e, "70%", 2)
  )
);
var bannerSkeleton = (e, { width, height }) => box(
  e,
  {
    height: "100%",
    background: "var(--agd-fill)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 12px"
  },
  bar(e, width * 0.4, 3, true),
  block(e, 60, Math.min(24, height * 0.6), 4)
);
var statSkeleton = (e, { width, height }) => box(
  e,
  {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: height * 0.06
  },
  bar(e, width * 0.5, 2),
  bar(e, width * 0.4, Math.max(8, height * 0.18), true),
  bar(e, width * 0.3, 2)
);
var stepperSkeleton = (e, { width, height }) => {
  const steps = Math.max(3, Math.min(5, Math.floor(width / 100)));
  const dotR = Math.min(12, height * 0.35);
  const root = box(e, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "100%",
    padding: "0 8px"
  });
  for (let i = 0; i < steps; i++) {
    root.appendChild(
      box(
        e,
        { display: "flex", alignItems: "center", gap: 0, flex: 1 },
        box(e, {
          width: dotR,
          height: dotR,
          borderRadius: "50%",
          border: "1.5px solid var(--agd-stroke)",
          background: i === 0 ? "var(--agd-bar)" : "transparent",
          flexShrink: 0
        }),
        i < steps - 1 ? box(e, { flex: 1, height: 1, background: "var(--agd-stroke)", margin: "0 4px" }) : null
      )
    );
  }
  return root;
};
var tagSkeleton = (e, { width }) => box(
  e,
  {
    height: "100%",
    borderRadius: 4,
    border: "1px solid var(--agd-stroke)",
    background: "var(--agd-fill)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "0 6px"
  },
  bar(e, Math.max(16, width * 0.5), 2, true),
  box(e, {
    width: 8,
    height: 8,
    borderRadius: "50%",
    border: "1px solid var(--agd-stroke)",
    flexShrink: 0
  })
);
var ratingSkeleton = (e, { width, height }) => {
  const stars = 5;
  const sz = Math.min(height * 0.7, width / (stars * 1.5));
  const root = box(e, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: sz * 0.2
  });
  for (let i = 0; i < stars; i++) {
    root.appendChild(
      svg(
        e,
        { width: String(sz), height: String(sz), viewBox: "0 0 16 16", fill: "none" },
        e.createSvg("path", {
          d: "M8 1.5l2 4 4.5.7-3.25 3.1.75 4.5L8 11.4l-4 2.4.75-4.5L1.5 6.2 6 5.5z",
          stroke: "var(--agd-stroke)",
          "stroke-width": "0.8",
          fill: i < 3 ? "var(--agd-bar)" : "none"
        })
      )
    );
  }
  return root;
};
var mapSkeleton = (e, { width, height }) => {
  const lines = svg(
    e,
    { width: "100%", height: "100%", viewBox: `0 0 ${width} ${height}`, fill: "none" },
    e.createSvg("line", {
      x1: "0",
      y1: String(height * 0.3),
      x2: String(width),
      y2: String(height * 0.7),
      stroke: "var(--agd-stroke)",
      "stroke-width": "0.5",
      opacity: ".2"
    }),
    e.createSvg("line", {
      x1: "0",
      y1: String(height * 0.6),
      x2: String(width),
      y2: String(height * 0.2),
      stroke: "var(--agd-stroke)",
      "stroke-width": "0.5",
      opacity: ".15"
    }),
    e.createSvg("line", {
      x1: String(width * 0.4),
      y1: "0",
      x2: String(width * 0.6),
      y2: String(height),
      stroke: "var(--agd-stroke)",
      "stroke-width": "0.5",
      opacity: ".15"
    })
  );
  applyStyle(lines, { position: "absolute", inset: 0 });
  return box(
    e,
    {
      height: "100%",
      position: "relative",
      borderRadius: 4,
      border: "1px dashed var(--agd-stroke)",
      background: "var(--agd-fill)",
      overflow: "hidden"
    },
    lines,
    box(
      e,
      { position: "absolute", left: "50%", top: "40%", transform: "translate(-50%, -100%)" },
      svg(
        e,
        { width: "16", height: "22", viewBox: "0 0 16 22", fill: "none" },
        e.createSvg("path", {
          d: "M8 0C3.6 0 0 3.6 0 8c0 6 8 14 8 14s8-8 8-14c0-4.4-3.6-8-8-8z",
          fill: "var(--agd-bar)",
          opacity: ".4"
        }),
        e.createSvg("circle", { cx: "8", cy: "8", r: "3", fill: "var(--agd-fill)" })
      )
    )
  );
};
var timelineSkeleton = (e, { height }) => {
  const items = Math.max(3, Math.min(5, Math.floor(height / 60)));
  const rail = box(e, {
    width: 16,
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  });
  for (let i = 0; i < items; i++) {
    rail.appendChild(
      box(
        e,
        { display: "flex", flexDirection: "column", alignItems: "center", flex: 1 },
        circle(e, 8),
        i < items - 1 ? box(e, { flex: 1, width: 1, background: "var(--agd-stroke)" }) : null
      )
    );
  }
  const entries = box(e, {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-around",
    paddingLeft: 8
  });
  for (let i = 0; i < items; i++) {
    entries.appendChild(
      box(
        e,
        { display: "flex", flexDirection: "column", gap: 3 },
        bar(e, `${35 + i * 13 % 25}%`, 3, true),
        bar(e, `${50 + i * 17 % 30}%`, 2)
      )
    );
  }
  return box(e, { display: "flex", height: "100%", padding: "8px 0" }, rail, entries);
};
var fileUploadSkeleton = (e, { width, height }) => box(
  e,
  {
    height: "100%",
    borderRadius: 8,
    border: "2px dashed var(--agd-stroke)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: height * 0.06
  },
  svg(
    e,
    { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none" },
    e.createSvg("path", {
      d: "M12 16V4m0 0l-4 4m4-4l4 4",
      stroke: "var(--agd-stroke)",
      "stroke-width": "1.5"
    }),
    e.createSvg("path", {
      d: "M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2",
      stroke: "var(--agd-stroke)",
      "stroke-width": "1.5"
    })
  ),
  bar(e, width * 0.4, 2),
  bar(e, width * 0.25, 2)
);
var codeBlockSkeleton = (e, { height }) => {
  const lines = Math.max(3, Math.min(8, Math.floor(height / 20)));
  const root = box(
    e,
    {
      height: "100%",
      borderRadius: 6,
      background: "var(--agd-fill)",
      border: "1px solid var(--agd-stroke)",
      padding: 8,
      display: "flex",
      flexDirection: "column",
      gap: 4
    },
    box(
      e,
      { display: "flex", gap: 3, marginBottom: 4 },
      circle(e, 6),
      circle(e, 6),
      circle(e, 6)
    )
  );
  for (let i = 0; i < lines; i++) {
    root.appendChild(
      box(
        e,
        { display: "flex", gap: 6, paddingLeft: i > 0 && i < lines - 1 ? 12 : 0 },
        bar(e, `${25 + i * 23 % 50}%`, 2, i === 0)
      )
    );
  }
  return root;
};
var calendarSkeleton = (e, { width, height }) => {
  const cols = 7;
  const rows = 5;
  const cellSz = Math.min((width - 16) / cols, (height - 40) / (rows + 1));
  const grid = box(e, {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: 2,
    padding: "0 4px",
    flex: 1
  });
  for (let i = 0; i < cols; i++) {
    grid.appendChild(
      box(
        e,
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: cellSz * 0.6
        },
        bar(e, cellSz * 0.5, 2)
      )
    );
  }
  for (let i = 0; i < cols * rows; i++) {
    grid.appendChild(
      box(
        e,
        { display: "flex", alignItems: "center", justifyContent: "center", height: cellSz },
        box(
          e,
          {
            width: cellSz * 0.6,
            height: cellSz * 0.6,
            borderRadius: "50%",
            background: i === 12 ? "var(--agd-bar)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          },
          box(e, {
            width: 2,
            height: 2,
            borderRadius: 1,
            background: "var(--agd-bar-strong)",
            opacity: i === 12 ? 1 : 0.3
          })
        )
      )
    );
  }
  return box(
    e,
    { height: "100%", display: "flex", flexDirection: "column" },
    box(
      e,
      {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 8px"
      },
      label(e, { fontSize: 8, color: "var(--agd-stroke)" }, "\u2039"),
      bar(e, width * 0.3, 3, true),
      label(e, { fontSize: 8, color: "var(--agd-stroke)" }, "\u203A")
    ),
    grid
  );
};
var notificationSkeleton = (e, { height }) => box(
  e,
  {
    height: "100%",
    borderRadius: 8,
    border: "1px dashed var(--agd-stroke)",
    background: "var(--agd-fill)",
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    gap: 8
  },
  circle(e, Math.min(32, height * 0.55)),
  box(
    e,
    { flex: 1, display: "flex", flexDirection: "column", gap: 3 },
    bar(e, "50%", 3, true),
    bar(e, "75%", 2)
  ),
  bar(e, 30, 2)
);
var productCardSkeleton = (e, { width }) => box(
  e,
  { height: "100%", display: "flex", flexDirection: "column" },
  box(e, {
    height: "50%",
    background: "var(--agd-fill)",
    borderBottom: "1px dashed var(--agd-stroke)"
  }),
  box(
    e,
    { flex: 1, padding: 10, display: "flex", flexDirection: "column", gap: 5 },
    bar(e, "65%", 4, true),
    bar(e, "40%", 3),
    box(e, { flex: 1 }),
    box(
      e,
      { display: "flex", alignItems: "center", justifyContent: "space-between" },
      bar(e, "30%", 5, true),
      block(e, Math.min(70, width * 0.3), 26, 4, { background: "var(--agd-bar)" })
    )
  )
);
var profileSkeleton = (e, { width, height }) => {
  const avatarSz = Math.min(48, height * 0.3);
  const stats = box(e, { display: "flex", gap: width * 0.08, marginTop: height * 0.04 });
  for (let i = 0; i < 3; i++) {
    stats.appendChild(
      box(
        e,
        { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
        bar(e, 20, 3, true),
        bar(e, 28, 2)
      )
    );
  }
  return box(
    e,
    {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: height * 0.06
    },
    circle(e, avatarSz),
    bar(e, width * 0.45, 4, true),
    bar(e, width * 0.3, 2),
    stats
  );
};
var drawerSkeleton = (e, { width, height }) => {
  const panelW = Math.max(width * 0.6, 80);
  const items = Math.max(3, Math.floor(height / 40));
  const panel = box(
    e,
    {
      flex: 1,
      borderLeft: "1px solid var(--agd-stroke)",
      display: "flex",
      flexDirection: "column",
      padding: width * 0.04
    },
    box(
      e,
      {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: height * 0.06
      },
      bar(e, panelW * 0.4, 4, true),
      box(e, { width: 12, height: 12, border: "1px solid var(--agd-stroke)", borderRadius: 3 })
    )
  );
  for (let i = 0; i < items; i++) {
    panel.appendChild(
      box(e, { padding: "6px 0" }, bar(e, `${50 + i * 17 % 35}%`, 2, i === 0))
    );
  }
  return box(
    e,
    { height: "100%", display: "flex" },
    box(e, { width: width - panelW, background: "var(--agd-fill)", opacity: 0.3 }),
    panel
  );
};
var popoverSkeleton = (e) => box(
  e,
  { height: "100%", display: "flex", flexDirection: "column", alignItems: "center" },
  box(
    e,
    {
      flex: 1,
      width: "100%",
      borderRadius: 8,
      border: "1px dashed var(--agd-stroke)",
      background: "var(--agd-fill)",
      padding: 10,
      display: "flex",
      flexDirection: "column",
      gap: 5
    },
    bar(e, "70%", 3, true),
    bar(e, "90%", 2),
    bar(e, "60%", 2)
  ),
  box(e, {
    width: 10,
    height: 10,
    background: "var(--agd-fill)",
    border: "1px dashed var(--agd-stroke)",
    borderTop: "none",
    borderLeft: "none",
    transform: "rotate(45deg)",
    marginTop: -6
  })
);
var logoSkeleton = (e, { width, height }) => {
  const iconSz = Math.min(height * 0.7, width * 0.3);
  return box(
    e,
    { height: "100%", display: "flex", alignItems: "center", gap: width * 0.08 },
    block(e, iconSz, iconSz, iconSz * 0.25),
    bar(e, width * 0.45, Math.max(4, height * 0.2), true)
  );
};
var faqSkeleton = (e, { width, height }) => {
  const items = Math.max(2, Math.min(5, Math.floor(height / 56)));
  const root = box(e, { display: "flex", flexDirection: "column", height: "100%" });
  for (let i = 0; i < items; i++) {
    root.appendChild(
      box(
        e,
        {
          borderBottom: "1px solid var(--agd-stroke)",
          padding: "8px 6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flex: i === 0 ? 2 : 1
        },
        box(
          e,
          { display: "flex", alignItems: "center", gap: 6 },
          label(e, { fontSize: 9, fontWeight: 700, color: "var(--agd-stroke)" }, "Q"),
          bar(e, width * (0.3 + i * 13 % 25 / 100), 3, true)
        ),
        label(e, { fontSize: 8, color: "var(--agd-stroke)" }, i === 0 ? "\u25BC" : "\u25B6")
      )
    );
  }
  return root;
};
var gallerySkeleton = (e, { width, height }) => {
  const cols = Math.max(2, Math.min(4, Math.floor(width / 120)));
  const rows = Math.max(1, Math.min(3, Math.floor(height / 120)));
  const root = box(e, {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
    gap: 4,
    height: "100%"
  });
  for (let i = 0; i < cols * rows; i++) {
    root.appendChild(
      box(
        e,
        {
          borderRadius: 4,
          border: "1px dashed var(--agd-stroke)",
          background: "var(--agd-fill)",
          position: "relative",
          overflow: "hidden"
        },
        svg(
          e,
          {
            width: "100%",
            height: "100%",
            viewBox: "0 0 100 100",
            preserveAspectRatio: "none",
            fill: "none"
          },
          e.createSvg("line", {
            x1: "0",
            y1: "0",
            x2: "100",
            y2: "100",
            stroke: "var(--agd-stroke)",
            "stroke-width": "0.5"
          }),
          e.createSvg("line", {
            x1: "100",
            y1: "0",
            x2: "0",
            y2: "100",
            stroke: "var(--agd-stroke)",
            "stroke-width": "0.5"
          })
        )
      )
    );
  }
  return root;
};
var checkboxSkeleton = (e, { width, height }) => {
  const sz = Math.min(width, height);
  return svg(
    e,
    { width: "100%", height: "100%", viewBox: `0 0 ${width} ${height}`, fill: "none" },
    e.createSvg("rect", {
      x: "1",
      y: String((height - sz + 2) / 2),
      width: String(sz - 2),
      height: String(sz - 2),
      rx: String(sz * 0.15),
      stroke: "var(--agd-stroke)",
      "stroke-width": "1.5"
    }),
    e.createSvg("path", {
      d: `M${sz * 0.25} ${height / 2}l${sz * 0.2} ${sz * 0.2} ${sz * 0.3}-${sz * 0.35}`,
      stroke: "var(--agd-bar)",
      "stroke-width": "1.5",
      fill: "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    })
  );
};
var radioSkeleton = (e, { width, height }) => {
  const r = Math.min(width, height) / 2 - 1;
  return svg(
    e,
    { width: "100%", height: "100%", viewBox: `0 0 ${width} ${height}`, fill: "none" },
    e.createSvg("circle", {
      cx: String(width / 2),
      cy: String(height / 2),
      r: String(r),
      stroke: "var(--agd-stroke)",
      "stroke-width": "1.5"
    }),
    e.createSvg("circle", {
      cx: String(width / 2),
      cy: String(height / 2),
      r: String(r * 0.45),
      fill: "var(--agd-bar)"
    })
  );
};
var sliderSkeleton = (e, { width, height }) => {
  const trackH = Math.max(2, height * 0.12);
  const thumbR = Math.min(height * 0.35, 10);
  const fillW = width * 0.55;
  return box(
    e,
    { height: "100%", display: "flex", alignItems: "center", position: "relative" },
    box(
      e,
      {
        width: "100%",
        height: trackH,
        borderRadius: trackH / 2,
        background: "var(--agd-fill)",
        border: "1px solid var(--agd-stroke)",
        position: "relative"
      },
      box(e, {
        width: fillW,
        height: "100%",
        borderRadius: trackH / 2,
        background: "var(--agd-bar)"
      })
    ),
    box(e, {
      position: "absolute",
      left: fillW - thumbR,
      width: thumbR * 2,
      height: thumbR * 2,
      borderRadius: "50%",
      border: "1.5px solid var(--agd-stroke)",
      background: "var(--agd-fill)"
    })
  );
};
var datePickerSkeleton = (e, { width, height }) => {
  const inputH = Math.min(36, height * 0.15);
  const cols = 7;
  const rows = 4;
  const cellSz = Math.min((width - 16) / cols, (height - inputH - 40) / (rows + 1));
  const grid = box(e, {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: 1,
    padding: "0 4px",
    flex: 1
  });
  for (let i = 0; i < cols * rows; i++) {
    grid.appendChild(
      box(
        e,
        { display: "flex", alignItems: "center", justifyContent: "center", height: cellSz },
        box(
          e,
          {
            width: cellSz * 0.5,
            height: cellSz * 0.5,
            borderRadius: "50%",
            background: i === 10 ? "var(--agd-bar)" : "transparent"
          },
          box(
            e,
            {
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            },
            box(e, {
              width: 1.5,
              height: 1.5,
              borderRadius: 1,
              background: "var(--agd-bar-strong)",
              opacity: i === 10 ? 1 : 0.25
            })
          )
        )
      )
    );
  }
  return box(
    e,
    { height: "100%", display: "flex", flexDirection: "column", gap: 4 },
    box(
      e,
      {
        height: inputH,
        borderRadius: 4,
        border: "1px dashed var(--agd-stroke)",
        background: "var(--agd-fill)",
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
        justifyContent: "space-between"
      },
      bar(e, "40%", 2),
      svg(
        e,
        { width: "12", height: "12", viewBox: "0 0 16 16", fill: "none" },
        e.createSvg("rect", {
          x: "2",
          y: "3",
          width: "12",
          height: "11",
          rx: "1",
          stroke: "var(--agd-stroke)",
          "stroke-width": "1"
        }),
        e.createSvg("line", {
          x1: "2",
          y1: "6",
          x2: "14",
          y2: "6",
          stroke: "var(--agd-stroke)",
          "stroke-width": "0.5"
        })
      )
    ),
    box(
      e,
      {
        flex: 1,
        borderRadius: 6,
        border: "1px dashed var(--agd-stroke)",
        background: "var(--agd-fill)",
        display: "flex",
        flexDirection: "column"
      },
      box(
        e,
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 6px"
        },
        label(e, { fontSize: 7, color: "var(--agd-stroke)" }, "\u2039"),
        bar(e, width * 0.25, 2, true),
        label(e, { fontSize: 7, color: "var(--agd-stroke)" }, "\u203A")
      ),
      grid
    )
  );
};
var skeletonSkeleton = (e, { height }) => box(
  e,
  {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    gap: height * 0.08,
    padding: 4
  },
  box(e, { width: "100%", height: height * 0.2, borderRadius: 4, background: "var(--agd-fill)" }),
  box(e, {
    width: "70%",
    height: Math.max(6, height * 0.1),
    borderRadius: 3,
    background: "var(--agd-fill)"
  }),
  box(e, {
    width: "90%",
    height: Math.max(4, height * 0.06),
    borderRadius: 3,
    background: "var(--agd-fill)"
  }),
  box(e, {
    width: "50%",
    height: Math.max(4, height * 0.06),
    borderRadius: 3,
    background: "var(--agd-fill)"
  })
);
var chipSkeleton = (e, { height }) => box(
  e,
  { height: "100%", display: "flex", alignItems: "center", gap: 6 },
  box(
    e,
    {
      height: "100%",
      flex: 1,
      borderRadius: height / 2,
      border: "1px solid var(--agd-stroke)",
      background: "var(--agd-fill)",
      display: "flex",
      alignItems: "center",
      padding: `0 ${height * 0.3}px`,
      gap: 4
    },
    bar(e, "60%", 2, true),
    box(e, {
      width: Math.max(6, height * 0.3),
      height: Math.max(6, height * 0.3),
      borderRadius: "50%",
      border: "1px solid var(--agd-stroke)",
      flexShrink: 0,
      marginLeft: "auto"
    })
  )
);
var iconSkeleton = (e, { width, height }) => {
  const sz = Math.min(width, height);
  return svg(
    e,
    { width: "100%", height: "100%", viewBox: `0 0 ${width} ${height}`, fill: "none" },
    e.createSvg("path", {
      d: `M${width / 2} ${(height - sz) / 2 + sz * 0.1}l${sz * 0.12} ${sz * 0.25} ${sz * 0.28} ${sz * 0.04}-${sz * 0.2} ${sz * 0.2} ${sz * 0.05} ${sz * 0.28}-${sz * 0.25}-${sz * 0.12}-${sz * 0.25} ${sz * 0.12} ${sz * 0.05}-${sz * 0.28}-${sz * 0.2}-${sz * 0.2} ${sz * 0.28}-${sz * 0.04}z`,
      stroke: "var(--agd-stroke)",
      "stroke-width": "1",
      fill: "var(--agd-fill)"
    })
  );
};
var spinnerSkeleton = (e, { width, height }) => {
  const r = Math.min(width, height) / 2 - 2;
  return svg(
    e,
    { width: "100%", height: "100%", viewBox: `0 0 ${width} ${height}`, fill: "none" },
    e.createSvg("circle", {
      cx: String(width / 2),
      cy: String(height / 2),
      r: String(r),
      stroke: "var(--agd-stroke)",
      "stroke-width": "1.5",
      opacity: ".2"
    }),
    e.createSvg("path", {
      d: `M${width / 2} ${height / 2 - r}a${r} ${r} 0 0 1 ${r} ${r}`,
      stroke: "var(--agd-bar-strong)",
      "stroke-width": "1.5",
      "stroke-linecap": "round"
    })
  );
};
var featureSkeleton = (e, { width, height }) => {
  const iconSz = Math.min(36, height * 0.25, width * 0.12);
  const items = Math.max(1, Math.min(3, Math.floor(height / 80)));
  const root = box(e, {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "space-around",
    padding: 8
  });
  for (let i = 0; i < items; i++) {
    root.appendChild(
      box(
        e,
        { display: "flex", gap: width * 0.04, alignItems: "flex-start" },
        block(e, iconSz, iconSz, iconSz * 0.25),
        box(
          e,
          { flex: 1, display: "flex", flexDirection: "column", gap: 4 },
          bar(e, `${40 + i * 13 % 20}%`, 3, true),
          bar(e, `${60 + i * 17 % 25}%`, 2)
        )
      )
    );
  }
  return root;
};
var teamSkeleton = (e, { width, height }) => {
  const cols = Math.max(2, Math.min(4, Math.floor(width / 120)));
  const avatarSz = Math.min(36, height * 0.25);
  const members = box(e, {
    display: "flex",
    gap: width * 0.06,
    justifyContent: "center",
    flex: 1,
    alignItems: "center"
  });
  for (let i = 0; i < cols; i++) {
    members.appendChild(
      box(
        e,
        { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
        circle(e, avatarSz),
        bar(e, width * 0.12, 3, true),
        bar(e, width * 0.08, 2)
      )
    );
  }
  return box(
    e,
    {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: height * 0.06,
      padding: height * 0.06
    },
    bar(e, width * 0.3, 4, true),
    members
  );
};
var loginSkeleton = (e, { width, height }) => {
  const fields = Math.max(2, Math.min(3, Math.floor(height / 80)));
  const inputs = box(e, {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: height * 0.03,
    marginTop: height * 0.04
  });
  for (let i = 0; i < fields; i++) {
    inputs.appendChild(
      box(
        e,
        { display: "flex", flexDirection: "column", gap: 3 },
        bar(e, Math.min(60, width * 0.2), 2),
        block(e, "100%", Math.min(32, height * 0.1), 4)
      )
    );
  }
  return box(
    e,
    {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: width * 0.06,
      gap: height * 0.04
    },
    bar(e, width * 0.5, Math.max(5, height * 0.04), true),
    bar(e, width * 0.35, 2),
    inputs,
    block(e, "100%", Math.min(36, height * 0.12), 6, {
      marginTop: height * 0.03,
      background: "var(--agd-bar)"
    }),
    bar(e, width * 0.4, 2)
  );
};
var contactSkeleton = (e, { width, height }) => box(
  e,
  {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    padding: width * 0.04,
    gap: height * 0.03
  },
  bar(e, width * 0.4, 4, true),
  bar(e, width * 0.6, 2),
  box(
    e,
    { display: "flex", gap: 6, marginTop: height * 0.03 },
    box(
      e,
      { flex: 1, display: "flex", flexDirection: "column", gap: 3 },
      bar(e, 50, 2),
      block(e, "100%", Math.min(28, height * 0.1), 4)
    ),
    box(
      e,
      { flex: 1, display: "flex", flexDirection: "column", gap: 3 },
      bar(e, 40, 2),
      block(e, "100%", Math.min(28, height * 0.1), 4)
    )
  ),
  box(
    e,
    { display: "flex", flexDirection: "column", gap: 3 },
    bar(e, 50, 2),
    block(e, "100%", Math.min(28, height * 0.1), 4)
  ),
  box(
    e,
    { display: "flex", flexDirection: "column", gap: 3, flex: 1 },
    bar(e, 60, 2),
    block(e, "100%", "100%", 4)
  ),
  block(e, Math.min(120, width * 0.3), Math.min(30, height * 0.1), 6, {
    alignSelf: "flex-end",
    background: "var(--agd-bar)"
  })
);
var SKELETON_RENDERERS = {
  navigation: navigationSkeleton,
  hero: heroSkeleton,
  sidebar: sidebarSkeleton,
  footer: footerSkeleton,
  modal: modalSkeleton,
  card: cardSkeleton,
  text: textSkeleton,
  image: imageSkeleton,
  table: tableSkeleton,
  list: listSkeleton,
  button: buttonSkeleton,
  input: inputSkeleton,
  form: formSkeleton,
  tabs: tabsSkeleton,
  avatar: avatarSkeleton,
  badge: badgeSkeleton,
  header: headerSkeleton,
  section: sectionSkeleton,
  grid: gridSkeleton,
  dropdown: dropdownSkeleton,
  toggle: toggleSkeleton,
  search: searchSkeleton,
  toast: toastSkeleton,
  progress: progressSkeleton,
  chart: chartSkeleton,
  video: videoSkeleton,
  tooltip: tooltipSkeleton,
  breadcrumb: breadcrumbSkeleton,
  pagination: paginationSkeleton,
  divider: dividerSkeleton,
  accordion: accordionSkeleton,
  carousel: carouselSkeleton,
  pricing: pricingSkeleton,
  testimonial: testimonialSkeleton,
  cta: ctaSkeleton,
  alert: alertSkeleton,
  banner: bannerSkeleton,
  stat: statSkeleton,
  stepper: stepperSkeleton,
  tag: tagSkeleton,
  rating: ratingSkeleton,
  map: mapSkeleton,
  timeline: timelineSkeleton,
  fileUpload: fileUploadSkeleton,
  codeBlock: codeBlockSkeleton,
  calendar: calendarSkeleton,
  notification: notificationSkeleton,
  productCard: productCardSkeleton,
  profile: profileSkeleton,
  drawer: drawerSkeleton,
  popover: popoverSkeleton,
  logo: logoSkeleton,
  faq: faqSkeleton,
  gallery: gallerySkeleton,
  checkbox: checkboxSkeleton,
  radio: radioSkeleton,
  slider: sliderSkeleton,
  datePicker: datePickerSkeleton,
  skeleton: skeletonSkeleton,
  chip: chipSkeleton,
  icon: iconSkeleton,
  spinner: spinnerSkeleton,
  feature: featureSkeleton,
  team: teamSkeleton,
  login: loginSkeleton,
  contact: contactSkeleton
};
var RECORDS = /* @__PURE__ */ new WeakMap();
function paint(host, record, width, height) {
  const { environment, type, text } = record;
  host.replaceChildren();
  host.removeAttribute("style");
  const renderer = SKELETON_RENDERERS[type];
  if (!renderer) {
    applyStyle(host, {
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    });
    host.appendChild(
      label(
        environment,
        {
          fontSize: 10,
          fontWeight: 600,
          color: "var(--agd-text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          opacity: 0.5
        },
        type
      )
    );
    return;
  }
  applyStyle(host, {
    width: "100%",
    height: "100%",
    padding: 8,
    position: "relative",
    pointerEvents: "none"
  });
  host.appendChild(renderer(environment, { width, height, text }));
}
function createSkeleton(environment, type, width, height, text) {
  const host = environment.createElement("div");
  const record = { environment, type, text };
  RECORDS.set(host, record);
  paint(host, record, width, height);
  return host;
}
function updateSkeleton(node, width, height) {
  const record = RECORDS.get(node);
  if (!record) return;
  paint(node, record, width, height);
}

// src/browser/view/icons.ts
var LAYER_ATTR = "data-ag-icon-layer";
var STATE_ATTR = "data-ag-icon-state";
var STROKE = "currentColor";
var GREEN = "var(--agentation-color-green)";
var RED = "var(--agentation-color-red)";
function strokePath(d, width = "1.5") {
  return {
    tag: "path",
    attrs: {
      d,
      stroke: STROKE,
      "stroke-width": width,
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }
  };
}
function circleOutline(color) {
  return {
    tag: "path",
    attrs: {
      d: "M12 20C7.58172 20 4 16.4182 4 12C4 7.58172 7.58172 4 12 4C16.4182 4 20 7.58172 20 12C20 16.4182 16.4182 20 12 20Z",
      stroke: color,
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }
  };
}
function checkCircle(color) {
  return [
    circleOutline(color),
    {
      tag: "path",
      attrs: {
        d: "M15 10L11 14.25L9.25 12.25",
        stroke: color,
        "stroke-width": "1.5",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      }
    }
  ];
}
var COPY_GLYPH = [
  {
    tag: "path",
    attrs: {
      d: "M4.75 11.25C4.75 10.4216 5.42157 9.75 6.25 9.75H12.75C13.5784 9.75 14.25 10.4216 14.25 11.25V17.75C14.25 18.5784 13.5784 19.25 12.75 19.25H6.25C5.42157 19.25 4.75 18.5784 4.75 17.75V11.25Z",
      stroke: STROKE,
      "stroke-width": "1.5"
    }
  },
  {
    tag: "path",
    attrs: {
      d: "M17.25 14.25H17.75C18.5784 14.25 19.25 13.5784 19.25 12.75V6.25C19.25 5.42157 18.5784 4.75 17.75 4.75H11.25C10.4216 4.75 9.75 5.42157 9.75 6.25V6.75",
      stroke: STROKE,
      "stroke-width": "1.5",
      "stroke-linecap": "round"
    }
  }
];
var EYE_OPEN = [
  strokePath(
    "M3.91752 12.7539C3.65127 12.2996 3.65037 11.7515 3.9149 11.2962C4.9042 9.59346 7.72688 5.49994 12 5.49994C16.2731 5.49994 19.0958 9.59346 20.0851 11.2962C20.3496 11.7515 20.3487 12.2996 20.0825 12.7539C19.0908 14.4459 16.2694 18.4999 12 18.4999C7.73064 18.4999 4.90918 14.4459 3.91752 12.7539Z"
  ),
  strokePath(
    "M12 14.8261C13.5608 14.8261 14.8261 13.5608 14.8261 12C14.8261 10.4392 13.5608 9.17392 12 9.17392C10.4392 9.17392 9.17391 10.4392 9.17391 12C9.17391 13.5608 10.4392 14.8261 12 14.8261Z"
  )
];
var EYE_CLOSED = [
  {
    tag: "path",
    attrs: {
      d: "M18.6025 9.28503C18.9174 8.9701 19.4364 8.99481 19.7015 9.35271C20.1484 9.95606 20.4943 10.507 20.7342 10.9199C21.134 11.6086 21.1329 12.4454 20.7303 13.1328C20.2144 14.013 19.2151 15.5225 17.7723 16.8193C16.3293 18.1162 14.3852 19.2497 12.0008 19.25C11.4192 19.25 10.8638 19.1823 10.3355 19.0613C9.77966 18.934 9.63498 18.2525 10.0382 17.8493C10.2412 17.6463 10.5374 17.573 10.8188 17.6302C11.1993 17.7076 11.5935 17.75 12.0008 17.75C13.8848 17.7497 15.4867 16.8568 16.7693 15.7041C18.0522 14.5511 18.9606 13.1867 19.4363 12.375C19.5656 12.1543 19.5659 11.8943 19.4373 11.6729C19.2235 11.3049 18.921 10.8242 18.5364 10.3003C18.3085 9.98991 18.3302 9.5573 18.6025 9.28503ZM12.0008 4.75C12.5814 4.75006 13.1358 4.81803 13.6632 4.93953C14.2182 5.06741 14.362 5.74812 13.9593 6.15091C13.7558 6.35435 13.4589 6.42748 13.1771 6.36984C12.7983 6.29239 12.4061 6.25006 12.0008 6.25C10.1167 6.25 8.51415 7.15145 7.23028 8.31543C5.94678 9.47919 5.03918 10.8555 4.56426 11.6729C4.43551 11.8945 4.43582 12.1542 4.56524 12.375C4.77587 12.7343 5.07189 13.2012 5.44718 13.7105C5.67623 14.0213 5.65493 14.4552 5.38193 14.7282C5.0671 15.0431 4.54833 15.0189 4.28292 14.6614C3.84652 14.0736 3.50813 13.5369 3.27129 13.1328C2.86831 12.4451 2.86717 11.6088 3.26739 10.9199C3.78185 10.0345 4.77959 8.51239 6.22247 7.2041C7.66547 5.89584 9.61202 4.75 12.0008 4.75Z",
      fill: STROKE
    }
  },
  {
    tag: "path",
    attrs: {
      d: "M5 19L19 5",
      stroke: STROKE,
      "stroke-width": "1.5",
      "stroke-linecap": "round"
    }
  }
];
var TRASH_HEAD = "M13.5 4C14.7426 4 15.75 5.00736 15.75 6.25V7H18.5C18.9142 7 19.25 7.33579 19.25 7.75C19.25 8.16421 18.9142 8.5 18.5 8.5H17.9678L17.6328 16.2217C17.61 16.7475 17.5912 17.1861 17.5469 17.543C17.5015 17.9087 17.4225 18.2506 17.2461 18.5723C16.9747 19.0671 16.5579 19.4671 16.0518 19.7168C15.7227 19.8791 15.3772 19.9422 15.0098 19.9717C14.6514 20.0004 14.2126 20 13.6865 20H10.3135C9.78735 20 9.34856 20.0004 8.99023 19.9717C8.62278 19.9422 8.27729 19.8791 7.94824 19.7168C7.44205 19.4671 7.02532 19.0671 6.75391 18.5723C6.57751 18.2506 6.49853 17.9087 6.45312 17.543C6.40883 17.1861 6.39005 16.7475 6.36719 16.2217L6.03223 8.5H5.5C5.08579 8.5 4.75 8.16421 4.75 7.75C4.75 7.33579 5.08579 7 5.5 7H8.25V6.25C8.25 5.00736 9.25736 4 10.5 4H13.5ZM7.86621 16.1562C7.89013 16.7063 7.90624 17.0751 7.94141 17.3584C7.97545 17.6326 8.02151 17.7644 8.06934 17.8516C8.19271 18.0763 8.38239 18.2577 8.6123 18.3711C8.70153 18.4151 8.83504 18.4545 9.11035 18.4766C9.39482 18.4994 9.76335 18.5 10.3135 18.5H13.6865C14.2367 18.5 14.6052 18.4994 14.8896 18.4766C15.165 18.4545 15.2985 18.4151 15.3877 18.3711C15.6176 18.2577 15.8073 18.0763 15.9307 17.8516C15.9785 17.7644 16.0245 17.6326 16.0586 17.3584C16.0938 17.0751 16.1099 16.7063 16.1338 16.1562L16.4668 8.5H7.5332L7.86621 16.1562ZM9.97656 10.75C10.3906 10.7371 10.7371 11.0626 10.75 11.4766L10.875 15.4766C10.8879 15.8906 10.5624 16.2371 10.1484 16.25C9.73443 16.2629 9.38794 15.9374 9.375 15.5234L9.25 11.5234C9.23706 11.1094 9.56255 10.7629 9.97656 10.75Z";
var TRASH_ALT_TAIL = "M14.0244 10.75C14.4384 10.7635 14.7635 11.1105 14.75 11.5244L14.6201 15.5244C14.6066 15.9384 14.2596 16.2634 13.8457 16.25C13.4317 16.2365 13.1067 15.8896 13.1201 15.4756L13.251 11.4756C13.2645 11.0617 13.6105 10.7366 14.0244 10.75ZM10.5 5.5C10.0858 5.5 9.75 5.83579 9.75 6.25V7H14.25V6.25C14.25 5.83579 13.9142 5.5 13.5 5.5H10.5Z";
var TRASH_TAIL = "M14.0244 10.75C14.4383 10.7635 14.7635 11.1105 14.75 11.5244L14.6201 15.5244C14.6066 15.9384 14.2596 16.2634 13.8457 16.25C13.4317 16.2365 13.1067 15.8896 13.1201 15.4756L13.251 11.4756C13.2645 11.0617 13.6105 10.7366 14.0244 10.75ZM10.5 5.5C10.0858 5.5 9.75 5.83579 9.75 6.25V7H14.25V6.25C14.25 5.83579 13.9142 5.5 13.5 5.5H10.5Z";
var SUN_RAYS = [
  "M10 3.9585V5.05698",
  "M10 14.9429V16.0414",
  "M5.7269 5.72656L6.50682 6.50649",
  "M13.4932 13.4932L14.2731 14.2731",
  "M3.95834 10H5.05683",
  "M14.9432 10H16.0417",
  "M5.7269 14.2731L6.50682 13.4932",
  "M13.4932 6.50649L14.2731 5.72656"
];
var ICONS = {
  "list-sparkle": {
    size: 24,
    viewBox: "0 0 24 24",
    clip: true,
    children: [
      strokePath("M11.5 12L5.5 12"),
      strokePath("M18.5 6.75L5.5 6.75"),
      strokePath("M9.25 17.25L5.5 17.25"),
      {
        tag: "path",
        attrs: {
          d: "M16 12.75L16.5179 13.9677C16.8078 14.6494 17.3506 15.1922 18.0323 15.4821L19.25 16L18.0323 16.5179C17.3506 16.8078 16.8078 17.3506 16.5179 18.0323L16 19.25L15.4821 18.0323C15.1922 17.3506 14.6494 16.8078 13.9677 16.5179L12.75 16L13.9677 15.4821C14.6494 15.1922 15.1922 14.6494 15.4821 13.9677L16 12.75Z",
          stroke: STROKE,
          "stroke-width": "1.5",
          "stroke-linejoin": "round"
        }
      }
    ]
  },
  "pause-play": {
    size: 24,
    viewBox: "0 0 24 24",
    children: [
      {
        tag: "g",
        layer: "pause",
        transition: "fade-fast",
        children: [
          {
            tag: "path",
            attrs: {
              d: "M8 6L8 18",
              stroke: STROKE,
              "stroke-width": "1.5",
              "stroke-linecap": "round"
            }
          },
          {
            tag: "path",
            attrs: {
              d: "M16 18L16 6",
              stroke: STROKE,
              "stroke-width": "1.5",
              "stroke-linecap": "round"
            }
          }
        ]
      },
      {
        tag: "path",
        layer: "play",
        transition: "fade-fast",
        attrs: {
          d: "M17.75 10.701C18.75 11.2783 18.75 12.7217 17.75 13.299L8.75 18.4952C7.75 19.0725 6.5 18.3509 6.5 17.1962L6.5 6.80384C6.5 5.64914 7.75 4.92746 8.75 5.50481L17.75 10.701Z",
          stroke: STROKE,
          "stroke-width": "1.5"
        }
      }
    ]
  },
  layout: {
    size: 24,
    viewBox: "0 0 24 24",
    children: [
      {
        tag: "rect",
        attrs: {
          x: "3",
          y: "3",
          width: "18",
          height: "18",
          rx: "2",
          stroke: STROKE,
          "stroke-width": "1.5"
        }
      },
      {
        tag: "line",
        attrs: {
          x1: "3",
          y1: "9",
          x2: "21",
          y2: "9",
          stroke: STROKE,
          "stroke-width": "1.5"
        }
      },
      {
        tag: "line",
        attrs: {
          x1: "9",
          y1: "9",
          x2: "9",
          y2: "21",
          stroke: STROKE,
          "stroke-width": "1.5"
        }
      }
    ]
  },
  eye: {
    size: 24,
    viewBox: "0 0 24 24",
    children: [
      { tag: "g", layer: "open", transition: "fade", children: EYE_OPEN },
      { tag: "g", layer: "closed", transition: "fade", children: EYE_CLOSED }
    ]
  },
  copy: {
    size: 24,
    viewBox: "0 0 24 24",
    children: [
      { tag: "g", layer: "copy", transition: "state", children: COPY_GLYPH },
      { tag: "g", layer: "copied", transition: "state", children: checkCircle(GREEN) }
    ]
  },
  "send-arrow": {
    size: 24,
    viewBox: "0 0 24 24",
    children: [
      {
        tag: "g",
        layer: "arrow",
        transition: "state-fast",
        children: [
          strokePath(
            "M9.875 14.125L12.3506 19.6951C12.7184 20.5227 13.9091 20.4741 14.2083 19.6193L18.8139 6.46032C19.0907 5.6695 18.3305 4.90933 17.5397 5.18611L4.38072 9.79174C3.52589 10.0909 3.47731 11.2816 4.30494 11.6494L9.875 14.125ZM9.875 14.125L13.375 10.625"
          )
        ]
      },
      {
        tag: "g",
        layer: "sent",
        transition: "state-fast",
        children: checkCircle(GREEN)
      },
      {
        tag: "g",
        layer: "failed",
        transition: "state-fast",
        children: [
          circleOutline(RED),
          {
            tag: "path",
            attrs: {
              d: "M12 8V12",
              stroke: RED,
              "stroke-width": "1.5",
              "stroke-linecap": "round"
            }
          },
          {
            tag: "circle",
            attrs: {
              cx: "12",
              cy: "15",
              r: "0.5",
              fill: RED,
              stroke: RED,
              "stroke-width": "1"
            }
          }
        ]
      }
    ]
  },
  "trash-alt": {
    size: 16,
    viewBox: "0 0 24 24",
    children: [{ tag: "path", attrs: { d: `${TRASH_HEAD} ${TRASH_ALT_TAIL}`, fill: STROKE } }]
  },
  gear: {
    size: 16,
    viewBox: "0 0 24 24",
    children: [
      strokePath(
        "M10.6504 5.81117C10.9939 4.39628 13.0061 4.39628 13.3496 5.81117C13.5715 6.72517 14.6187 7.15891 15.4219 6.66952C16.6652 5.91193 18.0881 7.33479 17.3305 8.57815C16.8411 9.38134 17.2748 10.4285 18.1888 10.6504C19.6037 10.9939 19.6037 13.0061 18.1888 13.3496C17.2748 13.5715 16.8411 14.6187 17.3305 15.4219C18.0881 16.6652 16.6652 18.0881 15.4219 17.3305C14.6187 16.8411 13.5715 17.2748 13.3496 18.1888C13.0061 19.6037 10.9939 19.6037 10.6504 18.1888C10.4285 17.2748 9.38135 16.8411 8.57815 17.3305C7.33479 18.0881 5.91193 16.6652 6.66952 15.4219C7.15891 14.6187 6.72517 13.5715 5.81117 13.3496C4.39628 13.0061 4.39628 10.9939 5.81117 10.6504C6.72517 10.4285 7.15891 9.38134 6.66952 8.57815C5.91193 7.33479 7.33479 5.91192 8.57815 6.66952C9.38135 7.15891 10.4285 6.72517 10.6504 5.81117Z"
      ),
      {
        tag: "circle",
        attrs: { cx: "12", cy: "12", r: "2.5", stroke: STROKE, "stroke-width": "1.5" }
      }
    ]
  },
  "xmark-large": {
    size: 24,
    viewBox: "0 0 24 24",
    children: [
      {
        tag: "path",
        attrs: {
          d: "M16.7198 6.21973C17.0127 5.92683 17.4874 5.92683 17.7803 6.21973C18.0732 6.51262 18.0732 6.9874 17.7803 7.28027L13.0606 12L17.7803 16.7197C18.0732 17.0126 18.0732 17.4874 17.7803 17.7803C17.4875 18.0731 17.0127 18.0731 16.7198 17.7803L12.0001 13.0605L7.28033 17.7803C6.98746 18.0731 6.51268 18.0731 6.21979 17.7803C5.92689 17.4874 5.92689 17.0126 6.21979 16.7197L10.9395 12L6.21979 7.28027C5.92689 6.98738 5.92689 6.51262 6.21979 6.21973C6.51268 5.92683 6.98744 5.92683 7.28033 6.21973L12.0001 10.9395L16.7198 6.21973Z",
          fill: STROKE
        }
      }
    ]
  },
  xmark: {
    size: 16,
    viewBox: "0 0 24 24",
    clip: true,
    children: [strokePath("M16.25 16.25L7.75 7.75"), strokePath("M7.75 16.25L16.25 7.75")]
  },
  close: {
    size: 16,
    viewBox: "0 0 16 16",
    children: [
      {
        tag: "path",
        attrs: {
          d: "M4 4l8 8M12 4l-8 8",
          stroke: STROKE,
          "stroke-width": "1.5",
          "stroke-linecap": "round"
        }
      }
    ]
  },
  "check-small": {
    size: 14,
    viewBox: "0 0 14 14",
    children: [strokePath("M3.9375 7L6.125 9.1875L10.5 4.8125")]
  },
  "chevron-left": {
    size: 16,
    viewBox: "0 0 16 16",
    children: [strokePath("M8.5 3.5L4 8L8.5 12.5")]
  },
  "chevron-right": {
    size: 16,
    viewBox: "0 0 16 16",
    children: [strokePath("M8.5 11.5L12 8L8.5 4.5")]
  },
  sun: {
    size: 16,
    viewBox: "0 0 20 20",
    children: [
      strokePath(
        "M9.99999 12.7082C11.4958 12.7082 12.7083 11.4956 12.7083 9.99984C12.7083 8.50407 11.4958 7.2915 9.99999 7.2915C8.50422 7.2915 7.29166 8.50407 7.29166 9.99984C7.29166 11.4956 8.50422 12.7082 9.99999 12.7082Z",
        "1.25"
      ),
      ...SUN_RAYS.map((d) => strokePath(d, "1.25"))
    ]
  },
  moon: {
    size: 16,
    viewBox: "0 0 20 20",
    children: [
      strokePath(
        "M15.5 10.4955C15.4037 11.5379 15.0124 12.5314 14.3721 13.3596C13.7317 14.1878 12.8688 14.8165 11.8841 15.1722C10.8995 15.5278 9.83397 15.5957 8.81217 15.3679C7.79038 15.1401 6.8546 14.6259 6.11434 13.8857C5.37408 13.1454 4.85995 12.2096 4.63211 11.1878C4.40427 10.166 4.47215 9.10048 4.82781 8.11585C5.18346 7.13123 5.81218 6.26825 6.64039 5.62791C7.4686 4.98756 8.46206 4.59634 9.5045 4.5C8.89418 5.32569 8.60049 6.34302 8.67685 7.36695C8.75321 8.39087 9.19454 9.35339 9.92058 10.0794C10.6466 10.8055 11.6091 11.2468 12.6331 11.3231C13.657 11.3995 14.6743 11.1058 15.5 10.4955Z",
        "1.13793"
      )
    ]
  },
  trash: {
    size: 24,
    viewBox: "0 0 24 24",
    children: [{ tag: "path", attrs: { d: `${TRASH_HEAD} ${TRASH_TAIL}`, fill: STROKE } }]
  },
  edit: {
    size: 16,
    viewBox: "0 0 16 16",
    children: [
      strokePath(
        "M11.3799 6.9572L9.05645 4.63375M11.3799 6.9572L6.74949 11.5699C6.61925 11.6996 6.45577 11.791 6.277 11.8339L4.29549 12.3092C3.93194 12.3964 3.60478 12.0683 3.69297 11.705L4.16585 9.75693C4.20893 9.57947 4.29978 9.4172 4.42854 9.28771L9.05645 4.63375M11.3799 6.9572L12.3455 5.98759C12.9839 5.34655 12.9839 4.31002 12.3455 3.66897C11.7033 3.02415 10.6594 3.02415 10.0172 3.66897L9.06126 4.62892L9.05645 4.63375",
        "0.9"
      )
    ]
  },
  help: {
    size: 20,
    viewBox: "0 0 20 20",
    children: [
      {
        tag: "circle",
        attrs: { cx: "10", cy: "10", r: "5.375", stroke: STROKE, "stroke-width": "1.25" }
      },
      strokePath(
        "M8.5 8.5C8.73 7.85 9.31 7.49 10 7.5C10.86 7.51 11.5 8.13 11.5 9C11.5 10.08 10 10.5 10 10.5V10.75",
        "1.25"
      ),
      { tag: "circle", attrs: { cx: "10", cy: "12.625", r: "0.625", fill: STROKE } }
    ]
  },
  plus: {
    size: 16,
    viewBox: "0 0 16 16",
    children: [
      {
        tag: "path",
        attrs: {
          d: "M8 3v10M3 8h10",
          stroke: STROKE,
          "stroke-width": "1.5",
          "stroke-linecap": "round"
        }
      }
    ]
  },
  checkmark: {
    size: 16,
    viewBox: "0 0 24 24",
    clip: true,
    children: [strokePath("M16.25 8.75L10 15.25L7.25 12.25")]
  }
};
var TRANSITION_CLASS = {
  state: "ag-icon-state",
  "state-fast": "ag-icon-state-fast",
  fade: "ag-icon-fade",
  "fade-fast": "ag-icon-fade-fast"
};
var INITIAL_LAYERS = {
  "pause-play": { paused: false },
  eye: { open: true },
  copy: { copied: false },
  "send-arrow": { send: "idle" }
};
function build(environment, spec, parent) {
  const node = environment.createSvg(spec.tag, spec.attrs);
  if (spec.transition) node.classList.add(TRANSITION_CLASS[spec.transition]);
  if (spec.layer) node.setAttribute(LAYER_ATTR, spec.layer);
  for (const child of spec.children ?? []) build(environment, child, node);
  parent.append(node);
}
function createIcon(environment, name, size) {
  const spec = ICONS[name];
  const resolved = String(size ?? spec.size);
  const svg2 = environment.createSvg("svg", {
    width: resolved,
    height: resolved,
    viewBox: spec.viewBox,
    fill: "none",
    // Icon buttons always carry their own accessible label, so the glyph itself
    // stays out of the accessibility tree and out of the tab order.
    "aria-hidden": "true",
    focusable: "false"
  });
  svg2.dataset.agIcon = name;
  if (spec.clip) {
    const clipId = environment.randomId("agicon");
    const group = environment.createSvg("g", { "clip-path": `url(#${clipId})` });
    for (const child of spec.children) build(environment, child, group);
    const clipPath = environment.createSvg("clipPath", { id: clipId });
    clipPath.append(
      environment.createSvg("rect", { width: "24", height: "24", fill: "white" })
    );
    const defs = environment.createSvg("defs");
    defs.append(clipPath);
    svg2.append(group, defs);
  } else {
    for (const child of spec.children) build(environment, child, svg2);
  }
  const initial = INITIAL_LAYERS[name];
  if (initial) setIconState(svg2, initial);
  return svg2;
}
function show(layer, visible, scaled) {
  layer.classList.toggle("ag-icon-visible", visible && !scaled);
  layer.classList.toggle("ag-icon-visible-scaled", visible && scaled);
  layer.classList.toggle("ag-icon-hidden", !visible && !scaled);
  layer.classList.toggle("ag-icon-hidden-scaled", !visible && scaled);
  layer.classList.remove("ag-icon-sending");
}
function layerOf(node, name) {
  return node.querySelector(`[${LAYER_ATTR}="${name}"]`);
}
function setIconState(node, state) {
  const name = node.dataset.agIcon;
  if (!name) return;
  const signature = `${state.paused ?? ""}|${state.open ?? ""}|${state.copied ?? ""}|${state.tint ?? ""}|${state.send ?? ""}`;
  if (node.getAttribute(STATE_ATTR) === signature) return;
  node.setAttribute(STATE_ATTR, signature);
  if (name === "pause-play" && state.paused !== void 0) {
    const pause = layerOf(node, "pause");
    const play = layerOf(node, "play");
    if (pause) show(pause, !state.paused, false);
    if (play) show(play, state.paused, false);
    return;
  }
  if (name === "eye" && state.open !== void 0) {
    const open = layerOf(node, "open");
    const closed = layerOf(node, "closed");
    if (open) show(open, state.open, false);
    if (closed) show(closed, !state.open, false);
    return;
  }
  if (name === "copy") {
    if (state.copied !== void 0) {
      const copy = layerOf(node, "copy");
      const copied = layerOf(node, "copied");
      if (copy) show(copy, !state.copied, true);
      if (copied) show(copied, state.copied, true);
    }
    node.style.color = state.tint ?? "";
    node.style.transition = state.tint ? "color 0.3s ease" : "";
    return;
  }
  if (name === "send-arrow" && state.send !== void 0) {
    const arrow = layerOf(node, "arrow");
    const sent = layerOf(node, "sent");
    const failed = layerOf(node, "failed");
    if (arrow) {
      show(arrow, state.send === "idle", true);
      if (state.send === "sending") {
        arrow.classList.remove("ag-icon-hidden-scaled", "ag-icon-visible-scaled");
        arrow.classList.add("ag-icon-sending");
      }
    }
    if (sent) show(sent, state.send === "sent", true);
    if (failed) show(failed, state.send === "failed", true);
  }
}

// src/browser/view/layout.ts
var EXIT_MS = 180;
var CLEAR_MS = 200;
var PALETTE_EXIT_MS = 200;
var FOOTER_COLLAPSE_MS = 300;
var ROLL_MS = 250;
var EDITOR_EXIT_MS = 150;
var CONNECTOR_EXIT_MS = 250;
var OUTLINES_READY_MS = 380;
var MIN_CAPTURE_SIZE = 16;
var PALETTE_DRAG_THRESHOLD = 4;
var PLACE_DRAG_THRESHOLD = 5;
var SELECT_DRAG_THRESHOLD = 4;
var MOVE_DRAG_THRESHOLD = 2;
var PREVIEW_RAMP = 180;
var NUDGE_STEP = 1;
var NUDGE_STEP_SHIFT = 20;
var NUDGE_SYNC_MS = 300;
var SKIP_TAGS2 = {
  script: true,
  style: true,
  noscript: true,
  link: true,
  meta: true,
  br: true,
  hr: true
};
var TEXT_TYPES = {
  text: true,
  hero: true,
  button: true,
  badge: true,
  cta: true,
  toast: true,
  modal: true,
  card: true,
  navigation: true,
  tabs: true,
  input: true,
  search: true,
  breadcrumb: true,
  pricing: true,
  testimonial: true,
  alert: true,
  banner: true,
  tag: true,
  notification: true,
  stat: true,
  productCard: true
};
var TEXT_PLACEHOLDERS = {
  hero: "Headline text",
  button: "Button label",
  badge: "Badge label",
  cta: "Call to action text",
  toast: "Notification message",
  modal: "Dialog title",
  card: "Card title",
  navigation: "Brand / nav items",
  tabs: "Tab labels",
  input: "Placeholder text",
  search: "Search placeholder",
  pricing: "Plan name or price",
  testimonial: "Quote text",
  alert: "Alert message",
  banner: "Banner text",
  tag: "Tag label",
  notification: "Notification message",
  stat: "Metric value",
  productCard: "Product name"
};
var PALETTE_DESCRIPTION = "Rearrange and resize existing elements, add new components, and explore layout ideas. Agent results may vary.";
var PALETTE_DOC_URL = "https://agentation.dev/features#layout-mode";
var S = "currentColor";
var SW = "0.5";
function sr(x, y, w, h, rx, extra) {
  return ["rect", { x: `${x}`, y: `${y}`, width: `${w}`, height: `${h}`, rx: `${rx}`, stroke: S, "stroke-width": SW, ...extra }];
}
function fr(x, y, w, h, rx, opacity) {
  return ["rect", { x: `${x}`, y: `${y}`, width: `${w}`, height: `${h}`, rx: `${rx}`, fill: S, opacity }];
}
function ln(x1, y1, x2, y2, width, opacity) {
  const attributes = {
    x1: `${x1}`,
    y1: `${y1}`,
    x2: `${x2}`,
    y2: `${y2}`,
    stroke: S,
    "stroke-width": width
  };
  if (opacity !== void 0) attributes.opacity = opacity;
  return ["line", attributes];
}
function cs(cx, cy, r, extra) {
  return ["circle", { cx: `${cx}`, cy: `${cy}`, r: `${r}`, stroke: S, "stroke-width": SW, ...extra }];
}
function cf(cx, cy, r, opacity) {
  return ["circle", { cx: `${cx}`, cy: `${cy}`, r: `${r}`, fill: S, opacity }];
}
function pa(d, extra) {
  return ["path", { d, stroke: S, "stroke-width": SW, ...extra }];
}
function tx(x, y, content, extra) {
  return [
    "text",
    { x: `${x}`, y: `${y}`, "font-size": "4", fill: S, ...extra },
    content
  ];
}
var PALETTE_GLYPHS = {
  navigation: [sr(1, 4, 18, 8, 1), fr(2.5, 7, 3, 1.5, 0.5, ".4"), fr(7, 7, 2.5, 1.5, 0.5, ".25"), fr(11, 7, 2.5, 1.5, 0.5, ".25")],
  header: [sr(1, 2, 18, 12, 1), fr(3, 5.5, 8, 2, 0.5, ".35"), fr(3, 9, 12, 1, 0.5, ".15")],
  hero: [sr(1, 1, 18, 14, 1), fr(5, 5, 10, 1.5, 0.5, ".35"), fr(7, 8, 6, 1, 0.5, ".15"), sr(7.5, 10.5, 5, 2.5, 1)],
  section: [sr(1, 1, 18, 14, 1), fr(3, 4, 6, 1, 0.5, ".3"), fr(3, 6.5, 14, 1, 0.5, ".15"), fr(3, 9, 10, 1, 0.5, ".15")],
  sidebar: [sr(1, 1, 7, 14, 1), fr(2.5, 4, 4, 1, 0.5, ".3"), fr(2.5, 6.5, 3.5, 1, 0.5, ".15"), fr(2.5, 9, 4, 1, 0.5, ".15")],
  footer: [sr(1, 7, 18, 8, 1), fr(3, 9.5, 4, 1, 0.5, ".25"), fr(9, 9.5, 4, 1, 0.5, ".25"), fr(15, 9.5, 3, 1, 0.5, ".2")],
  modal: [sr(3, 2, 14, 12, 1.5), fr(5, 4.5, 7, 1, 0.5, ".3"), fr(5, 7, 10, 1, 0.5, ".15"), sr(11, 11, 5, 2, 0.75)],
  divider: [ln(2, 8, 18, 8, "0.5", ".3")],
  card: [sr(2, 1, 16, 14, 1.5), fr(2, 1, 16, 5.5, 1, ".04"), fr(4, 8.5, 8, 1, 0.5, ".25"), fr(4, 11, 11, 1, 0.5, ".12")],
  text: [fr(2, 4, 14, 1.5, 0.5, ".3"), fr(2, 7, 11, 1, 0.5, ".15"), fr(2, 9.5, 13, 1, 0.5, ".15"), fr(2, 12, 8, 1, 0.5, ".12")],
  image: [sr(2, 2, 16, 12, 1), ln(2, 2, 18, 14, ".3", ".25"), ln(18, 2, 2, 14, ".3", ".25")],
  video: [sr(2, 2, 16, 12, 1), pa("M8.5 5.5v5l4.5-2.5z", { fill: S, opacity: ".15" })],
  table: [
    sr(1, 2, 18, 12, 1),
    ln(1, 5.5, 19, 5.5, ".3", ".25"),
    ln(1, 9, 19, 9, ".3", ".25"),
    ln(7, 2, 7, 14, ".3", ".25"),
    ln(13, 2, 13, 14, ".3", ".25")
  ],
  grid: [sr(1.5, 2, 7, 5.5, 1), sr(11.5, 2, 7, 5.5, 1), sr(1.5, 9.5, 7, 5.5, 1), sr(11.5, 9.5, 7, 5.5, 1)],
  list: [
    cs(3.5, 4.5, 1),
    fr(6.5, 4, 10, 1, 0.5, ".2"),
    cs(3.5, 8, 1),
    fr(6.5, 7.5, 8, 1, 0.5, ".2"),
    cs(3.5, 11.5, 1),
    fr(6.5, 11, 11, 1, 0.5, ".2")
  ],
  chart: [fr(3, 9, 2.5, 4, 0.5, ".2"), fr(7, 6, 2.5, 7, 0.5, ".25"), fr(11, 3, 2.5, 10, 0.5, ".3"), fr(15, 5, 2.5, 8, 0.5, ".2")],
  accordion: [sr(1.5, 2, 17, 4, 1), fr(3, 3.5, 6, 1, 0.5, ".25"), sr(1.5, 7.5, 17, 3, 1), sr(1.5, 12, 17, 3, 1)],
  carousel: [
    sr(3, 2, 14, 10, 1),
    pa("M1.5 7L3 8.5 1.5 10", { opacity: ".35" }),
    pa("M18.5 7L17 8.5 18.5 10", { opacity: ".35" }),
    cf(8.5, 14, 0.6, ".35"),
    cf(10, 14, 0.6, ".15"),
    cf(11.5, 14, 0.6, ".15")
  ],
  button: [sr(3, 5, 14, 6, 2), fr(6.5, 7.5, 7, 1, 0.5, ".25")],
  input: [fr(2, 4, 5.5, 1, 0.5, ".25"), sr(2, 6.5, 16, 5.5, 1), fr(3.5, 8.5, 7, 1, 0.5, ".12")],
  search: [
    sr(2, 4.5, 16, 7, 3.5),
    cs(6, 8, 2, { opacity: ".3" }),
    ln(7.5, 9.5, 9, 11, SW, ".3"),
    fr(9.5, 7.5, 6, 1, 0.5, ".12")
  ],
  form: [
    fr(2, 1.5, 5.5, 1, 0.5, ".25"),
    sr(2, 3.5, 16, 3, 0.75),
    fr(2, 8, 7, 1, 0.5, ".25"),
    sr(2, 10, 16, 3, 0.75),
    sr(12, 14, 6, 2, 0.75)
  ],
  tabs: [sr(1, 5, 18, 10, 1), sr(1, 2, 6, 3.5, 0.75), fr(2.5, 3.25, 3, 1, 0.5, ".25"), sr(7, 2, 6, 3.5, 0.75)],
  dropdown: [
    sr(2, 2, 16, 4, 1),
    fr(3.5, 3.5, 7, 1, 0.5, ".2"),
    pa("M15 3.5l1.5 1.5L18 3.5", { opacity: ".3" }),
    sr(2, 7, 16, 7, 1, { "stroke-dasharray": "2 1", opacity: ".3" })
  ],
  toggle: [sr(4, 5, 12, 6, 3), cf(13, 8, 2, ".3")],
  avatar: [cs(10, 8, 6), cs(10, 6.5, 2), pa("M6.5 13c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5")],
  badge: [sr(3, 5, 14, 6, 3), fr(6, 7.5, 8, 1, 0.5, ".25")],
  breadcrumb: [
    fr(1.5, 7, 3.5, 1, 0.5, ".3"),
    pa("M6.5 7l1 1-1 1", { opacity: ".2" }),
    fr(9, 7, 3.5, 1, 0.5, ".2"),
    pa("M14 7l1 1-1 1", { opacity: ".2" }),
    fr(16.5, 7, 2, 1, 0.5, ".15")
  ],
  pagination: [
    sr(2, 5.5, 3.5, 5, 1),
    sr(6.5, 5.5, 3.5, 5, 1),
    sr(11, 5.5, 3.5, 5, 1, { fill: S, opacity: ".15" }),
    sr(15.5, 5.5, 3.5, 5, 1)
  ],
  progress: [sr(2, 7, 16, 2, 1), fr(2, 7, 10, 2, 1, ".2")],
  toast: [sr(2, 4, 16, 8, 1.5), cs(5, 8, 1.5, { opacity: ".3" }), fr(8, 6.5, 7, 1, 0.5, ".25"), fr(8, 9, 5, 1, 0.5, ".12")],
  tooltip: [sr(3, 3, 14, 7, 1.5), fr(5.5, 5.5, 9, 1, 0.5, ".25"), pa("M9 10l1 2.5 1-2.5")],
  pricing: [
    sr(2, 1, 16, 14, 1.5),
    fr(6, 3, 8, 1.5, 0.5, ".25"),
    fr(7, 5.5, 6, 2, 0.5, ".15"),
    fr(5, 9, 10, 1, 0.5, ".1"),
    fr(5, 11, 10, 1, 0.5, ".1"),
    fr(6, 13, 8, 1.5, 0.5, ".2")
  ],
  testimonial: [
    sr(2, 1, 16, 14, 1.5),
    tx(4, 5.5, "\u201C", { opacity: ".2", "font-family": "serif" }),
    fr(4, 7, 12, 1, 0.5, ".15"),
    fr(4, 9, 9, 1, 0.5, ".12"),
    cs(5.5, 12.5, 1.5, { opacity: ".25" }),
    fr(8, 12, 5, 1, 0.5, ".15")
  ],
  cta: [sr(1, 2, 18, 12, 1), fr(5, 4.5, 10, 1.5, 0.5, ".3"), fr(6, 7.5, 8, 1, 0.5, ".15"), sr(7, 10, 6, 2.5, 1)],
  alert: [
    sr(2, 4, 16, 8, 1.5),
    cs(6, 8, 2, { opacity: ".3" }),
    ln(6, 7, 6, 8.5, "0.6", ".5"),
    cf(6, 9.3, 0.3, ".5"),
    fr(9.5, 7, 6, 1, 0.5, ".2")
  ],
  banner: [sr(1, 5, 18, 6, 1), fr(4, 7.5, 8, 1, 0.5, ".25"), sr(14, 7, 3.5, 2, 0.75)],
  stat: [sr(3, 2, 14, 12, 1.5), fr(6, 4.5, 8, 1, 0.5, ".15"), fr(5, 7, 10, 2.5, 0.5, ".3"), fr(7, 11, 6, 1, 0.5, ".12")],
  stepper: [
    cs(4, 8, 2, { fill: S, opacity: ".2" }),
    ln(6, 8, 8, 8, ".4", ".3"),
    cs(10, 8, 2),
    ln(12, 8, 14, 8, ".4", ".3"),
    cs(16, 8, 2)
  ],
  tag: [
    sr(3, 5, 14, 6, 1.5),
    fr(5.5, 7.5, 6, 1, 0.5, ".25"),
    ln(14, 6.5, 15.5, 9.5, SW, ".2"),
    ln(15.5, 6.5, 14, 9.5, SW, ".2")
  ],
  rating: [
    ["path", { d: "M4 5.5l1 2 2.2.3-1.6 1.5.4 2.2L4 10.3l-2 1.2.4-2.2L.8 7.8 3 7.5z", fill: S, opacity: ".25" }],
    ["path", { d: "M10 5.5l1 2 2.2.3-1.6 1.5.4 2.2L10 10.3l-2 1.2.4-2.2L6.8 7.8 9 7.5z", fill: S, opacity: ".25" }],
    pa("M16 5.5l1 2 2.2.3-1.6 1.5.4 2.2L16 10.3l-2 1.2.4-2.2-1.6-1.5 2.2-.3z", { opacity: ".25" })
  ],
  map: [
    sr(2, 2, 16, 12, 1),
    ln(2, 6, 18, 10, ".3", ".15"),
    ln(7, 2, 11, 14, ".3", ".15"),
    pa("M10 5c-1.7 0-3 1.3-3 3 0 2.5 3 5 3 5s3-2.5 3-5c0-1.7-1.3-3-3-3z", { fill: S, opacity: ".15" })
  ],
  timeline: [
    ln(5, 2, 5, 14, ".4", ".25"),
    cs(5, 4, 1.5, { fill: S, opacity: ".2" }),
    fr(8, 3, 8, 1, 0.5, ".25"),
    cs(5, 8.5, 1.5),
    fr(8, 7.5, 6, 1, 0.5, ".15"),
    cs(5, 13, 1.5),
    fr(8, 12, 7, 1, 0.5, ".15")
  ],
  fileUpload: [
    sr(3, 2, 14, 12, 1.5, { "stroke-dasharray": "2 1" }),
    pa("M10 10V5.5m0 0L7.5 8m2.5-2.5L12.5 8", { opacity: ".3" }),
    fr(7, 11.5, 6, 1, 0.5, ".15")
  ],
  codeBlock: [
    sr(2, 2, 16, 12, 1),
    cf(4, 4, 0.6, ".3"),
    cf(5.5, 4, 0.6, ".3"),
    cf(7, 4, 0.6, ".3"),
    fr(4, 7, 7, 1, 0.5, ".2"),
    fr(6, 9, 5, 1, 0.5, ".15"),
    fr(4, 11, 8, 1, 0.5, ".12")
  ],
  calendar: [
    sr(2, 3, 16, 12, 1),
    ln(2, 6.5, 18, 6.5, ".4", ".25"),
    fr(5, 4, 1, 1.5, 0.3, ".2"),
    fr(14, 4, 1, 1.5, 0.3, ".2"),
    cf(7, 9, 0.6, ".2"),
    cf(10, 9, 0.6, ".2"),
    cf(13, 9, 0.6, ".3"),
    cf(7, 12, 0.6, ".2"),
    cf(10, 12, 0.6, ".2")
  ],
  notification: [
    sr(2, 3, 16, 10, 1.5),
    cs(5.5, 8, 2, { opacity: ".25" }),
    fr(9, 6, 6, 1, 0.5, ".25"),
    fr(9, 8.5, 4.5, 1, 0.5, ".12"),
    cf(16.5, 4.5, 1.5, ".25")
  ],
  productCard: [
    sr(3, 1, 14, 14, 1.5),
    fr(3, 1, 14, 6, 1, ".04"),
    fr(5, 8.5, 7, 1, 0.5, ".25"),
    fr(5, 10.5, 4, 1.5, 0.5, ".15"),
    sr(12, 12, 4, 2, 0.75)
  ],
  profile: [cs(10, 5, 3), fr(5, 10, 10, 1.5, 0.5, ".25"), fr(7, 12.5, 6, 1, 0.5, ".12")],
  drawer: [
    sr(9, 1, 10, 14, 1),
    fr(10.5, 4, 5, 1, 0.5, ".25"),
    fr(10.5, 6.5, 7, 1, 0.5, ".15"),
    fr(10.5, 9, 6, 1, 0.5, ".15"),
    sr(1, 1, 7, 14, 1, { opacity: ".15" })
  ],
  popover: [sr(3, 2, 14, 9, 1.5), fr(5, 4.5, 8, 1, 0.5, ".25"), fr(5, 7, 6, 1, 0.5, ".15"), pa("M9 11l1 2.5 1-2.5")],
  logo: [sr(2, 3, 10, 10, 2), pa("M5 9.5l2-4 2 4", { opacity: ".3" }), fr(14, 6, 4, 1, 0.5, ".2"), fr(14, 8.5, 3, 1, 0.5, ".12")],
  faq: [
    tx(2.5, 5.5, "?", { opacity: ".3", "font-weight": "bold" }),
    fr(7, 3, 10, 1, 0.5, ".25"),
    fr(7, 5.5, 8, 1, 0.5, ".12"),
    tx(2.5, 11.5, "?", { opacity: ".3", "font-weight": "bold" }),
    fr(7, 9, 9, 1, 0.5, ".25"),
    fr(7, 11.5, 7, 1, 0.5, ".12")
  ],
  gallery: [
    sr(1.5, 1.5, 5, 5, 0.75),
    sr(7.5, 1.5, 5, 5, 0.75),
    sr(13.5, 1.5, 5, 5, 0.75),
    sr(1.5, 9.5, 5, 5, 0.75),
    sr(7.5, 9.5, 5, 5, 0.75),
    sr(13.5, 9.5, 5, 5, 0.75)
  ],
  checkbox: [sr(5, 4, 8, 8, 1.5), pa("M7.5 8l1.5 1.5 3-3", { opacity: ".35" })],
  radio: [cs(10, 8, 4), cf(10, 8, 2, ".3")],
  slider: [fr(2, 7.5, 16, 1, 0.5, ".15"), fr(2, 7.5, 10, 1, 0.5, ".25"), cs(12, 8, 2.5)],
  datePicker: [
    sr(2, 1, 16, 5, 1),
    fr(3.5, 3, 5, 1, 0.5, ".2"),
    fr(14, 2.5, 2.5, 2, 0.5, ".12"),
    sr(2, 7, 16, 8, 1, { "stroke-dasharray": "2 1", opacity: ".3" }),
    cf(6, 10, 0.6, ".2"),
    cf(10, 10, 0.6, ".3"),
    cf(14, 10, 0.6, ".2"),
    cf(6, 13, 0.6, ".2"),
    cf(10, 13, 0.6, ".2")
  ],
  skeleton: [fr(2, 2, 16, 3, 1, ".08"), fr(2, 7, 10, 2, 0.75, ".08"), fr(2, 11, 13, 2, 0.75, ".08")],
  chip: [
    sr(1.5, 5, 10, 6, 3, { fill: S, opacity: ".08" }),
    fr(4, 7.5, 4, 1, 0.5, ".25"),
    ln(9.5, 6.5, 10.5, 9.5, SW, ".2"),
    ln(10.5, 6.5, 9.5, 9.5, SW, ".2"),
    sr(13, 5, 5.5, 6, 3, { opacity: ".25" })
  ],
  icon: [pa("M10 3l1.5 3 3.5.5-2.5 2.5.5 3.5L10 11l-3 1.5.5-3.5L5 6.5l3.5-.5z", { opacity: ".3" })],
  spinner: [
    cs(10, 8, 5, { opacity: ".12" }),
    pa("M10 3a5 5 0 0 1 5 5", { opacity: ".35", "stroke-linecap": "round" })
  ],
  feature: [
    sr(2, 2, 5, 5, 1.5),
    pa("M4.5 3.5v3m-1.5-1.5h3", { opacity: ".25" }),
    fr(9, 2.5, 8, 1.5, 0.5, ".25"),
    fr(9, 5.5, 6, 1, 0.5, ".12"),
    sr(2, 10, 5, 5, 1.5),
    fr(9, 10.5, 7, 1.5, 0.5, ".25"),
    fr(9, 13.5, 5, 1, 0.5, ".12")
  ],
  team: [
    cs(5, 5, 2.5),
    fr(2.5, 9, 5, 1, 0.5, ".2"),
    cs(15, 5, 2.5),
    fr(12.5, 9, 5, 1, 0.5, ".2"),
    cs(10, 5, 2.5, { opacity: ".5" }),
    fr(7.5, 9, 5, 1, 0.5, ".15"),
    fr(4, 12, 12, 1, 0.5, ".1")
  ],
  login: [
    sr(3, 1, 14, 14, 1.5),
    fr(6, 3, 8, 1.5, 0.5, ".25"),
    sr(5, 5.5, 10, 3, 0.75),
    sr(5, 9.5, 10, 3, 0.75),
    fr(6.5, 13.5, 7, 2, 0.75, ".2")
  ],
  contact: [
    sr(2, 1, 16, 14, 1.5),
    fr(4, 3, 5, 1, 0.5, ".2"),
    sr(4, 5, 12, 2.5, 0.75),
    sr(4, 8.5, 12, 4, 0.75),
    fr(11, 13.5, 5, 1.5, 0.5, ".2")
  ]
};
var WIREFRAME_GLYPH = [
  ["rect", { x: "1", y: "1", width: "12", height: "12", rx: "2", stroke: S, "stroke-width": "1" }],
  ...[4.5, 7, 9.5].flatMap((cy) => [4.5, 7, 9.5].map((cx) => cf(cx, cy, 0.8, ".6")))
];
var EDGE_ARROWS = {
  n: [["path", { d: "M4 0.5L1 4.5h6z", fill: "currentColor" }]],
  e: [["path", { d: "M5.5 4L1.5 1v6z", fill: "currentColor" }]],
  s: [["path", { d: "M4 5.5L1 1.5h6z", fill: "currentColor" }]],
  w: [["path", { d: "M0.5 4L4.5 1v6z", fill: "currentColor" }]]
};
var EDGE_ARROW_SIZE = {
  n: [8, 6],
  e: [6, 8],
  s: [8, 6],
  w: [6, 8]
};
function unionBox(boxes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box2 of boxes) {
    minX = Math.min(minX, box2.x);
    minY = Math.min(minY, box2.y);
    maxX = Math.max(maxX, box2.x + box2.width);
    maxY = Math.max(maxY, box2.y + box2.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
function rectChanged(section) {
  const o = section.originalRect;
  const c = section.currentRect;
  return Math.abs(o.x - c.x) > 1 || Math.abs(o.y - c.y) > 1 || Math.abs(o.width - c.width) > 1 || Math.abs(o.height - c.height) > 1;
}
function rectMoved(section) {
  const o = section.originalRect;
  const c = section.currentRect;
  return Math.abs(o.x - c.x) > 1 || Math.abs(o.y - c.y) > 1;
}
function rectResized(section) {
  const o = section.originalRect;
  const c = section.currentRect;
  return Math.abs(o.width - c.width) > 1 || Math.abs(o.height - c.height) > 1;
}
function restartAnimation(node) {
  node.style.animation = "none";
  void node.offsetWidth;
  node.style.animation = "";
}
function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}
function createLayoutRegion(environment, dispatch) {
  const controller = new environment.AbortController();
  const { signal } = controller;
  const timers = /* @__PURE__ */ new Set();
  function later(handler, delay) {
    const handle = environment.timers.setTimeout(() => {
      timers.delete(handle);
      handler();
    }, delay);
    timers.add(handle);
    return handle;
  }
  function cancel(handle) {
    if (handle === void 0) return;
    timers.delete(handle);
    environment.timers.clearTimeout(handle);
  }
  function button(className, label2) {
    const node = environment.createElement("button", className);
    node.type = "button";
    if (label2 !== void 0) node.setAttribute("aria-label", label2);
    return node;
  }
  function glyph(shapes, width, height) {
    const svg2 = environment.createSvg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width: `${width}`,
      height: `${height}`,
      fill: "none",
      "aria-hidden": "true",
      focusable: "false"
    });
    for (const [tag, attributes, content] of shapes) {
      const child = environment.createSvg(tag, attributes);
      if (content !== void 0) child.textContent = content;
      svg2.appendChild(child);
    }
    return svg2;
  }
  let model = null;
  let placements = [];
  let rearrange = null;
  const selection = { placements: /* @__PURE__ */ new Set(), sections: /* @__PURE__ */ new Set() };
  const exitingPlacements = /* @__PURE__ */ new Set();
  const exitingSections = /* @__PURE__ */ new Set();
  let gesture = null;
  let guides = [];
  let hoverBox = null;
  let sizeIndicator = null;
  let drawBox = null;
  let selectBox = null;
  let sectionDragDelta = null;
  let outlinesReady = true;
  let outlinesReadyTimer;
  const firstAction = /* @__PURE__ */ new Map();
  let previousChangedIds = /* @__PURE__ */ new Set();
  const lastChangedRects = /* @__PURE__ */ new Map();
  const exitingConnectors = /* @__PURE__ */ new Map();
  let nudgeSyncTimer;
  let editor = null;
  let editorExitTimer;
  let paletteMounted = false;
  let paletteExitTimer;
  let paletteEnterFrame;
  let footerVisible = false;
  let footerCollapsed = true;
  let footerHideTimer;
  let lastFooterCount = 0;
  let lastFooterSuffix = "";
  let rollValue = 0;
  let rollSuffix = "";
  let rollTimer;
  const root = environment.createElement("div", "ag-layout");
  root.setAttribute("data-agentation-ui", "");
  const anchor = environment.createElement("div", "ag-layout-anchor");
  const palette = environment.createElement("div", "ag-layout-palette");
  palette.setAttribute("role", "dialog");
  palette.setAttribute("aria-label", "Layout Mode");
  palette.hidden = true;
  anchor.appendChild(palette);
  const paletteHeader = environment.createElement("div", "ag-layout-palette-header");
  const paletteTitle = environment.createElement("div", "ag-layout-palette-title");
  paletteTitle.textContent = "Layout Mode";
  const paletteDesc = environment.createElement("div", "ag-layout-palette-desc");
  paletteDesc.append(environment.document.createTextNode(`${PALETTE_DESCRIPTION} `));
  const paletteLink = environment.createElement("a");
  paletteLink.href = PALETTE_DOC_URL;
  paletteLink.target = "_blank";
  paletteLink.rel = "noopener noreferrer";
  paletteLink.textContent = "Learn more.";
  paletteDesc.appendChild(paletteLink);
  paletteHeader.append(paletteTitle, paletteDesc);
  const wireframeToggle = button("ag-layout-canvas-toggle");
  const wireframeIcon = environment.createElement("span", "ag-layout-canvas-toggle-icon");
  wireframeIcon.appendChild(glyph(WIREFRAME_GLYPH, 14, 14));
  const wireframeLabel = environment.createElement("span", "ag-layout-canvas-toggle-label");
  wireframeLabel.textContent = "Wireframe New Page";
  wireframeToggle.append(wireframeIcon, wireframeLabel);
  const purposeWrap = environment.createElement("div", "ag-layout-purpose-wrap");
  const purposeInner = environment.createElement("div", "ag-layout-purpose-inner");
  const purposeLabel = environment.createElement("label", "ag-visually-hidden");
  purposeLabel.htmlFor = "ag-layout-purpose";
  purposeLabel.textContent = "Wireframe page description";
  const purposeInput = environment.createElement("textarea", "ag-layout-purpose-input");
  purposeInput.id = "ag-layout-purpose";
  purposeInput.rows = 2;
  purposeInput.placeholder = "Describe this page to provide additional context for your agent.";
  purposeInner.append(purposeLabel, purposeInput);
  purposeWrap.appendChild(purposeInner);
  const paletteScroll = environment.createElement("div", "ag-layout-scroll");
  const paletteItems = /* @__PURE__ */ new Map();
  for (const section of COMPONENT_REGISTRY) {
    const group = environment.createElement("div", "ag-layout-palette-section");
    const title = environment.createElement("div", "ag-layout-palette-section-title");
    title.textContent = section.section;
    group.appendChild(title);
    for (const item of section.items) {
      const node = button("ag-layout-item");
      node.setAttribute("aria-pressed", "false");
      const icon = environment.createElement("span", "ag-layout-item-icon");
      icon.appendChild(glyph(PALETTE_GLYPHS[item.type], 20, 16));
      const label2 = environment.createElement("span", "ag-layout-item-label");
      label2.textContent = item.label;
      node.append(icon, label2);
      node.dataset.component = item.type;
      group.appendChild(node);
      paletteItems.set(item.type, node);
    }
    paletteScroll.appendChild(group);
  }
  const footerWrap = environment.createElement("div", "ag-layout-footer-wrap");
  const footerInner = environment.createElement("div", "ag-layout-footer-inner");
  const footerContent = environment.createElement("div", "ag-layout-footer-content");
  const footer = environment.createElement("div", "ag-layout-footer");
  const footerCount = environment.createElement("span", "ag-layout-footer-count");
  const countStatic = environment.createElement("span", "ag-layout-count-static");
  const rollWrap = environment.createElement("span", "ag-layout-rolling-wrap");
  const rollGhost = environment.createElement("span", "ag-layout-rolling-ghost");
  const rollOld = environment.createElement("span", "ag-layout-rolling-num");
  const rollNew = environment.createElement("span", "ag-layout-rolling-num");
  rollWrap.append(rollGhost, rollOld, rollNew);
  rollWrap.hidden = true;
  const rollTail = environment.document.createTextNode("");
  footerCount.append(countStatic, rollWrap, rollTail);
  const footerClear = button("ag-layout-footer-clear");
  footerClear.textContent = "Clear";
  footer.append(footerCount, footerClear);
  footerContent.appendChild(footer);
  footerInner.appendChild(footerContent);
  footerWrap.appendChild(footerInner);
  footerWrap.hidden = true;
  palette.append(paletteHeader, wireframeToggle, purposeWrap, paletteScroll, footerWrap);
  const placementLayer = environment.createElement("div", "ag-layout-overlay");
  const placementNodes = /* @__PURE__ */ new Map();
  const rearrangeLayer = environment.createElement("div", "ag-layout-rearrange");
  const hoverHighlight = environment.createElement("div", "ag-layout-hover-highlight");
  hoverHighlight.hidden = true;
  rearrangeLayer.appendChild(hoverHighlight);
  const sectionNodes = /* @__PURE__ */ new Map();
  const connectorSvg = environment.createSvg("svg", { "aria-hidden": "true" });
  connectorSvg.setAttribute("class", "ag-layout-connectors");
  const connectorDefs = environment.createSvg("defs");
  const dotShadow = environment.createSvg("filter", {
    id: "ag-layout-connector-dot-shadow",
    x: "-50%",
    y: "-50%",
    width: "200%",
    height: "200%"
  });
  dotShadow.appendChild(
    environment.createSvg("feDropShadow", { dx: "0", dy: "0.5", stdDeviation: "1", "flood-opacity": "0.15" })
  );
  connectorDefs.appendChild(dotShadow);
  connectorSvg.appendChild(connectorDefs);
  const connectorNodes = [];
  connectorSvg.toggleAttribute("hidden", true);
  const drawBoxNode = environment.createElement("div", "ag-layout-draw-box");
  drawBoxNode.hidden = true;
  const selectBoxNode = environment.createElement("div", "ag-layout-select-box");
  selectBoxNode.hidden = true;
  const sizeIndicatorNode = environment.createElement("div", "ag-layout-size-indicator");
  sizeIndicatorNode.hidden = true;
  const dragPreview = environment.createElement("div", "ag-layout-drag-preview");
  dragPreview.hidden = true;
  const guideNodes = [];
  const guideLayer = environment.createElement("div", "ag-layout-guides");
  const editorNode = environment.createElement("div", "ag-layout-editor");
  editorNode.setAttribute("role", "dialog");
  editorNode.hidden = true;
  const editorHeader = environment.createElement("div", "ag-layout-editor-header");
  const editorElement = environment.createElement("span", "ag-layout-editor-element");
  editorHeader.appendChild(editorElement);
  const editorLabel = environment.createElement("label", "ag-visually-hidden");
  editorLabel.htmlFor = "ag-layout-editor-input";
  editorLabel.textContent = "Text";
  const editorInput = environment.createElement("textarea", "ag-layout-editor-textarea");
  editorInput.id = "ag-layout-editor-input";
  editorInput.rows = 2;
  const editorActions = environment.createElement("div", "ag-layout-editor-actions");
  const editorDeleteWrap = environment.createElement("div", "ag-layout-editor-delete-wrapper");
  const editorDelete = button("ag-layout-editor-delete", "Delete text");
  editorDelete.appendChild(createIcon(environment, "trash", 22));
  editorDeleteWrap.appendChild(editorDelete);
  const editorCancel = button("ag-layout-editor-cancel");
  editorCancel.textContent = "Cancel";
  const editorSubmit = button("ag-layout-editor-submit");
  editorActions.append(editorDeleteWrap, editorCancel, editorSubmit);
  editorNode.append(editorHeader, editorLabel, editorInput, editorActions);
  root.append(
    anchor,
    placementLayer,
    rearrangeLayer,
    connectorSvg,
    drawBoxNode,
    selectBoxNode,
    guideLayer,
    sizeIndicatorNode,
    dragPreview,
    editorNode
  );
  function reportPlacements() {
    dispatch({ type: "placements-change", placements: placements.map((placement) => ({ ...placement })) });
  }
  function reportRearrange() {
    if (!rearrange) return;
    dispatch({
      type: "rearrange-change",
      state: {
        ...rearrange,
        sections: rearrange.sections.map((section) => ({ ...section })),
        originalOrder: [...rearrange.originalOrder]
      }
    });
  }
  function syncPlacement(id) {
    const placement = placements.find((candidate) => candidate.id === id);
    if (placement) dispatch({ type: "placement-sync", placement: { ...placement } });
  }
  function syncSection(id) {
    const section = rearrange?.sections.find((candidate) => candidate.id === id);
    if (section) dispatch({ type: "rearrange-sync", section: { ...section } });
  }
  function setInteracting(interacting) {
    dispatch({ type: "layout-interacting", interacting });
  }
  function scheduleNudgeSync() {
    cancel(nudgeSyncTimer);
    nudgeSyncTimer = later(() => {
      nudgeSyncTimer = void 0;
      for (const id of selection.placements) syncPlacement(id);
      for (const id of selection.sections) syncSection(id);
    }, NUDGE_SYNC_MS);
  }
  function selectOne(kind, id, additive) {
    const own = selection[kind];
    const other = kind === "placements" ? selection.sections : selection.placements;
    if (additive) {
      if (own.has(id)) own.delete(id);
      else own.add(id);
      return;
    }
    if (!own.has(id)) {
      own.clear();
      own.add(id);
      other.clear();
      return;
    }
    if (other.size > 0) other.clear();
  }
  function clearSelection() {
    selection.placements.clear();
    selection.sections.clear();
  }
  function selectionSize() {
    return selection.placements.size + selection.sections.size;
  }
  function snapTargets(excludePlacements, excludeSections) {
    const targets = [];
    for (const placement of placements) {
      if (!excludePlacements.has(placement.id)) targets.push({ x: placement.x, y: placement.y, width: placement.width, height: placement.height });
    }
    for (const section of rearrange?.sections ?? []) {
      if (!excludeSections.has(section.id)) targets.push(section.currentRect);
    }
    targets.push({
      x: 0,
      y: 0,
      width: environment.innerWidth,
      height: environment.document.documentElement.scrollHeight
    });
    return targets;
  }
  function fromOwnUi(event) {
    const owner = root.getRootNode();
    const host = owner instanceof environment.ShadowRoot ? owner.host : null;
    for (const entry of event.composedPath()) {
      if (entry === root || entry === host) return true;
      if (entry instanceof environment.Element && entry.hasAttribute("data-agentation-ui")) return true;
    }
    return false;
  }
  function pickTarget(from) {
    const doc = environment.document;
    const owner = root.getRootNode();
    const host = owner instanceof environment.ShadowRoot ? owner.host : null;
    let current = from;
    while (current && current !== doc.body && current !== doc.documentElement) {
      if (!(current instanceof environment.HTMLElement)) {
        current = current.parentElement;
        continue;
      }
      if (host && (current === host || host.contains(current))) return null;
      if (current.closest("[data-agentation-ui]")) return null;
      if (SKIP_TAGS2[current.tagName.toLowerCase()]) {
        current = current.parentElement;
        continue;
      }
      const rect = current.getBoundingClientRect();
      if (rect.width >= MIN_CAPTURE_SIZE && rect.height >= MIN_CAPTURE_SIZE) return current;
      current = current.parentElement;
    }
    return null;
  }
  function elementForSection(section) {
    try {
      return environment.document.querySelector(section.selector);
    } catch {
      return null;
    }
  }
  function capturedSectionFor(target) {
    for (const section of rearrange?.sections ?? []) {
      const captured = elementForSection(section);
      if (!captured) continue;
      if (captured === target || target.contains(captured) || captured.contains(target)) return section;
    }
    return null;
  }
  function layoutActive() {
    return !!model && model.layout.active;
  }
  function activeComponent() {
    return model?.layout.exiting ? null : model?.layout.activeComponent ?? null;
  }
  function renderPalette() {
    if (!model) return;
    const { layout } = model;
    root.classList.toggle("is-light", model.theme === "light");
    root.classList.toggle("is-wireframe", layout.wireframe);
    if (model.toolbarPosition) {
      anchor.style.left = `${model.toolbarPosition.x}px`;
      anchor.style.top = `${model.toolbarPosition.y}px`;
      anchor.style.right = "auto";
      anchor.style.bottom = "auto";
    } else {
      anchor.style.left = "";
      anchor.style.top = "";
      anchor.style.right = "";
      anchor.style.bottom = "";
    }
    const visible = model.active && layout.active && !layout.exiting;
    if (visible && !paletteMounted) {
      paletteMounted = true;
      palette.hidden = false;
      cancel(paletteExitTimer);
      paletteExitTimer = void 0;
      environment.timers.cancelAnimationFrame(paletteEnterFrame);
      paletteEnterFrame = environment.timers.requestAnimationFrame(() => {
        paletteEnterFrame = environment.timers.requestAnimationFrame(() => {
          paletteEnterFrame = void 0;
          palette.classList.remove("is-exit");
          palette.classList.add("is-enter");
        });
      });
    } else if (!visible && paletteMounted && paletteExitTimer === void 0) {
      environment.timers.cancelAnimationFrame(paletteEnterFrame);
      paletteEnterFrame = void 0;
      palette.classList.remove("is-enter");
      palette.classList.add("is-exit");
      paletteExitTimer = later(() => {
        paletteExitTimer = void 0;
        paletteMounted = false;
        palette.hidden = true;
      }, PALETTE_EXIT_MS);
    }
    wireframeToggle.classList.toggle("is-active", layout.wireframe);
    wireframeToggle.setAttribute("aria-pressed", layout.wireframe ? "true" : "false");
    purposeWrap.classList.toggle("is-collapsed", !layout.wireframe);
    purposeInput.disabled = !layout.wireframe;
    if (environment.document.activeElement !== purposeInput && purposeInput.value !== layout.wireframePurpose) {
      purposeInput.value = layout.wireframePurpose;
    }
    const armed = layout.activeComponent;
    for (const [type, node] of paletteItems) {
      const on = armed === type;
      node.classList.toggle("is-active", on);
      node.setAttribute("aria-pressed", on ? "true" : "false");
    }
    const total = placements.length + (rearrange?.sections.length ?? 0);
    if (total > 0) {
      lastFooterCount = total;
      lastFooterSuffix = layout.wireframe ? total === 1 ? "Component" : "Components" : total === 1 ? "Change" : "Changes";
    }
    const hasContent = total > 0;
    if (hasContent) {
      cancel(footerHideTimer);
      footerHideTimer = void 0;
      if (!footerVisible) {
        footerVisible = true;
        footerCollapsed = true;
        footerWrap.hidden = false;
        footerWrap.classList.add("is-collapsed");
        environment.timers.requestAnimationFrame(() => {
          environment.timers.requestAnimationFrame(() => {
            footerCollapsed = false;
            footerWrap.classList.remove("is-collapsed");
          });
        });
      } else if (footerCollapsed) {
        footerCollapsed = false;
        footerWrap.classList.remove("is-collapsed");
      }
    } else if (footerVisible && footerHideTimer === void 0) {
      footerCollapsed = true;
      footerWrap.classList.add("is-collapsed");
      footerHideTimer = later(() => {
        footerHideTimer = void 0;
        footerVisible = false;
        footerWrap.hidden = true;
      }, FOOTER_COLLAPSE_MS);
    }
    renderCount(lastFooterCount, lastFooterSuffix);
  }
  function renderCount(value, suffix) {
    const label2 = suffix ? `${value} ${suffix}` : `${value}`;
    if (value === rollValue && suffix === rollSuffix) {
      if (rollWrap.hidden) setText(countStatic, label2);
      return;
    }
    if (value === 0) {
      rollValue = value;
      rollSuffix = suffix;
      cancel(rollTimer);
      rollTimer = void 0;
      rollWrap.hidden = true;
      countStatic.hidden = false;
      setText(rollTail, "");
      setText(countStatic, label2);
      return;
    }
    const direction = value > rollValue ? "up" : "down";
    const suffixChanged = suffix !== rollSuffix;
    const previousLabel = suffixChanged ? `${rollValue} ${rollSuffix}` : `${rollValue}`;
    const nextLabel = suffixChanged ? label2 : `${value}`;
    rollValue = value;
    rollSuffix = suffix;
    setText(rollGhost, nextLabel);
    setText(rollOld, previousLabel);
    setText(rollNew, nextLabel);
    setText(rollTail, suffixChanged || !suffix ? "" : ` ${suffix}`);
    rollOld.className = `ag-layout-rolling-num ag-layout-${direction === "up" ? "exit-up" : "exit-down"}`;
    rollNew.className = `ag-layout-rolling-num ag-layout-${direction === "up" ? "enter-up" : "enter-down"}`;
    countStatic.hidden = true;
    rollWrap.hidden = false;
    restartAnimation(rollOld);
    restartAnimation(rollNew);
    cancel(rollTimer);
    rollTimer = later(() => {
      rollTimer = void 0;
      rollWrap.hidden = true;
      countStatic.hidden = false;
      setText(countStatic, rollSuffix ? `${rollValue} ${rollSuffix}` : `${rollValue}`);
    }, ROLL_MS);
  }
  function placementNode(placement) {
    const existing = placementNodes.get(placement.id);
    if (existing) return existing;
    const node = environment.createElement("div", "ag-layout-placement");
    node.dataset.designPlacement = placement.id;
    const label2 = environment.createElement("span", "ag-layout-placement-label");
    const note = environment.createElement("span", "ag-layout-placement-note");
    const content = environment.createElement("div", "ag-layout-placement-content");
    const skeleton = createSkeleton(environment, placement.type, placement.width, placement.height, placement.text);
    content.appendChild(skeleton);
    const remove = button("ag-layout-delete", "Delete component");
    remove.textContent = "\u2715";
    remove.dataset.deletePlacement = placement.id;
    node.append(label2, note, content, remove);
    for (const direction of ["nw", "ne", "se", "sw"]) {
      const handle = button(`ag-layout-handle ag-layout-handle-${direction}`, `Resize ${direction}`);
      handle.dataset.resizePlacement = placement.id;
      handle.dataset.direction = direction;
      node.appendChild(handle);
    }
    for (const direction of ["n", "e", "s", "w"]) {
      const bar2 = button(`ag-layout-edge ag-layout-edge-${direction}`, `Resize ${direction}`);
      bar2.dataset.resizePlacement = placement.id;
      bar2.dataset.direction = direction;
      bar2.appendChild(glyph(EDGE_ARROWS[direction], ...EDGE_ARROW_SIZE[direction]));
      node.appendChild(bar2);
    }
    placementLayer.appendChild(node);
    const record = {
      root: node,
      label: label2,
      note,
      content,
      skeleton,
      skeletonType: placement.type,
      skeletonText: placement.text,
      skeletonWidth: placement.width,
      skeletonHeight: placement.height,
      lastNote: placement.text ?? ""
    };
    placementNodes.set(placement.id, record);
    return record;
  }
  function renderPlacements(scrollY) {
    const armed = activeComponent();
    const exiting = !!model?.layout.exiting;
    placementLayer.classList.toggle("is-placing", armed !== null);
    placementLayer.classList.toggle("is-passthrough", armed === null);
    placementLayer.classList.toggle("is-exiting", exiting);
    placementLayer.hidden = !model?.layout.active;
    const live = /* @__PURE__ */ new Set();
    for (const placement of placements) {
      live.add(placement.id);
      const node = placementNode(placement);
      const selected = selection.placements.has(placement.id);
      node.root.style.left = `${placement.x}px`;
      node.root.style.top = `${placement.y - scrollY}px`;
      node.root.style.width = `${placement.width}px`;
      node.root.style.height = `${placement.height}px`;
      node.root.classList.toggle("is-selected", selected);
      node.root.classList.toggle("is-exiting", exitingPlacements.has(placement.id));
      setText(node.label, COMPONENT_MAP[placement.type]?.label ?? placement.type);
      if (placement.text) node.lastNote = placement.text;
      setText(node.note, placement.text || node.lastNote);
      node.note.classList.toggle("is-visible", !!placement.text);
      if (node.skeletonType !== placement.type || node.skeletonText !== placement.text) {
        const replacement = createSkeleton(
          environment,
          placement.type,
          placement.width,
          placement.height,
          placement.text
        );
        node.content.replaceChild(replacement, node.skeleton);
        node.skeleton = replacement;
        node.skeletonType = placement.type;
        node.skeletonText = placement.text;
        node.skeletonWidth = placement.width;
        node.skeletonHeight = placement.height;
      } else if (node.skeletonWidth !== placement.width || node.skeletonHeight !== placement.height) {
        updateSkeleton(node.skeleton, placement.width, placement.height);
        node.skeletonWidth = placement.width;
        node.skeletonHeight = placement.height;
      }
    }
    for (const [id, node] of placementNodes) {
      if (live.has(id)) continue;
      node.root.remove();
      placementNodes.delete(id);
    }
  }
  function sectionNode(section) {
    const existing = sectionNodes.get(section.id);
    if (existing) return existing;
    const node = environment.createElement("div", "ag-layout-section-outline");
    node.dataset.rearrangeSection = section.id;
    const label2 = environment.createElement("span", "ag-layout-section-label");
    const note = environment.createElement("span", "ag-layout-section-note");
    const dimensions = environment.createElement("span", "ag-layout-section-dimensions");
    const remove = button("ag-layout-delete", "Remove capture");
    remove.textContent = "\u2715";
    remove.dataset.deleteSection = section.id;
    node.append(label2, note, dimensions, remove);
    for (const direction of HANDLE_DIRECTIONS) {
      const handle = button(`ag-layout-handle ag-layout-handle-${direction}`, `Resize ${direction}`);
      handle.dataset.resizeSection = section.id;
      handle.dataset.direction = direction;
      node.appendChild(handle);
    }
    const badge = environment.createElement("span", "ag-layout-ghost-badge");
    const badgeText = environment.document.createTextNode("");
    const badgeExtra = environment.createElement("span", "ag-layout-ghost-badge-extra");
    badge.append(badgeText, badgeExtra);
    node.appendChild(badge);
    rearrangeLayer.appendChild(node);
    const record = {
      root: node,
      label: label2,
      note,
      dimensions,
      badge,
      badgeText,
      badgeExtra,
      lastNote: section.note ?? "",
      seenGhost: false
    };
    sectionNodes.set(section.id, record);
    return record;
  }
  function renderSections(scrollY) {
    const exiting = !!model?.layout.exiting;
    const wireframe = !!model?.layout.wireframe;
    rearrangeLayer.classList.toggle("is-exiting", exiting);
    rearrangeLayer.hidden = !model?.layout.active;
    const sections = rearrange?.sections ?? [];
    const live = /* @__PURE__ */ new Set();
    for (const section of sections) {
      if (firstAction.has(section.id)) continue;
      if (rectMoved(section)) firstAction.set(section.id, "move");
      else if (rectResized(section)) firstAction.set(section.id, "resize");
    }
    for (const id of [...firstAction.keys()]) {
      if (!sections.some((section) => section.id === id)) firstAction.delete(id);
    }
    for (const section of sections) {
      const selected = selection.sections.has(section.id);
      const isExiting = exitingSections.has(section.id);
      let present = true;
      if (!isExiting && !selected) {
        const element = elementForSection(section);
        if (!element) present = false;
        else {
          const rect2 = element.getBoundingClientRect();
          const expected = section.originalRect;
          const drift = Math.abs(rect2.width - expected.width) + Math.abs(rect2.height - expected.height);
          present = drift < 200;
        }
      }
      const changed = rectChanged(section);
      if (!present || wireframe && changed && !selected) {
        const node2 = sectionNodes.get(section.id);
        if (node2) node2.root.hidden = true;
        if (present) live.add(section.id);
        continue;
      }
      live.add(section.id);
      const node = sectionNode(section);
      node.root.hidden = false;
      const rect = section.currentRect;
      const screenY = section.isFixed ? rect.y : rect.y - scrollY;
      node.root.style.left = `${rect.x}px`;
      node.root.style.top = `${screenY}px`;
      node.root.style.width = `${rect.width}px`;
      node.root.style.height = `${rect.height}px`;
      const delta = selection.sections.has(section.id) ? sectionDragDelta : null;
      node.root.style.transform = delta ? `translate(${delta.x}px, ${delta.y}px)` : "";
      node.root.classList.toggle("is-selected", selected);
      node.root.classList.toggle("is-exiting", isExiting || exiting);
      node.root.classList.toggle("is-ghost", changed);
      node.root.classList.toggle("is-pending", !outlinesReady);
      if (changed) {
        if (!node.seenGhost) {
          node.seenGhost = true;
          restartAnimation(node.root);
        }
      } else {
        node.seenGhost = false;
      }
      setText(node.label, section.label);
      if (section.note) node.lastNote = section.note;
      setText(node.note, section.note || node.lastNote);
      node.note.classList.toggle("is-visible", !!section.note);
      setText(node.dimensions, `${Math.round(rect.width)} \xD7 ${Math.round(rect.height)}`);
      node.badge.hidden = !changed;
      if (changed) {
        const moved = rectMoved(section);
        const resized = rectResized(section);
        if (moved && resized) {
          const first = firstAction.get(section.id);
          const [a, b] = first === "resize" ? ["Resize", "Move"] : ["Move", "Resize"];
          setText(node.badgeText, `Suggested ${a} `);
          setText(node.badgeExtra, `& ${b}`);
          node.badgeExtra.hidden = false;
        } else {
          setText(node.badgeText, `Suggested ${resized ? "Resize" : "Move"}`);
          setText(node.badgeExtra, "");
          node.badgeExtra.hidden = true;
        }
      }
    }
    for (const [id, node] of sectionNodes) {
      if (live.has(id)) continue;
      node.root.remove();
      sectionNodes.delete(id);
    }
    if (hoverBox) {
      hoverHighlight.hidden = false;
      hoverHighlight.style.left = `${hoverBox.x}px`;
      hoverHighlight.style.top = `${hoverBox.y}px`;
      hoverHighlight.style.width = `${hoverBox.width}px`;
      hoverHighlight.style.height = `${hoverBox.height}px`;
    } else {
      hoverHighlight.hidden = true;
    }
  }
  function connectorNode(index) {
    const existing = connectorNodes[index];
    if (existing) return existing;
    const group = environment.createSvg("g");
    const line = environment.createSvg("path", {
      class: "ag-layout-connector-line",
      fill: "none",
      stroke: "rgba(59, 130, 246, 0.45)",
      "stroke-width": "1.5"
    });
    const dot = () => environment.createSvg("circle", {
      class: "ag-layout-connector-dot",
      fill: "rgba(59, 130, 246, 0.8)",
      stroke: "#fff",
      "stroke-width": "1.5",
      filter: "url(#ag-layout-connector-dot-shadow)"
    });
    const from = dot();
    const to = dot();
    group.append(line, from, to);
    connectorSvg.appendChild(group);
    const record = { group, line, from, to };
    connectorNodes[index] = record;
    return record;
  }
  function renderConnectors(scrollY) {
    const wireframe = !!model?.layout.wireframe;
    const exiting = !!model?.layout.exiting;
    if (!model?.layout.active || wireframe) {
      connectorSvg.toggleAttribute("hidden", true);
      return;
    }
    const entries = [];
    for (const section of rearrange?.sections ?? []) {
      const delta = selection.sections.has(section.id) ? sectionDragDelta : null;
      if (!rectChanged(section) && !delta) continue;
      const target = delta ? {
        x: Math.max(0, section.currentRect.x + delta.x),
        y: Math.max(0, section.currentRect.y + delta.y),
        width: section.currentRect.width,
        height: section.currentRect.height
      } : section.currentRect;
      entries.push({
        id: section.id,
        from: section.originalRect,
        to: target,
        isFixed: !!section.isFixed,
        selected: selection.sections.has(section.id),
        exiting: exitingSections.has(section.id)
      });
    }
    for (const [id, data] of exitingConnectors) {
      if (entries.some((entry) => entry.id === id)) continue;
      entries.push({ id, from: data.from, to: data.to, isFixed: data.isFixed, selected: false, exiting: true });
    }
    connectorSvg.classList.toggle("is-exiting", exiting);
    let used = 0;
    for (const entry of entries) {
      const ox = entry.from.x + entry.from.width / 2;
      const oy = (entry.isFixed ? entry.from.y : entry.from.y - scrollY) + entry.from.height / 2;
      const cx = entry.to.x + entry.to.width / 2;
      const cy = (entry.isFixed ? entry.to.y : entry.to.y - scrollY) + entry.to.height / 2;
      const dx = cx - ox;
      const dy = cy - oy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 2) continue;
      const proximity = Math.min(1, distance / 40);
      const perpendicular = Math.min(distance * 0.3, 60);
      const nx = -dy / distance;
      const ny = dx / distance;
      const px = (ox + cx) / 2 + nx * perpendicular;
      const py = (oy + cy) / 2 + ny * perpendicular;
      const dragging = !!sectionDragDelta && selection.sections.has(entry.id);
      const lineOpacity = (dragging || entry.selected ? 1 : 0.4) * proximity;
      const dotOpacity = (dragging || entry.selected ? 1 : 0.5) * proximity;
      const node = connectorNode(used);
      used += 1;
      node.group.removeAttribute("hidden");
      node.group.setAttribute("class", entry.exiting ? "ag-layout-connector-exiting" : "");
      node.line.setAttribute("d", `M ${ox} ${oy} Q ${px} ${py} ${cx} ${cy}`);
      node.line.setAttribute("opacity", `${lineOpacity}`);
      node.from.setAttribute("cx", `${ox}`);
      node.from.setAttribute("cy", `${oy}`);
      node.from.setAttribute("r", `${4 * proximity}`);
      node.from.setAttribute("opacity", `${dotOpacity}`);
      node.to.setAttribute("cx", `${cx}`);
      node.to.setAttribute("cy", `${cy}`);
      node.to.setAttribute("r", `${4 * proximity}`);
      node.to.setAttribute("opacity", `${dotOpacity}`);
    }
    for (let index = used; index < connectorNodes.length; index += 1) {
      connectorNodes[index].group.setAttribute("hidden", "");
    }
    connectorSvg.toggleAttribute("hidden", used === 0);
  }
  function renderTransients(scrollY) {
    if (drawBox) {
      drawBoxNode.hidden = false;
      drawBoxNode.style.left = `${drawBox.x}px`;
      drawBoxNode.style.top = `${drawBox.y}px`;
      drawBoxNode.style.width = `${drawBox.width}px`;
      drawBoxNode.style.height = `${drawBox.height}px`;
    } else {
      drawBoxNode.hidden = true;
    }
    if (selectBox) {
      selectBoxNode.hidden = false;
      selectBoxNode.style.left = `${selectBox.x}px`;
      selectBoxNode.style.top = `${selectBox.y}px`;
      selectBoxNode.style.width = `${selectBox.width}px`;
      selectBoxNode.style.height = `${selectBox.height}px`;
    } else {
      selectBoxNode.hidden = true;
    }
    if (sizeIndicator) {
      sizeIndicatorNode.hidden = false;
      sizeIndicatorNode.style.left = `${sizeIndicator.x}px`;
      sizeIndicatorNode.style.top = `${sizeIndicator.y}px`;
      setText(sizeIndicatorNode, sizeIndicator.text);
    } else {
      sizeIndicatorNode.hidden = true;
    }
    while (guideNodes.length < guides.length) {
      const node = environment.createElement("div", "ag-layout-guide");
      guideNodes.push(node);
      guideLayer.appendChild(node);
    }
    for (let index = 0; index < guideNodes.length; index += 1) {
      const node = guideNodes[index];
      const guide = guides[index];
      if (!guide) {
        node.hidden = true;
        continue;
      }
      node.hidden = false;
      node.classList.toggle("is-x", guide.axis === "x");
      node.classList.toggle("is-y", guide.axis === "y");
      if (guide.axis === "x") {
        node.style.left = `${guide.pos}px`;
        node.style.top = "0px";
      } else {
        node.style.left = "0px";
        node.style.top = `${guide.pos - scrollY}px`;
      }
    }
  }
  function renderEditor(scrollY) {
    if (!editor) {
      editorNode.hidden = true;
      return;
    }
    let rect;
    let element = "";
    let placeholder = "Label or content text";
    if (editor.target === "placement") {
      const placement = placements.find((candidate) => candidate.id === editor?.id);
      if (!placement) {
        closeEditor(true);
        return;
      }
      rect = { x: placement.x, y: placement.y - scrollY, width: placement.width, height: placement.height };
      element = COMPONENT_MAP[placement.type]?.label ?? placement.type;
      placeholder = TEXT_PLACEHOLDERS[placement.type] ?? placeholder;
    } else {
      const section = rearrange?.sections.find((candidate) => candidate.id === editor?.id);
      if (!section) {
        closeEditor(true);
        return;
      }
      const current = section.currentRect;
      rect = {
        x: current.x,
        y: section.isFixed ? current.y : current.y - scrollY,
        width: current.width,
        height: current.height
      };
      element = section.label;
      placeholder = "Add a note about this section";
    }
    editorNode.hidden = false;
    setText(editorElement, element);
    editorNode.setAttribute("aria-label", element);
    if (editorInput.placeholder !== placeholder) editorInput.placeholder = placeholder;
    setText(editorSubmit, editor.hadText ? "Save" : "Set");
    editorDeleteWrap.hidden = !editor.hadText;
    editorNode.classList.toggle("is-exit", editor.exiting);
    editorNode.classList.toggle("is-enter", !editor.exiting);
    const centerX = rect.x + rect.width / 2;
    const aboveY = rect.y - 8;
    const belowY = rect.y + rect.height + 8;
    const left = Math.max(160, Math.min(environment.innerWidth - 160, centerX));
    editorNode.style.left = `${left}px`;
    if (aboveY > 200) {
      editorNode.style.top = "auto";
      editorNode.style.bottom = `${environment.innerHeight - aboveY}px`;
    } else if (belowY < environment.innerHeight - 100) {
      editorNode.style.bottom = "auto";
      editorNode.style.top = `${belowY}px`;
    } else {
      editorNode.style.bottom = "auto";
      editorNode.style.top = `${Math.max(80, environment.innerHeight / 2 - 80)}px`;
    }
  }
  function render() {
    if (!model) return;
    const scrollY = environment.scrollY;
    renderPalette();
    renderPlacements(scrollY);
    renderSections(scrollY);
    renderConnectors(scrollY);
    renderTransients(scrollY);
    renderEditor(scrollY);
    dragPreview.hidden = !(gesture?.kind === "palette" && gesture.dragged);
  }
  function openEditor(target, id) {
    let value = "";
    if (target === "placement") {
      const placement = placements.find((candidate) => candidate.id === id);
      if (!placement) return;
      value = placement.text ?? "";
    } else {
      const section = rearrange?.sections.find((candidate) => candidate.id === id);
      if (!section) return;
      value = section.note ?? "";
    }
    cancel(editorExitTimer);
    editorExitTimer = void 0;
    editor = { target, id, hadText: value.length > 0, exiting: false };
    editorInput.value = value;
    render();
    restartAnimation(editorNode);
    environment.timers.requestAnimationFrame(() => {
      editorInput.focus();
      const end = editorInput.value.length;
      editorInput.setSelectionRange(end, end);
    });
  }
  function closeEditor(immediate = false) {
    if (!editor) return;
    if (immediate) {
      cancel(editorExitTimer);
      editorExitTimer = void 0;
      editor = null;
      editorNode.hidden = true;
      return;
    }
    editor = { ...editor, exiting: true };
    render();
    cancel(editorExitTimer);
    editorExitTimer = later(() => {
      editorExitTimer = void 0;
      editor = null;
      render();
    }, EDITOR_EXIT_MS);
  }
  function submitEditor(text) {
    if (!editor) return;
    const trimmed = text.trim();
    const value = trimmed.length > 0 ? trimmed : void 0;
    if (editor.target === "placement") {
      const id = editor.id;
      placements = placements.map(
        (placement) => placement.id === id ? { ...placement, text: value } : placement
      );
      reportPlacements();
      syncPlacement(id);
    } else if (rearrange) {
      const id = editor.id;
      rearrange = {
        ...rearrange,
        sections: rearrange.sections.map(
          (section) => section.id === id ? { ...section, note: value } : section
        )
      };
      reportRearrange();
      syncSection(id);
    }
    closeEditor();
  }
  function deletePlacements(ids) {
    if (ids.length === 0) return;
    for (const id of ids) {
      exitingPlacements.add(id);
      selection.placements.delete(id);
    }
    render();
    later(() => {
      for (const id of ids) {
        exitingPlacements.delete(id);
        dispatch({ type: "placement-delete", id });
      }
    }, EXIT_MS);
  }
  function deleteSections(ids) {
    if (ids.length === 0) return;
    for (const id of ids) {
      exitingSections.add(id);
      selection.sections.delete(id);
    }
    render();
    later(() => {
      for (const id of ids) {
        exitingSections.delete(id);
        dispatch({ type: "rearrange-delete", id });
      }
    }, EXIT_MS);
  }
  function endGesture() {
    if (!gesture) return;
    gesture.controller.abort();
    gesture = null;
  }
  function trackGesture(onMove, onUp) {
    const gestureController = new environment.AbortController();
    const options2 = { signal: gestureController.signal };
    const doc = environment.document;
    doc.addEventListener("pointermove", (event) => onMove(event), options2);
    doc.addEventListener(
      "pointerup",
      (event) => {
        const pointerEvent = event;
        gestureController.abort();
        onUp(pointerEvent);
      },
      options2
    );
    doc.addEventListener(
      "pointercancel",
      (event) => {
        const pointerEvent = event;
        gestureController.abort();
        onUp(pointerEvent);
      },
      options2
    );
    signal.addEventListener("abort", () => gestureController.abort(), { once: true });
    return gestureController;
  }
  function startPaletteDrag(component, event) {
    const definition = DEFAULT_SIZES[component];
    const start = { x: event.clientX, y: event.clientY };
    const toolbarTop = anchor.getBoundingClientRect().top || environment.innerHeight;
    dragPreview.classList.toggle("is-wireframe", !!model?.layout.wireframe);
    const gestureController = trackGesture(
      (move) => {
        if (!gesture || gesture.kind !== "palette") return;
        const dx = move.clientX - start.x;
        const dy = move.clientY - start.y;
        if (!gesture.dragged && (Math.abs(dx) > PALETTE_DRAG_THRESHOLD || Math.abs(dy) > PALETTE_DRAG_THRESHOLD)) {
          gesture.dragged = true;
          dragPreview.hidden = false;
        }
        if (!gesture.dragged) return;
        const distance = Math.max(0, toolbarTop - move.clientY);
        const progress = Math.min(1, distance / PREVIEW_RAMP);
        const eased = 1 - (1 - progress) ** 2;
        const minWidth = 28;
        const minHeight = 20;
        const maxWidth = Math.min(140, definition.width * 0.18);
        const maxHeight = Math.min(90, definition.height * 0.18);
        const width = minWidth + (maxWidth - minWidth) * eased;
        const height = minHeight + (maxHeight - minHeight) * eased;
        dragPreview.style.width = `${width}px`;
        dragPreview.style.height = `${height}px`;
        dragPreview.style.left = `${move.clientX - width / 2}px`;
        dragPreview.style.top = `${move.clientY - height / 2}px`;
        dragPreview.style.opacity = `${0.5 + 0.5 * eased}`;
        setText(dragPreview, eased > 0.25 ? component : "");
      },
      (up) => {
        const dragged = gesture?.kind === "palette" && gesture.dragged;
        dragPreview.hidden = true;
        setText(dragPreview, "");
        endGesture();
        if (!dragged) return;
        clearSelection();
        dispatch({ type: "layout-drop-component", component, clientX: up.clientX, clientY: up.clientY });
      }
    );
    gesture = { kind: "palette", component, start, dragged: false, controller: gestureController };
  }
  function startPlace(component, event) {
    const start = { x: event.clientX, y: event.clientY };
    const scrollY = environment.scrollY;
    dispatch({ type: "layout-interacting", interacting: true });
    const gestureController = trackGesture(
      (move) => {
        if (!gesture || gesture.kind !== "place") return;
        gesture.end = { x: move.clientX, y: move.clientY };
        if (Math.abs(move.clientX - start.x) > PLACE_DRAG_THRESHOLD || Math.abs(move.clientY - start.y) > PLACE_DRAG_THRESHOLD) {
          gesture.dragged = true;
        }
        if (!gesture.dragged) return;
        drawBox = {
          x: Math.min(start.x, move.clientX),
          y: Math.min(start.y, move.clientY),
          width: Math.abs(move.clientX - start.x),
          height: Math.abs(move.clientY - start.y)
        };
        sizeIndicator = {
          x: move.clientX + 12,
          y: move.clientY + 12,
          text: `${Math.round(drawBox.width)} \xD7 ${Math.round(drawBox.height)}`
        };
        render();
      },
      () => {
        const current = gesture?.kind === "place" ? gesture : null;
        drawBox = null;
        sizeIndicator = null;
        endGesture();
        dispatch({ type: "layout-interacting", interacting: false });
        if (!current) {
          render();
          return;
        }
        const definition = DEFAULT_SIZES[component];
        let box2;
        if (current.dragged) {
          box2 = {
            x: Math.min(start.x, current.end.x),
            y: Math.min(start.y, current.end.y) + scrollY,
            width: Math.max(MIN_SIZE, Math.abs(current.end.x - start.x)),
            height: Math.max(MIN_SIZE, Math.abs(current.end.y - start.y))
          };
        } else {
          box2 = {
            x: start.x - definition.width / 2,
            y: start.y + scrollY - definition.height / 2,
            width: definition.width,
            height: definition.height
          };
        }
        box2 = clampToOrigin(box2);
        const placement = {
          id: environment.randomId("dp"),
          type: component,
          x: box2.x,
          y: box2.y,
          width: box2.width,
          height: box2.height,
          scrollY,
          timestamp: environment.now()
        };
        placements = [...placements, placement];
        clearSelection();
        selection.placements.add(placement.id);
        reportPlacements();
        dispatch({ type: "placement-sync", placement: { ...placement } });
        dispatch({ type: "layout-select-component", component: null });
        render();
      }
    );
    gesture = {
      kind: "place",
      component,
      start,
      scrollY,
      dragged: false,
      end: start,
      controller: gestureController
    };
  }
  function startMarquee(event) {
    const start = { x: event.clientX, y: event.clientY };
    const scrollY = environment.scrollY;
    const additive = event.shiftKey;
    if (!additive) clearSelection();
    render();
    const gestureController = trackGesture(
      (move) => {
        if (!gesture || gesture.kind !== "select") return;
        if (Math.abs(move.clientX - start.x) > SELECT_DRAG_THRESHOLD || Math.abs(move.clientY - start.y) > SELECT_DRAG_THRESHOLD) {
          gesture.dragged = true;
        }
        if (!gesture.dragged) return;
        selectBox = {
          x: Math.min(start.x, move.clientX),
          y: Math.min(start.y, move.clientY),
          width: Math.abs(move.clientX - start.x),
          height: Math.abs(move.clientY - start.y)
        };
        render();
      },
      (up) => {
        const dragged = gesture?.kind === "select" && gesture.dragged;
        selectBox = null;
        endGesture();
        if (dragged) {
          const box2 = {
            x: Math.min(start.x, up.clientX),
            y: Math.min(start.y, up.clientY) + scrollY,
            width: Math.abs(up.clientX - start.x),
            height: Math.abs(up.clientY - start.y)
          };
          if (!additive) clearSelection();
          for (const placement of placements) {
            if (placement.x + placement.width > box2.x && placement.x < box2.x + box2.width && placement.y + placement.height > box2.y && placement.y < box2.y + box2.height) {
              selection.placements.add(placement.id);
            }
          }
        }
        render();
      }
    );
    gesture = { kind: "select", start, scrollY, additive, dragged: false, controller: gestureController };
  }
  function startMove(event) {
    const start = { x: event.clientX, y: event.clientY };
    const placementOrigins = /* @__PURE__ */ new Map();
    const sizes = /* @__PURE__ */ new Map();
    for (const placement of placements) {
      if (!selection.placements.has(placement.id)) continue;
      placementOrigins.set(placement.id, { x: placement.x, y: placement.y });
      sizes.set(placement.id, { x: placement.x, y: placement.y, width: placement.width, height: placement.height });
    }
    const sectionOrigins = /* @__PURE__ */ new Map();
    for (const section of rearrange?.sections ?? []) {
      if (!selection.sections.has(section.id)) continue;
      sectionOrigins.set(section.id, { x: section.currentRect.x, y: section.currentRect.y });
      sizes.set(section.id, section.currentRect);
    }
    if (placementOrigins.size === 0 && sectionOrigins.size === 0) return;
    dispatch({ type: "layout-interacting", interacting: true });
    let basePlacements = placements;
    const gestureController = trackGesture(
      (move) => {
        if (!gesture || gesture.kind !== "move") return;
        const rawDx = move.clientX - start.x;
        const rawDy = move.clientY - start.y;
        if (Math.abs(rawDx) > MOVE_DRAG_THRESHOLD || Math.abs(rawDy) > MOVE_DRAG_THRESHOLD) {
          gesture.moved = true;
        }
        if (!gesture.moved) return;
        if (move.altKey && !gesture.duplicated) {
          gesture.duplicated = true;
          const clones = [];
          for (const placement of placements) {
            if (!placementOrigins.has(placement.id)) continue;
            clones.push({ ...placement, id: environment.randomId("dp"), timestamp: environment.now() });
          }
          basePlacements = [...placements, ...clones];
          placements = basePlacements;
        }
        const boxes = [];
        for (const [id, origin] of placementOrigins) {
          const size = sizes.get(id);
          if (size) boxes.push({ x: origin.x + rawDx, y: origin.y + rawDy, width: size.width, height: size.height });
        }
        for (const [id, origin] of sectionOrigins) {
          const size = sizes.get(id);
          if (size) boxes.push({ x: origin.x + rawDx, y: origin.y + rawDy, width: size.width, height: size.height });
        }
        const snap = computeSnap(
          unionBox(boxes),
          snapTargets(new Set(placementOrigins.keys()), new Set(sectionOrigins.keys()))
        );
        guides = snap.guides;
        const dx = rawDx + snap.dx;
        const dy = rawDy + snap.dy;
        gesture.lastDx = dx;
        gesture.lastDy = dy;
        if (placementOrigins.size > 0) {
          placements = basePlacements.map((placement) => {
            const origin = placementOrigins.get(placement.id);
            if (!origin) return placement;
            return { ...placement, x: Math.max(0, origin.x + dx), y: Math.max(0, origin.y + dy) };
          });
          reportPlacements();
        }
        sectionDragDelta = sectionOrigins.size > 0 ? { x: dx, y: dy } : null;
        render();
      },
      (up) => {
        const current = gesture?.kind === "move" ? gesture : null;
        guides = [];
        sectionDragDelta = null;
        endGesture();
        dispatch({ type: "layout-interacting", interacting: false });
        if (!current) {
          render();
          return;
        }
        if (current.moved) {
          const totalDx = up.clientX - start.x;
          const totalDy = up.clientY - start.y;
          const committed = Math.abs(totalDx) >= SNAP_THRESHOLD || Math.abs(totalDy) >= SNAP_THRESHOLD;
          if (sectionOrigins.size > 0 && rearrange) {
            rearrange = {
              ...rearrange,
              sections: rearrange.sections.map((section) => {
                const origin = sectionOrigins.get(section.id);
                if (!origin) return section;
                const next = committed ? { x: Math.max(0, origin.x + current.lastDx), y: Math.max(0, origin.y + current.lastDy) } : origin;
                return { ...section, currentRect: { ...section.currentRect, x: next.x, y: next.y } };
              })
            };
            reportRearrange();
            if (committed) for (const id of sectionOrigins.keys()) syncSection(id);
          }
          if (placementOrigins.size > 0) {
            for (const placement of placements) {
              if (placementOrigins.has(placement.id) || current.duplicated) syncPlacement(placement.id);
            }
          }
        }
        render();
      }
    );
    gesture = {
      kind: "move",
      start,
      placementOrigins,
      sectionOrigins,
      duplicated: false,
      moved: false,
      lastDx: 0,
      lastDy: 0,
      controller: gestureController
    };
  }
  function startPlacementResize(id, direction, event) {
    const placement = placements.find((candidate) => candidate.id === id);
    if (!placement) return;
    clearSelection();
    selection.placements.add(id);
    dispatch({ type: "layout-interacting", interacting: true });
    const start = { x: event.clientX, y: event.clientY };
    const startBox = { x: placement.x, y: placement.y, width: placement.width, height: placement.height };
    const edges = edgesForHandle(direction);
    const gestureController = trackGesture(
      (move) => {
        const resized = resizeRect(startBox, direction, move.clientX - start.x, move.clientY - start.y);
        const snap = computeSnap(resized, snapTargets(/* @__PURE__ */ new Set([id]), /* @__PURE__ */ new Set()), edges);
        guides = snap.guides;
        const box2 = applyResizeSnap(resized, snap, edges);
        placements = placements.map(
          (candidate) => candidate.id === id ? { ...candidate, x: box2.x, y: box2.y, width: box2.width, height: box2.height } : candidate
        );
        sizeIndicator = {
          x: move.clientX + 12,
          y: move.clientY + 12,
          text: `${Math.round(box2.width)} \xD7 ${Math.round(box2.height)}`
        };
        reportPlacements();
        render();
      },
      () => {
        guides = [];
        sizeIndicator = null;
        endGesture();
        dispatch({ type: "layout-interacting", interacting: false });
        syncPlacement(id);
        render();
      }
    );
    gesture = { kind: "resize-placement", id, direction, start, startBox, controller: gestureController };
  }
  function startSectionResize(id, direction, event) {
    const section = rearrange?.sections.find((candidate) => candidate.id === id);
    if (!section || !rearrange) return;
    clearSelection();
    selection.sections.add(id);
    dispatch({ type: "layout-interacting", interacting: true });
    const start = { x: event.clientX, y: event.clientY };
    const startBox = { ...section.currentRect };
    const aspectRatio = startBox.width / startBox.height;
    const gestureController = trackGesture(
      (move) => {
        if (!rearrange) return;
        let box2 = resizeRect(startBox, direction, move.clientX - start.x, move.clientY - start.y);
        if (move.shiftKey) box2 = constrainAspectRatio(box2, startBox, direction, aspectRatio);
        rearrange = {
          ...rearrange,
          sections: rearrange.sections.map(
            (candidate) => candidate.id === id ? { ...candidate, currentRect: { ...box2 } } : candidate
          )
        };
        sizeIndicator = {
          x: move.clientX + 12,
          y: move.clientY + 12,
          text: `${Math.round(box2.width)} \xD7 ${Math.round(box2.height)}`
        };
        reportRearrange();
        render();
      },
      () => {
        sizeIndicator = null;
        endGesture();
        dispatch({ type: "layout-interacting", interacting: false });
        syncSection(id);
        render();
      }
    );
    gesture = { kind: "resize-section", id, direction, start, startBox, controller: gestureController };
  }
  function captureAndDrag(target, event) {
    if (!rearrange) return;
    const section = captureElement(environment, target);
    rearrange = {
      ...rearrange,
      sections: [...rearrange.sections, section],
      originalOrder: [...rearrange.originalOrder, section.id]
    };
    clearSelection();
    selection.sections.add(section.id);
    hoverBox = null;
    reportRearrange();
    dispatch({ type: "rearrange-sync", section: { ...section } });
    render();
    startMove(event);
  }
  const options = { signal };
  palette.addEventListener("pointerdown", (event) => event.stopPropagation(), options);
  palette.addEventListener("click", (event) => event.stopPropagation(), options);
  wireframeToggle.addEventListener(
    "click",
    () => dispatch({ type: "layout-wireframe", enabled: !model?.layout.wireframe }),
    options
  );
  purposeInput.addEventListener(
    "input",
    () => dispatch({ type: "layout-wireframe-purpose", purpose: purposeInput.value }),
    options
  );
  paletteScroll.addEventListener("scroll", () => updateScrollFade(), { ...options, passive: true });
  for (const [type, node] of paletteItems) {
    node.addEventListener(
      "click",
      () => {
        const armed = model?.layout.activeComponent ?? null;
        dispatch({ type: "layout-select-component", component: armed === type ? null : type });
      },
      options
    );
    node.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        endGesture();
        startPaletteDrag(type, event);
      },
      options
    );
  }
  footerClear.addEventListener(
    "click",
    () => {
      for (const placement of placements) exitingPlacements.add(placement.id);
      for (const section of rearrange?.sections ?? []) exitingSections.add(section.id);
      clearSelection();
      endGesture();
      render();
      later(() => {
        exitingPlacements.clear();
        exitingSections.clear();
        dispatch({ type: "layout-clear" });
      }, CLEAR_MS);
    },
    options
  );
  function updateScrollFade() {
    const top = paletteScroll.scrollTop > 2;
    const bottom = paletteScroll.scrollTop + paletteScroll.clientHeight < paletteScroll.scrollHeight - 2;
    paletteScroll.classList.toggle("is-fade-top", top);
    paletteScroll.classList.toggle("is-fade-bottom", bottom);
  }
  const ResizeObserverCtor = environment.window.ResizeObserver;
  const scrollObserver = ResizeObserverCtor ? new ResizeObserverCtor(() => updateScrollFade()) : null;
  scrollObserver?.observe(paletteScroll);
  placementLayer.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      const target = event.target;
      if (!(target instanceof environment.Element)) return;
      const resizeTarget = target.closest("[data-resize-placement]");
      if (resizeTarget) {
        event.preventDefault();
        event.stopPropagation();
        endGesture();
        startPlacementResize(
          resizeTarget.dataset.resizePlacement,
          resizeTarget.dataset.direction,
          event
        );
        return;
      }
      if (target.closest("[data-delete-placement]")) {
        event.stopPropagation();
        return;
      }
      const placementTarget = target.closest("[data-design-placement]");
      if (placementTarget) {
        event.preventDefault();
        event.stopPropagation();
        endGesture();
        selectOne("placements", placementTarget.dataset.designPlacement, event.shiftKey);
        render();
        startMove(event);
        return;
      }
      const armed = activeComponent();
      if (armed === null) return;
      event.preventDefault();
      event.stopPropagation();
      endGesture();
      startPlace(armed, event);
    },
    options
  );
  placementLayer.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof environment.Element)) return;
      const remove = target.closest("[data-delete-placement]");
      if (!remove) return;
      event.stopPropagation();
      deletePlacements([remove.dataset.deletePlacement]);
    },
    options
  );
  placementLayer.addEventListener(
    "dblclick",
    (event) => {
      const target = event.target;
      if (!(target instanceof environment.Element)) return;
      const placementTarget = target.closest("[data-design-placement]");
      if (!placementTarget) return;
      const id = placementTarget.dataset.designPlacement;
      const placement = placements.find((candidate) => candidate.id === id);
      if (!placement || !TEXT_TYPES[placement.type]) return;
      openEditor("placement", id);
    },
    options
  );
  rearrangeLayer.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      const target = event.target;
      if (!(target instanceof environment.Element)) return;
      const resizeTarget = target.closest("[data-resize-section]");
      if (resizeTarget) {
        event.preventDefault();
        event.stopPropagation();
        endGesture();
        startSectionResize(
          resizeTarget.dataset.resizeSection,
          resizeTarget.dataset.direction,
          event
        );
        return;
      }
      if (target.closest("[data-delete-section]")) {
        event.stopPropagation();
        return;
      }
      const sectionTarget = target.closest("[data-rearrange-section]");
      if (!sectionTarget) return;
      event.preventDefault();
      event.stopPropagation();
      endGesture();
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      selectOne("sections", sectionTarget.dataset.rearrangeSection, additive);
      render();
      startMove(event);
    },
    options
  );
  rearrangeLayer.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof environment.Element)) return;
      const remove = target.closest("[data-delete-section]");
      if (!remove) return;
      event.stopPropagation();
      deleteSections([remove.dataset.deleteSection]);
    },
    options
  );
  rearrangeLayer.addEventListener(
    "dblclick",
    (event) => {
      const target = event.target;
      if (!(target instanceof environment.Element)) return;
      const sectionTarget = target.closest("[data-rearrange-section]");
      if (!sectionTarget) return;
      openEditor("section", sectionTarget.dataset.rearrangeSection);
    },
    options
  );
  editorNode.addEventListener("pointerdown", (event) => event.stopPropagation(), options);
  editorCancel.addEventListener("click", () => closeEditor(), options);
  editorSubmit.addEventListener("click", () => submitEditor(editorInput.value), options);
  editorDelete.addEventListener("click", () => submitEditor(""), options);
  editorInput.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        submitEditor(editorInput.value);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeEditor();
      }
    },
    options
  );
  environment.document.addEventListener(
    "pointermove",
    (event) => {
      if (!model?.layout.active || gesture || model?.layout.wireframe) {
        if (hoverBox) {
          hoverBox = null;
          render();
        }
        return;
      }
      const under = typeof environment.document.elementFromPoint === "function" ? environment.document.elementFromPoint(event.clientX, event.clientY) : null;
      const target = under && !fromOwnUi(event) ? pickTarget(under) : null;
      const next = target && !capturedSectionFor(target) ? target.getBoundingClientRect() : null;
      const box2 = next ? { x: next.x, y: next.y, width: next.width, height: next.height } : null;
      const changed = !box2 && hoverBox || box2 && !hoverBox || box2 && hoverBox && (box2.x !== hoverBox.x || box2.y !== hoverBox.y || box2.width !== hoverBox.width || box2.height !== hoverBox.height);
      if (!changed) return;
      hoverBox = box2;
      render();
    },
    { ...options, passive: true }
  );
  environment.document.addEventListener(
    "pointerdown",
    (event) => {
      if (!model?.layout.active || gesture) return;
      if (event.button !== 0 || !event.isPrimary) return;
      if (model?.layout.wireframe) return;
      if (fromOwnUi(event)) return;
      const target = pickTarget(event.target instanceof environment.Element ? event.target : null);
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      if (!target) {
        if (!additive && selection.placements.size + selection.sections.size > 0) {
          clearSelection();
          render();
        }
        return;
      }
      const captured = capturedSectionFor(target);
      if (!captured) {
        event.preventDefault();
        event.stopPropagation();
        captureAndDrag(target, event);
        return;
      }
      event.preventDefault();
      if (elementForSection(captured) === target) {
        selectOne("sections", captured.id, additive);
        render();
        return;
      }
      if (!additive) {
        clearSelection();
        render();
      }
    },
    { ...options, capture: true }
  );
  environment.document.addEventListener(
    "keydown",
    (event) => {
      if (!model?.layout.active) return;
      const focused = event.composedPath()[0];
      if (focused instanceof environment.HTMLElement) {
        const tag = focused.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || focused.isContentEditable) return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && selection.placements.size + selection.sections.size > 0) {
        event.preventDefault();
        event.stopPropagation();
        deletePlacements([...selection.placements]);
        deleteSections([...selection.sections]);
        return;
      }
      if ((event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") && selection.placements.size + selection.sections.size > 0) {
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        if (selection.placements.size > 0) {
          placements = placements.map(
            (placement) => selection.placements.has(placement.id) ? { ...placement, ...clampToOrigin({ ...{ x: placement.x, y: placement.y, width: placement.width, height: placement.height }, x: placement.x + dx, y: placement.y + dy }) } : placement
          );
          reportPlacements();
        }
        if (selection.sections.size > 0 && rearrange) {
          rearrange = {
            ...rearrange,
            sections: rearrange.sections.map(
              (section) => selection.sections.has(section.id) ? {
                ...section,
                currentRect: {
                  ...section.currentRect,
                  ...clampToOrigin({
                    ...section.currentRect,
                    x: section.currentRect.x + dx,
                    y: section.currentRect.y + dy
                  })
                }
              } : section
            )
          };
          reportRearrange();
        }
        scheduleNudgeSync();
        render();
        return;
      }
      if (event.key === "Escape") {
        if (editor) {
          event.stopPropagation();
          closeEditor();
          return;
        }
        if (model?.layout.activeComponent) {
          event.stopPropagation();
          dispatch({ type: "layout-select-component", component: null });
          return;
        }
        if (selection.placements.size + selection.sections.size > 0) {
          event.stopPropagation();
          clearSelection();
          render();
        }
      }
    },
    { ...options, capture: true }
  );
  const reflow = () => {
    if (!model?.layout.active) return;
    render();
  };
  environment.window.addEventListener("scroll", reflow, { ...options, passive: true });
  environment.window.addEventListener("resize", reflow, { ...options, passive: true });
  function trackConnectorExits() {
    const sections = rearrange?.sections ?? [];
    const changedIds = /* @__PURE__ */ new Set();
    for (const section of sections) {
      if (!rectChanged(section)) continue;
      changedIds.add(section.id);
      lastChangedRects.set(section.id, {
        current: section.currentRect,
        original: section.originalRect,
        isFixed: !!section.isFixed
      });
    }
    const leaving = [];
    for (const id of previousChangedIds) {
      if (changedIds.has(id)) continue;
      if (!sections.some((section) => section.id === id)) continue;
      const last = lastChangedRects.get(id);
      if (!last) continue;
      exitingConnectors.set(id, { from: last.original, to: last.current, isFixed: last.isFixed });
      lastChangedRects.delete(id);
      leaving.push(id);
    }
    previousChangedIds = changedIds;
    if (leaving.length === 0) return;
    later(() => {
      for (const id of leaving) exitingConnectors.delete(id);
      render();
    }, CONNECTOR_EXIT_MS);
  }
  let wasActive = false;
  return {
    root,
    update(nextModel, _config) {
      model = nextModel;
      const owned = gesture !== null && gesture.kind !== "palette" && gesture.kind !== "select";
      if (!owned) {
        placements = nextModel.layout.placements.map((placement) => ({ ...placement }));
        rearrange = nextModel.layout.rearrange ? {
          ...nextModel.layout.rearrange,
          sections: nextModel.layout.rearrange.sections.map((section) => ({ ...section })),
          originalOrder: [...nextModel.layout.rearrange.originalOrder]
        } : null;
      }
      const placementIds = new Set(placements.map((placement) => placement.id));
      for (const id of [...selection.placements]) {
        if (!placementIds.has(id)) selection.placements.delete(id);
      }
      const sectionIds = new Set((rearrange?.sections ?? []).map((section) => section.id));
      for (const id of [...selection.sections]) {
        if (!sectionIds.has(id)) selection.sections.delete(id);
      }
      const active = nextModel.layout.active;
      if (active && !wasActive) {
        const settled = !(rearrange?.sections ?? []).some(rectChanged);
        outlinesReady = settled;
        cancel(outlinesReadyTimer);
        outlinesReadyTimer = settled ? void 0 : later(() => {
          outlinesReadyTimer = void 0;
          outlinesReady = true;
          render();
        }, OUTLINES_READY_MS);
        previousChangedIds = new Set(
          (rearrange?.sections ?? []).filter(rectChanged).map((section) => section.id)
        );
      } else if (!active && wasActive) {
        endGesture();
        clearSelection();
        closeEditor(true);
        hoverBox = null;
        guides = [];
        sizeIndicator = null;
        drawBox = null;
        selectBox = null;
        sectionDragDelta = null;
        firstAction.clear();
        exitingConnectors.clear();
        lastChangedRects.clear();
        previousChangedIds = /* @__PURE__ */ new Set();
      }
      wasActive = active;
      if (editor && (nextModel.layout.exiting || !active)) closeEditor(true);
      if (!owned) trackConnectorExits();
      render();
      updateScrollFade();
    },
    destroy() {
      endGesture();
      controller.abort();
      scrollObserver?.disconnect();
      environment.timers.cancelAnimationFrame(paletteEnterFrame);
      for (const handle of timers) environment.timers.clearTimeout(handle);
      timers.clear();
      root.remove();
    }
  };
}

// src/browser/view/markers.ts
var QUOTE_LIMIT = 30;
var TOOLTIP_MAX_WIDTH = 200;
var TOOLTIP_ESTIMATED_HEIGHT = 80;
var TOOLTIP_GAP = 10;
var TOOLTIP_EDGE_PADDING = 10;
var MARKER_SIZE = 22;
var STAGGER_MS = 20;
var CLEAR_MS_PER_MARKER = 30;
var CLEAR_MS_BASE = 200;
var GLYPH_SIZE = 16;
var GLYPH_SIZE_MULTI = 18;
var EXIT_GLYPH_SIZE = 10;
var EXIT_GLYPH_SIZE_MULTI = 12;
function setNodeHidden(node, hidden) {
  if (hidden) {
    node.setAttribute("hidden", "");
  } else {
    node.removeAttribute("hidden");
  }
}
function quoteLine(annotation) {
  const selected = annotation.selectedText;
  if (!selected) {
    return annotation.element;
  }
  const ellipsis = selected.length > QUOTE_LIMIT ? "..." : "";
  return `${annotation.element} "${selected.slice(0, QUOTE_LIMIT)}${ellipsis}"`;
}
function createMarkerRegion(environment, dispatch) {
  const controller = new environment.AbortController();
  const { signal } = controller;
  const root = environment.createElement("div", "ag-marker-region");
  root.setAttribute("data-agentation-ui", "markers");
  root.hidden = true;
  const layer = environment.createElement("div", "ag-layer ag-marker-layer");
  const fixedLayer = environment.createElement(
    "div",
    "ag-layer ag-marker-layer-fixed"
  );
  root.append(layer, fixedLayer);
  const markers = /* @__PURE__ */ new Map();
  const clearing = /* @__PURE__ */ new Set();
  let clearTimer;
  let lastLiveIds = [];
  function createMarker(annotation) {
    const multi = annotation.isMultiSelect === true;
    const node = environment.createElement("button", "ag-marker");
    node.type = "button";
    node.setAttribute("data-annotation-marker", "");
    node.setAttribute("data-agentation-ui", "marker");
    node.setAttribute("data-id", annotation.id);
    const label2 = environment.createElement("span", "ag-marker-label");
    const editIcon = createIcon(environment, "edit", GLYPH_SIZE);
    editIcon.classList.add("ag-marker-glyph");
    editIcon.setAttribute("hidden", "");
    const glyphSize = multi ? GLYPH_SIZE_MULTI : GLYPH_SIZE;
    const closeIcon = createIcon(environment, "xmark", glyphSize);
    closeIcon.classList.add("ag-marker-glyph");
    closeIcon.setAttribute("hidden", "");
    const tooltip = environment.createElement("span", "ag-marker-tooltip");
    tooltip.setAttribute("aria-hidden", "true");
    tooltip.hidden = true;
    const quote = environment.createElement("span", "ag-marker-quote");
    const note = environment.createElement("span", "ag-marker-note");
    tooltip.append(quote, note);
    node.append(label2, editIcon, closeIcon, tooltip);
    const marker = {
      root: node,
      label: label2,
      editIcon,
      closeIcon,
      tooltip,
      quote,
      note,
      multi,
      left: Number.NaN,
      top: Number.NaN,
      className: "ag-marker",
      background: "",
      delay: "",
      labelText: "",
      ariaLabel: "",
      glyph: "number",
      glyphSize,
      inert: false,
      tooltipShown: false,
      tooltipTop: "",
      tooltipBottom: "",
      tooltipLeft: "",
      quoteText: "",
      noteText: "",
      interactive: false,
      deleteMode: false
    };
    const id = annotation.id;
    node.addEventListener(
      "mouseenter",
      () => {
        if (!marker.interactive) {
          return;
        }
        dispatch({ type: "marker-hover", id });
      },
      { signal }
    );
    node.addEventListener(
      "mouseleave",
      () => dispatch({ type: "marker-hover", id: null }),
      { signal }
    );
    node.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
        if (!marker.interactive) {
          return;
        }
        dispatch({ type: "marker-click", id });
      },
      { signal }
    );
    node.addEventListener(
      "contextmenu",
      (event) => {
        if (!marker.deleteMode) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (!marker.interactive) {
          return;
        }
        dispatch({ type: "marker-context", id });
      },
      { signal }
    );
    return marker;
  }
  function ensure(annotation) {
    let marker = markers.get(annotation.id);
    if (!marker) {
      marker = createMarker(annotation);
      markers.set(annotation.id, marker);
    }
    marker.multi = annotation.isMultiSelect === true;
    clearing.delete(annotation.id);
    return marker;
  }
  function position(marker, annotation) {
    const left = annotation.x / 100 * environment.innerWidth;
    const top = annotation.isFixed ? annotation.y : annotation.y - environment.scrollY;
    if (marker.left !== left) {
      marker.left = left;
      marker.root.style.left = `${left}px`;
    }
    if (marker.top !== top) {
      marker.top = top;
      marker.root.style.top = `${top}px`;
    }
  }
  function applyState(marker, state) {
    marker.interactive = state.interactive;
    marker.deleteMode = state.deleteMode;
    if (marker.className !== state.className) {
      marker.className = state.className;
      marker.root.className = state.className;
    }
    if (marker.background !== state.background) {
      marker.background = state.background;
      marker.root.style.backgroundColor = state.background;
    }
    if (marker.delay !== state.delay) {
      marker.delay = state.delay;
      marker.root.style.animationDelay = state.delay;
    }
    if (marker.labelText !== state.labelText) {
      marker.labelText = state.labelText;
      marker.label.textContent = state.labelText;
    }
    if (marker.ariaLabel !== state.ariaLabel) {
      marker.ariaLabel = state.ariaLabel;
      marker.root.setAttribute("aria-label", state.ariaLabel);
    }
    if (marker.glyphSize !== state.glyphSize) {
      marker.glyphSize = state.glyphSize;
      marker.closeIcon.setAttribute("width", String(state.glyphSize));
      marker.closeIcon.setAttribute("height", String(state.glyphSize));
    }
    if (marker.glyph !== state.glyph) {
      marker.glyph = state.glyph;
      setNodeHidden(marker.label, state.glyph !== "number");
      setNodeHidden(marker.editIcon, state.glyph !== "edit");
      setNodeHidden(marker.closeIcon, state.glyph !== "close");
    }
    if (marker.inert !== state.inert) {
      marker.inert = state.inert;
      marker.root.disabled = state.inert;
      if (state.inert) {
        marker.root.setAttribute("aria-hidden", "true");
      } else {
        marker.root.removeAttribute("aria-hidden");
      }
    }
  }
  function hideTooltip(marker) {
    if (!marker.tooltipShown) {
      return;
    }
    marker.tooltipShown = false;
    marker.tooltip.hidden = true;
  }
  function showTooltip(marker, annotation) {
    const quoteText = quoteLine(annotation);
    if (marker.quoteText !== quoteText) {
      marker.quoteText = quoteText;
      marker.quote.textContent = quoteText;
    }
    if (marker.noteText !== annotation.comment) {
      marker.noteText = annotation.comment;
      marker.note.textContent = annotation.comment;
    }
    let top = "";
    let bottom = "";
    let left = "";
    const spaceBelow = environment.innerHeight - marker.top - MARKER_SIZE - TOOLTIP_GAP;
    if (spaceBelow < TOOLTIP_ESTIMATED_HEIGHT) {
      top = "auto";
      bottom = `calc(100% + ${TOOLTIP_GAP}px)`;
    }
    const centerX = marker.left - TOOLTIP_MAX_WIDTH / 2;
    if (centerX < TOOLTIP_EDGE_PADDING) {
      left = `calc(50% + ${TOOLTIP_EDGE_PADDING - centerX}px)`;
    } else if (centerX + TOOLTIP_MAX_WIDTH > environment.innerWidth - TOOLTIP_EDGE_PADDING) {
      const overflow = centerX + TOOLTIP_MAX_WIDTH - (environment.innerWidth - TOOLTIP_EDGE_PADDING);
      left = `calc(50% - ${overflow}px)`;
    }
    if (marker.tooltipTop !== top) {
      marker.tooltipTop = top;
      marker.tooltip.style.top = top;
    }
    if (marker.tooltipBottom !== bottom) {
      marker.tooltipBottom = bottom;
      marker.tooltip.style.bottom = bottom;
    }
    if (marker.tooltipLeft !== left) {
      marker.tooltipLeft = left;
      marker.tooltip.style.left = left;
    }
    if (!marker.tooltipShown) {
      marker.tooltipShown = true;
      marker.tooltip.hidden = false;
    }
  }
  function classesFor(multi, animation, hovered) {
    let result = "ag-marker";
    if (multi) {
      result += " ag-marker-multi";
    }
    if (animation) {
      result += ` ${animation}`;
    }
    if (hovered) {
      result += " ag-marker-hovered";
    }
    return result;
  }
  function removeMarker(id) {
    const marker = markers.get(id);
    if (!marker) {
      return;
    }
    marker.root.remove();
    markers.delete(id);
  }
  function startClear(ids, animate) {
    if (!animate) {
      for (const id of ids) {
        removeMarker(id);
      }
      return;
    }
    let index = 0;
    for (const id of ids) {
      const marker = markers.get(id);
      if (!marker) {
        continue;
      }
      clearing.add(id);
      hideTooltip(marker);
      applyState(marker, {
        className: classesFor(marker.multi, "ag-marker-clearing", false),
        background: marker.background,
        delay: `${index * STAGGER_MS}ms`,
        labelText: marker.labelText,
        ariaLabel: marker.ariaLabel,
        glyph: marker.glyph,
        glyphSize: marker.glyphSize,
        inert: true,
        interactive: false,
        deleteMode: false
      });
      index += 1;
    }
    if (clearing.size === 0) {
      return;
    }
    clearTimer = environment.timers.setTimeout(() => {
      clearTimer = void 0;
      for (const id of clearing) {
        removeMarker(id);
      }
      clearing.clear();
    }, ids.length * CLEAR_MS_PER_MARKER + CLEAR_MS_BASE);
  }
  function reconcile(container, ordered) {
    let cursor = container.firstChild;
    for (const marker of ordered) {
      if (cursor === marker.root) {
        cursor = cursor.nextSibling;
        continue;
      }
      container.insertBefore(marker.root, cursor);
    }
  }
  return {
    root,
    update(model, _config) {
      root.hidden = !model.markersVisible;
      const deleteMode = model.settings.markerClickBehavior === "delete";
      const editingAny = model.editor !== null && model.editor.mode === "edit";
      const liveDoc = [];
      const liveFixed = [];
      const exitingDoc = [];
      const exitingFixed = [];
      const liveIds = [];
      for (const annotation of model.annotations) {
        if (annotation.kind === "placement" || annotation.kind === "rearrange") {
          continue;
        }
        if (model.exitingAnnotationIds.has(annotation.id)) {
          if (!model.markersExiting) {
            (annotation.isFixed ? exitingFixed : exitingDoc).push(annotation);
          }
          continue;
        }
        const entry = { annotation, number: liveIds.length + 1 };
        liveIds.push(annotation.id);
        (annotation.isFixed ? liveFixed : liveDoc).push(entry);
      }
      if (liveIds.length === 0 && lastLiveIds.length > 0 && clearing.size === 0) {
        startClear(lastLiveIds, model.markersVisible);
      }
      lastLiveIds = liveIds;
      const orderedDoc = [];
      const orderedFixed = [];
      const rendered = /* @__PURE__ */ new Set();
      const exitAll = model.markersExiting;
      function applyLive(entry, layerIndex, layerSize) {
        const { annotation, number } = entry;
        const marker = ensure(annotation);
        const hovered = !exitAll && model.hoveredAnnotationId === annotation.id;
        const showAffordance = hovered && !editingAny;
        const showDelete = showAffordance && deleteMode;
        const animation = exitAll ? "ag-marker-exit" : model.animatedAnnotationIds.has(annotation.id) ? "" : "ag-marker-enter";
        const comment = annotation.comment;
        const verb = deleteMode ? "Delete" : "Edit";
        position(marker, annotation);
        applyState(marker, {
          className: classesFor(marker.multi, animation, showDelete),
          // `.ag-marker-hovered` owns the red delete background.
          background: showDelete ? "" : marker.multi ? "var(--agentation-color-green)" : "var(--agentation-color-accent)",
          delay: exitAll ? `${(layerSize - 1 - layerIndex) * STAGGER_MS}ms` : `${layerIndex * STAGGER_MS}ms`,
          labelText: String(number),
          ariaLabel: comment ? `${verb} annotation ${number}: ${comment}` : `${verb} annotation ${number}`,
          glyph: showAffordance ? showDelete ? "close" : "edit" : "number",
          glyphSize: marker.multi ? GLYPH_SIZE_MULTI : GLYPH_SIZE,
          inert: false,
          interactive: !exitAll,
          deleteMode
        });
        const renumbering = model.renumberFrom !== null && number - 1 >= model.renumberFrom;
        marker.label.classList.toggle("ag-marker-renumber", renumbering);
        if (hovered && !editingAny) {
          showTooltip(marker, annotation);
        } else {
          hideTooltip(marker);
        }
        rendered.add(annotation.id);
        return marker;
      }
      function applyExiting(annotation) {
        const marker = ensure(annotation);
        position(marker, annotation);
        applyState(marker, {
          className: classesFor(marker.multi, "ag-marker-exit", true),
          background: "",
          delay: "0ms",
          labelText: marker.labelText,
          ariaLabel: marker.ariaLabel,
          glyph: "close",
          glyphSize: marker.multi ? EXIT_GLYPH_SIZE_MULTI : EXIT_GLYPH_SIZE,
          inert: true,
          interactive: false,
          deleteMode
        });
        marker.label.classList.remove("ag-marker-renumber");
        hideTooltip(marker);
        rendered.add(annotation.id);
        return marker;
      }
      for (let index = 0; index < liveDoc.length; index += 1) {
        orderedDoc.push(applyLive(liveDoc[index], index, liveDoc.length));
      }
      for (let index = 0; index < liveFixed.length; index += 1) {
        orderedFixed.push(applyLive(liveFixed[index], index, liveFixed.length));
      }
      for (const annotation of exitingDoc) {
        orderedDoc.push(applyExiting(annotation));
      }
      for (const annotation of exitingFixed) {
        orderedFixed.push(applyExiting(annotation));
      }
      for (const id of markers.keys()) {
        if (!rendered.has(id) && !clearing.has(id)) {
          removeMarker(id);
        }
      }
      reconcile(layer, orderedDoc);
      reconcile(fixedLayer, orderedFixed);
    },
    destroy() {
      controller.abort();
      environment.timers.clearTimeout(clearTimer);
      clearTimer = void 0;
      clearing.clear();
      for (const marker of markers.values()) {
        marker.root.remove();
      }
      markers.clear();
      lastLiveIds = [];
    }
  };
}

// src/browser/view/overlay.ts
var NO_OUTLINES = [];
var NO_BOXES = [];
function setOffsetBox(element, box2) {
  element.style.left = `${box2.x}px`;
  element.style.top = `${box2.y}px`;
  element.style.width = `${box2.width}px`;
  element.style.height = `${box2.height}px`;
}
function setTranslatedBox(element, box2) {
  element.style.transform = `translate(${box2.x}px, ${box2.y}px)`;
  element.style.width = `${box2.width}px`;
  element.style.height = `${box2.height}px`;
}
function createBoxPool(environment, container, className) {
  const nodes = [];
  return {
    resize(count) {
      while (nodes.length < count) {
        const node = environment.createElement("div", className);
        node.setAttribute("aria-hidden", "true");
        nodes.push(node);
        container.append(node);
      }
      for (let index = 0; index < nodes.length; index += 1) {
        nodes[index].hidden = index >= count;
      }
      return nodes;
    }
  };
}
function createOverlayRegion(environment, dispatch) {
  const controller = new environment.AbortController();
  const { signal } = controller;
  const root = environment.createElement("div", "ag-overlay");
  root.dataset.agentationUi = "overlay";
  const backdrop = environment.createElement("div", "ag-overlay-blank-canvas");
  backdrop.setAttribute("aria-hidden", "true");
  const notice = environment.createElement("div", "ag-overlay-wireframe-notice");
  const opacityRow = environment.createElement("div", "ag-overlay-wireframe-opacity-row");
  const opacityId = "ag-overlay-wireframe-opacity";
  const opacityLabel = environment.createElement(
    "label",
    "ag-overlay-wireframe-opacity-label"
  );
  opacityLabel.htmlFor = opacityId;
  opacityLabel.textContent = "Toggle Opacity";
  const opacityInput = environment.createElement(
    "input",
    "ag-overlay-wireframe-opacity-slider"
  );
  opacityInput.id = opacityId;
  opacityInput.type = "range";
  opacityInput.min = "0";
  opacityInput.max = "1";
  opacityInput.step = "0.01";
  opacityInput.value = "1";
  opacityRow.append(opacityLabel, opacityInput);
  const titleRow = environment.createElement("div", "ag-overlay-wireframe-notice-title-row");
  const title = environment.createElement("span", "ag-overlay-wireframe-notice-title");
  title.textContent = "Wireframe Mode";
  const divider = environment.createElement("span", "ag-overlay-wireframe-notice-divider");
  divider.setAttribute("aria-hidden", "true");
  const startOver = environment.createElement("button", "ag-overlay-wireframe-start-over");
  startOver.type = "button";
  startOver.textContent = "Start Over";
  titleRow.append(title, divider, startOver);
  notice.append(opacityRow, titleRow);
  notice.append(
    environment.document.createTextNode("Drag components onto the canvas."),
    environment.createElement("br"),
    environment.document.createTextNode(
      "Copied output will only include the wireframed layout."
    )
  );
  const layer = environment.createElement("div", "ag-overlay-layer");
  layer.setAttribute("aria-hidden", "true");
  const hoverHighlight = environment.createElement("div", "ag-overlay-hover-highlight");
  const outlineGroup = environment.createElement("div", "ag-overlay-group");
  const highlightGroup = environment.createElement("div", "ag-overlay-group");
  const dragSelection = environment.createElement("div", "ag-overlay-drag-selection");
  const hoverTooltip = environment.createElement("div", "ag-overlay-hover-tooltip");
  const hoverComponentPath = environment.createElement(
    "div",
    "ag-overlay-hover-component-path"
  );
  const hoverElementName = environment.createElement("div", "ag-overlay-hover-element-name");
  hoverTooltip.append(hoverComponentPath, hoverElementName);
  layer.append(hoverHighlight, outlineGroup, highlightGroup, dragSelection, hoverTooltip);
  root.append(backdrop, notice, layer);
  const outlinePool = createBoxPool(environment, outlineGroup, "ag-overlay-outline");
  const highlightPool = createBoxPool(
    environment,
    highlightGroup,
    "ag-overlay-selected-element-highlight"
  );
  opacityInput.addEventListener(
    "input",
    () => dispatch({ type: "layout-wireframe-opacity", opacity: Number(opacityInput.value) }),
    { signal }
  );
  startOver.addEventListener("click", () => dispatch({ type: "layout-start-over" }), {
    signal
  });
  let canvasOpacity = "";
  return {
    root,
    update(model, _config) {
      root.classList.toggle("is-editing", model.editor !== null);
      const hover = model.active && model.editor === null && !model.scrolling && model.dragSelection === null ? model.hover : null;
      hoverHighlight.hidden = hover === null;
      hoverTooltip.hidden = hover === null;
      if (hover) {
        setOffsetBox(hoverHighlight, hover.rect);
        const componentPath = hover.componentPath ?? "";
        hoverComponentPath.hidden = componentPath === "";
        if (hoverComponentPath.textContent !== componentPath) {
          hoverComponentPath.textContent = componentPath;
        }
        if (hoverElementName.textContent !== hover.elementName) {
          hoverElementName.textContent = hover.elementName;
        }
        hoverTooltip.style.left = `${Math.max(
          8,
          Math.min(hover.pointer.x, environment.innerWidth - 100)
        )}px`;
        hoverTooltip.style.top = `${Math.max(
          hover.pointer.y - (componentPath ? 48 : 32),
          8
        )}px`;
      }
      const outlines = model.active ? model.outlines : NO_OUTLINES;
      const outlineNodes = outlinePool.resize(outlines.length);
      const outlinesExiting = model.editor?.exiting === true;
      for (let index = 0; index < outlines.length; index += 1) {
        const outline = outlines[index];
        const node = outlineNodes[index];
        node.classList.toggle("ag-overlay-outline-multi", outline.kind === "multi");
        node.classList.toggle("ag-overlay-outline-single", outline.kind === "single");
        node.classList.toggle("is-exiting", outlinesExiting);
        setOffsetBox(node, outline.rect);
      }
      const selection = model.active ? model.dragSelection : null;
      dragSelection.hidden = selection === null;
      if (selection) setTranslatedBox(dragSelection, selection);
      const highlights = selection ? model.dragHighlights : NO_BOXES;
      const highlightNodes = highlightPool.resize(highlights.length);
      for (let index = 0; index < highlights.length; index += 1) {
        setTranslatedBox(highlightNodes[index], highlights[index]);
      }
      const { layout } = model;
      const backdropMounted = layout.active || layout.exiting;
      backdrop.hidden = !backdropMounted;
      backdrop.classList.toggle("is-visible", backdropMounted && layout.wireframeReady);
      backdrop.classList.toggle("is-grid-active", backdropMounted && layout.interacting);
      const opacity = String(layout.wireframeOpacity);
      if (opacity !== canvasOpacity) {
        canvasOpacity = opacity;
        backdrop.style.setProperty("--canvas-opacity", opacity);
        if (opacityInput.value !== opacity) opacityInput.value = opacity;
      }
      notice.hidden = !(layout.active && layout.wireframe && layout.wireframeReady);
    },
    destroy() {
      controller.abort();
    }
  };
}

// src/browser/view/popup.ts
var CAMEL_BOUNDARY = /([A-Z])/g;
var HORIZONTAL_MARGIN = 160;
var FLIP_THRESHOLD = 290;
var MARKER_GAP = 20;
var QUOTE_LIMIT2 = 80;
var EMPTY_DRAFT_MESSAGE = "Enter feedback before submitting.";
function placeholderFor(editor) {
  if (editor.mode === "edit") return "Edit your feedback...";
  if (editor.element === "Area selection") return "What should change in this area?";
  if (editor.isMultiSelect) return "Feedback for this group of elements...";
  return "What should change?";
}
function createPopupRegion(environment, dispatch) {
  const controller = new environment.AbortController();
  const { signal } = controller;
  const { timers } = environment;
  const root = environment.createElement("div", "ag-popup");
  root.setAttribute("data-agentation-ui", "popup");
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
    "aria-hidden": "true"
  });
  chevron.append(
    environment.createSvg("path", {
      d: "M5.5 10.25L9 7.25L5.75 4",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    })
  );
  const toggleLabel = environment.createElement("span", "ag-popup-element");
  toggle.append(chevron, toggleLabel);
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
  const styleRows = /* @__PURE__ */ new Map();
  let session = null;
  let animState = "initial";
  let expanded = false;
  let enterTimer;
  let enteredTimer;
  let focusTimer;
  let cancelTimer;
  let shakeTimer;
  let refocusTimer;
  function focusBypassingTraps() {
    const trap = (event) => event.stopImmediatePropagation();
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
  function isTextareaFocused() {
    const containing = textarea.getRootNode();
    const active = containing instanceof environment.ShadowRoot ? containing.activeElement : environment.document.activeElement;
    return active === textarea;
  }
  function focusEditor() {
    if (isTextareaFocused()) return;
    focusBypassingTraps();
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
    textarea.scrollTop = textarea.scrollHeight;
  }
  function setAnimState(next) {
    if (animState === next) return;
    animState = next;
    root.classList.toggle("is-enter", next === "enter");
    root.classList.toggle("is-entered", next === "entered");
    root.classList.toggle("is-exit", next === "exit");
  }
  function clearTimers() {
    timers.clearTimeout(enterTimer);
    timers.clearTimeout(enteredTimer);
    timers.clearTimeout(focusTimer);
    timers.clearTimeout(cancelTimer);
    timers.clearTimeout(shakeTimer);
    timers.clearTimeout(refocusTimer);
    enterTimer = void 0;
    enteredTimer = void 0;
    focusTimer = void 0;
    cancelTimer = void 0;
    shakeTimer = void 0;
    refocusTimer = void 0;
  }
  function beginSession() {
    clearTimers();
    root.classList.remove("is-shaking");
    setAnimState("initial");
    expanded = false;
    applyExpanded();
    status.textContent = "";
    enterTimer = timers.setTimeout(() => {
      if (animState !== "exit") setAnimState("enter");
    }, 0);
    enteredTimer = timers.setTimeout(() => {
      if (animState !== "exit") setAnimState("entered");
    }, 200);
    focusTimer = timers.setTimeout(focusEditor, 50);
  }
  function shakeEditor() {
    timers.clearTimeout(shakeTimer);
    root.classList.remove("is-shaking");
    void root.offsetWidth;
    root.classList.add("is-shaking");
    shakeTimer = timers.setTimeout(() => {
      shakeTimer = void 0;
      root.classList.remove("is-shaking");
      focusBypassingTraps();
    }, 250);
  }
  function requestCancel() {
    setAnimState("exit");
    timers.clearTimeout(cancelTimer);
    cancelTimer = timers.setTimeout(() => {
      cancelTimer = void 0;
      dispatch({ type: "editor-cancel" });
    }, 150);
  }
  function requestSubmit() {
    const draft = textarea.value;
    if (!draft.trim()) {
      status.textContent = EMPTY_DRAFT_MESSAGE;
      shakeEditor();
      return;
    }
    dispatch({ type: "editor-submit", draft: draft.trim() });
  }
  function applyExpanded() {
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    chevron.classList.toggle("is-expanded", expanded);
    stylesWrapper.classList.toggle("is-expanded", expanded);
  }
  function syncSubmitState() {
    submitButton.setAttribute(
      "aria-disabled",
      textarea.value.trim() ? "false" : "true"
    );
  }
  function updateStyleRows(styles) {
    const entries = styles ? Object.entries(styles) : [];
    let previous = null;
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
          environment.document.createTextNode(";")
        );
        row = { line, value: valueNode };
        styleRows.set(key, row);
      }
      if (row.value.textContent !== value) row.value.textContent = value;
      const expected = previous === null ? stylesBlock.firstChild : previous.nextSibling;
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
  function position(editor) {
    const markerY = editor.isFixed ? editor.y : editor.y - environment.scrollY;
    const left = Math.max(
      HORIZONTAL_MARGIN,
      Math.min(
        environment.innerWidth - HORIZONTAL_MARGIN,
        editor.x / 100 * environment.innerWidth
      )
    );
    root.style.left = `${left}px`;
    if (markerY > environment.innerHeight - FLIP_THRESHOLD) {
      root.style.top = "";
      root.style.bottom = `${environment.innerHeight - markerY + MARKER_GAP}px`;
    } else {
      root.style.bottom = "";
      root.style.top = `${markerY + MARKER_GAP}px`;
    }
  }
  root.addEventListener("click", (event) => event.stopPropagation(), { signal });
  textarea.addEventListener(
    "keydown",
    (event) => {
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
    { signal }
  );
  textarea.addEventListener(
    "input",
    () => {
      status.textContent = "";
      syncSubmitState();
      dispatch({ type: "editor-input", draft: textarea.value });
    },
    { signal }
  );
  toggle.addEventListener(
    "click",
    () => {
      const wasExpanded = expanded;
      expanded = !expanded;
      applyExpanded();
      if (!wasExpanded) return;
      timers.clearTimeout(refocusTimer);
      refocusTimer = timers.setTimeout(() => {
        refocusTimer = void 0;
        focusBypassingTraps();
      }, 0);
    },
    { signal }
  );
  cancelButton.addEventListener("click", requestCancel, { signal });
  submitButton.addEventListener("click", requestSubmit, { signal });
  deleteButton.addEventListener(
    "click",
    () => dispatch({ type: "editor-delete" }),
    { signal }
  );
  return {
    root,
    focusEditor,
    shakeEditor,
    update(model, _config) {
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
        editor.y
      ].join("|");
      const fresh = key !== session;
      session = key;
      root.hidden = false;
      if (textarea.value !== editor.draft) textarea.value = editor.draft;
      syncSubmitState();
      if (fresh) beginSession();
      if (editor.exiting) setAnimState("exit");
      root.classList.toggle("is-light", model.theme === "light");
      root.classList.toggle("is-multi", editor.isMultiSelect);
      root.setAttribute("aria-label", `Feedback for ${editor.element}`);
      const hasStyles = editor.computedStyles !== void 0 && Object.keys(editor.computedStyles).length > 0;
      toggle.hidden = !hasStyles;
      plainLabel.hidden = hasStyles;
      stylesWrapper.hidden = !hasStyles;
      if (toggleLabel.textContent !== editor.element) {
        toggleLabel.textContent = editor.element;
        plainLabel.textContent = editor.element;
      }
      updateStyleRows(hasStyles ? editor.computedStyles : void 0);
      const selectedText = editor.selectedText;
      quote.hidden = !selectedText;
      if (selectedText) {
        const text = `\u201C${selectedText.slice(0, QUOTE_LIMIT2)}${selectedText.length > QUOTE_LIMIT2 ? "..." : ""}\u201D`;
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
    destroy() {
      controller.abort();
      clearTimers();
    }
  };
}

// src/browser/view/settings.ts
var HELP_SHOW_DELAY = 500;
var HELP_HIDE_DELAY = 150;
var HELP_GAP = 8;
var NEAR_BOTTOM_THRESHOLD = 230;
var WORDMARK_VIEW_BOX = "0 0 676 151";
var WORDMARK_PATH = "M79.6666 100.561L104.863 15.5213C107.828 4.03448 99.1201 -3.00582 88.7449 1.25541L3.52015 39.6065C1.48217 40.5329 0 42.7562 0 45.1647C0 48.6848 2.77907 51.4639 6.29922 51.4639C7.22558 51.4639 8.15193 51.2786 9.07829 50.9081L93.7472 12.7422C97.2674 11.0748 93.7472 8.29572 92.6356 12.1864L67.624 97.2259C66.5123 100.931 69.4767 105.193 73.7379 105.193C76.517 105.193 79.1108 103.155 79.6666 100.561ZM663.641 100.005C665.679 107.231 677.537 104.081 675.499 96.8553L666.05 66.2856C663.456 57.7631 655.489 55.7251 648.82 61.098L618.991 86.6654C617.324 87.9623 621.029 89.815 621.214 88.1476L625.846 61.6538C626.958 55.3546 624.179 50.5375 615.841 50.5375L579.158 51.0934C576.008 51.0934 578.417 53.8724 578.417 57.022C578.417 60.1716 580.825 61.6538 583.975 61.6538L616.212 60.9127C616.397 60.9127 614.544 59.6158 614.544 59.8011L609.727 88.7034C607.875 99.6344 617.694 102.784 626.031 95.7437L655.86 70.1763L654.192 69.6205L663.641 100.005ZM571.191 89.0739C555.443 88.7034 562.298 61.4685 578.787 61.8391C594.72 62.0243 587.124 89.2592 571.191 89.0739ZM571.006 100.375C601.575 100.931 611.024 51.6492 579.158 51.0934C547.847 50.5375 540.065 99.8197 571.006 100.375ZM521.909 46.4616C525.985 46.4616 529.505 42.9414 529.505 38.6802C529.505 34.4189 525.985 31.0841 521.909 31.0841C517.833 31.0841 514.127 34.6042 514.127 38.6802C514.127 42.7562 517.648 46.4616 521.909 46.4616ZM472.256 103.525C493.192 103.71 515.98 73.3259 519.13 62.3949L509.866 60.9127C505.234 73.3259 497.638 101.672 519.871 102.043C536.545 102.228 552.479 85.3685 563.595 70.1763C564.151 69.2499 564.706 68.1383 564.706 66.8414C564.706 63.6918 563.965 61.098 560.816 61.098C558.963 61.098 557.296 62.0243 556.184 63.5065C546.365 77.0313 530.802 90.9266 522.094 90.7414C511.904 90.5561 517.462 71.4732 519.871 64.9887C523.391 55.7251 512.831 53.5019 509.681 60.9127C506.531 68.6941 488.19 92.4088 475.035 92.2235C467.439 92.0383 464.29 83.8863 472.441 59.9864L486.707 17.7445C487.634 14.4097 485.41 10.519 481.334 10.519C478.741 10.519 476.517 12.1864 475.962 14.4097L461.696 56.4662C451.506 86.4801 455.211 103.155 472.256 103.525ZM447.43 42.5709L496.527 41.4593C499.306 41.4593 501.529 39.0507 501.529 36.2717C501.529 33.3073 499.306 31.0841 496.341 31.0841L447.245 32.1957C444.466 32.1957 442.242 34.4189 442.242 37.3833C442.242 40.1624 444.466 42.5709 447.43 42.5709ZM422.974 106.304C435.387 106.489 457.249 94.8173 472.441 53.8724C473.553 50.7228 472.071 48.3143 468.365 48.3143C466.142 48.3143 464.29 49.6112 463.548 51.6492C450.394 87.2212 431.682 96.1142 424.456 95.929C419.454 95.929 417.972 93.3352 418.713 85.5538C419.454 78.1429 410.376 74.9933 406.114 81.1073C401.297 87.777 394.442 94.2615 385.549 94.0763C370.172 93.891 376.471 67.0267 399.815 67.3972C408.338 67.5825 414.452 71.4732 417.045 76.6608C417.786 78.3282 419.454 79.6251 421.492 79.6251C424.271 79.6251 426.679 77.2166 426.679 74.4375C426.679 73.6964 426.494 72.9553 426.124 72.2143C421.862 63.6918 412.414 57.3926 400 57.2073C363.502 56.6515 353.497 104.451 383.326 104.822C397.036 105.193 410.005 94.0763 413.34 85.9243C412.599 86.8507 408.338 86.6654 408.523 84.4422C407.411 97.4111 410.931 106.119 422.974 106.304ZM335.897 104.266C335.897 115.012 347.569 117.606 347.569 103.34C347.569 89.0739 358.5 54.4282 361.464 45.1647L396.666 43.6825C405.929 43.1267 404.262 33.1221 397.036 33.3073L364.984 34.4189L368.875 22.7469C369.801 20.1531 370.542 17.9298 370.542 16.2624C370.542 13.4833 368.504 11.8159 365.911 11.8159C362.946 11.8159 360.352 12.7422 357.573 21.0794L352.942 35.16L330.153 36.0864C326.263 36.4569 323.483 38.1244 323.483 41.6445C323.483 45.5352 326.448 47.0174 330.709 46.8321L349.421 45.9058C345.901 56.6515 335.897 90.7414 335.897 104.266ZM186.939 78.6988C193.979 56.4662 212.877 54.984 212.877 62.9507C212.877 68.3236 203.984 77.0313 186.939 78.6988ZM113.942 150.955C142.844 152.437 159.704 111.492 160.63 80.5515C161.556 73.3259 153.96 70.3616 148.773 75.7344C141.918 83.1453 129.505 93.1499 119.685 93.1499C103.011 93.1499 116.165 59.8011 143.956 59.8011C149.514 59.8011 153.59 61.6538 156.184 64.0623C160.815 68.3236 170.82 62.0243 165.818 56.0957C161.927 51.4639 155.072 48.129 144.882 48.129C102.455 48.129 83.7426 105.007 116.721 105.007C134.692 105.007 151.367 88.3329 155.257 82.7747C154.516 83.5158 149.329 81.2925 149.699 79.4398L149.143 83.5158C148.958 107.045 134.322 141.506 116.536 139.838C113.386 139.468 112.089 137.43 112.089 134.836C112.089 128.907 122.094 119.273 145.067 113.53C159.518 109.824 152.293 101.487 143.4 104.081C111.163 113.53 99.6759 127.425 99.6759 137.8C99.6759 145.026 105.605 150.584 113.942 150.955ZM194.72 109.454C214.359 109.454 239 95.3732 251.228 77.9577C250.301 82.96 246.596 96.8553 246.596 101.487C246.596 110.01 254.748 109.454 261.232 102.784L288.097 75.5491L290.32 85.7391C293.284 99.4491 299.213 104.822 308.847 104.822C326.263 104.822 342.196 85.7391 349.421 74.8081L344.049 63.6918C339.787 74.8081 321.631 92.5941 311.626 92.5941C306.994 92.5941 304.771 89.815 303.289 83.7011L300.325 71.2879C297.916 60.7275 289.023 58.3189 279.018 68.1383L261.788 84.8127L264.382 69.991C266.235 59.2453 255.674 58.1337 250.116 65.915C241.779 77.0313 216.767 97.7817 196.387 97.7817C187.865 97.7817 185.456 93.7057 185.456 88.3329C230.848 84.998 239.185 47.2027 208.986 47.2027C172.858 47.2027 157.11 109.454 194.72 109.454Z";
function isValidUrl(environment, value) {
  if (!value || !value.trim()) return false;
  try {
    const url = new environment.window.URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
function createSettingsRegion(environment, dispatch) {
  const listeners = new environment.AbortController();
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
    "ag-settings-page ag-settings-automations-page"
  );
  let helpCount = 0;
  const helps = [];
  function createHelp(content) {
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
    const bubble = environment.createElement("div", "ag-settings-tooltip");
    bubble.setAttribute("aria-hidden", "true");
    bubble.hidden = true;
    const bubbleText = environment.document.createTextNode(content);
    bubble.append(bubbleText);
    root.append(bubble);
    let showTimer;
    let hideTimer;
    const show2 = () => {
      environment.timers.clearTimeout(hideTimer);
      hideTimer = void 0;
      bubble.hidden = false;
      const rect = trigger.getBoundingClientRect();
      bubble.style.top = `${rect.top + rect.height / 2}px`;
      bubble.style.right = `${environment.innerWidth - rect.left + HELP_GAP}px`;
      environment.timers.clearTimeout(showTimer);
      showTimer = environment.timers.setTimeout(() => {
        showTimer = void 0;
        bubble.classList.add("is-visible");
      }, HELP_SHOW_DELAY);
    };
    const hide = () => {
      environment.timers.clearTimeout(showTimer);
      showTimer = void 0;
      bubble.classList.remove("is-visible");
      environment.timers.clearTimeout(hideTimer);
      hideTimer = environment.timers.setTimeout(() => {
        hideTimer = void 0;
        bubble.hidden = true;
      }, HELP_HIDE_DELAY);
    };
    const clearTimers = () => {
      environment.timers.clearTimeout(showTimer);
      environment.timers.clearTimeout(hideTimer);
      showTimer = void 0;
      hideTimer = void 0;
    };
    trigger.addEventListener("pointerenter", show2, {
      signal: listeners.signal
    });
    trigger.addEventListener("pointerleave", hide, { signal: listeners.signal });
    trigger.addEventListener("focus", show2, { signal: listeners.signal });
    trigger.addEventListener("blur", hide, { signal: listeners.signal });
    const help = {
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
      destroy: clearTimers
    };
    helps.push(help);
    return help;
  }
  function createSwitch(id) {
    const switchContainer = environment.createElement(
      "div",
      "ag-settings-switch"
    );
    const input = environment.createElement(
      "input",
      "ag-settings-switch-input"
    );
    input.type = "checkbox";
    input.id = id;
    const thumb = environment.createElement("div", "ag-settings-switch-thumb");
    switchContainer.append(input, thumb);
    return { container: switchContainer, input };
  }
  function createCheckbox(id) {
    const checkboxContainer = environment.createElement(
      "div",
      "ag-settings-checkbox"
    );
    const input = environment.createElement(
      "input",
      "ag-settings-checkbox-input"
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
      focusable: "false"
    });
    check.append(
      environment.createSvg("path", {
        class: "ag-settings-checkbox-check-path",
        d: "M3.94 7L6.13 9.19L10.5 4.81",
        stroke: "currentColor",
        "stroke-width": "1.5",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      })
    );
    checkboxContainer.append(input, check);
    return { container: checkboxContainer, input };
  }
  function createDivider() {
    const divider = environment.createElement("div", "ag-settings-divider");
    divider.setAttribute("aria-hidden", "true");
    return divider;
  }
  function createBoundLabel(text, forId) {
    const box2 = environment.createElement("div", "ag-settings-label");
    const label2 = environment.createElement("label");
    label2.htmlFor = forId;
    label2.textContent = text;
    box2.append(label2);
    return box2;
  }
  function createCheckboxField(id, text, tooltip) {
    const field = environment.createElement(
      "div",
      "ag-settings-checkbox-field"
    );
    const checkbox = createCheckbox(id);
    const label2 = environment.createElement(
      "label",
      "ag-settings-checkbox-label"
    );
    label2.htmlFor = id;
    label2.textContent = text;
    field.append(checkbox.container, label2);
    if (tooltip !== void 0) {
      const help = createHelp(tooltip);
      field.append(help.trigger, help.description);
    }
    return { root: field, input: checkbox.input };
  }
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
    focusable: "false"
  });
  wordmark.append(
    environment.createSvg("path", {
      d: WORDMARK_PATH,
      fill: "currentColor"
    })
  );
  const brandName = environment.createElement("span", "ag-visually-hidden");
  brandName.textContent = "Agentation";
  brand.append(wordmark, brandName);
  const version = environment.createElement("p", "ag-settings-version");
  version.textContent = `v${"3.0.2"}`;
  const themeToggle = environment.createElement(
    "button",
    "ag-settings-theme-toggle"
  );
  themeToggle.type = "button";
  const themeIconWrapper = environment.createElement(
    "span",
    "ag-settings-theme-icon-wrapper"
  );
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
    { signal: listeners.signal }
  );
  header.append(brand, version, themeToggle);
  const controlsSection = environment.createElement(
    "div",
    "ag-settings-section"
  );
  const detailRow = environment.createElement("div", "ag-settings-row");
  const detailLabel = environment.createElement("div", "ag-settings-label");
  detailLabel.append(environment.document.createTextNode("Output Detail"));
  const detailHelp = createHelp(
    "Controls how much detail is included in the copied output"
  );
  detailLabel.append(detailHelp.trigger, detailHelp.description);
  const cycleButton = environment.createElement("button", "ag-settings-cycle");
  cycleButton.type = "button";
  cycleButton.setAttribute("aria-label", "Output detail");
  const cycleSlots = [0, 1].map(
    () => {
      const node = environment.createElement("span", "ag-settings-cycle-text");
      const text = environment.document.createTextNode("");
      node.append(text);
      node.hidden = true;
      cycleButton.append(node);
      return { node, text };
    }
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
        (option) => option.value === current
      );
      const next = OUTPUT_DETAIL_OPTIONS[(index + 1) % OUTPUT_DETAIL_OPTIONS.length];
      dispatch({
        type: "settings-change",
        patch: { outputDetail: next.value }
      });
    },
    { signal: listeners.signal }
  );
  detailRow.append(detailLabel, cycleButton);
  const metadataRow = environment.createElement(
    "div",
    "ag-settings-row ag-settings-row-margin-top"
  );
  const metadataLabel = createBoundLabel(
    "Component Metadata",
    "agentation-metadata-enabled"
  );
  const metadataHelp = createHelp("");
  metadataLabel.append(metadataHelp.trigger, metadataHelp.description);
  const metadataSwitch = createSwitch("agentation-metadata-enabled");
  metadataSwitch.input.addEventListener(
    "change",
    () => dispatch({
      type: "settings-change",
      patch: { metadataEnabled: metadataSwitch.input.checked }
    }),
    { signal: listeners.signal }
  );
  metadataRow.append(metadataLabel, metadataSwitch.container);
  const hideRow = environment.createElement(
    "div",
    "ag-settings-row ag-settings-row-margin-top"
  );
  const hideLabel = createBoundLabel(
    "Hide Until Restart",
    "agentation-hide-until-restart"
  );
  const hideHelp = createHelp("Hides the toolbar until you open a new tab");
  hideLabel.append(hideHelp.trigger, hideHelp.description);
  const hideSwitch = createSwitch("agentation-hide-until-restart");
  hideSwitch.input.addEventListener(
    "change",
    () => {
      if (!hideSwitch.input.checked) return;
      hideSwitch.input.checked = false;
      dispatch({ type: "hide-until-restart" });
    },
    { signal: listeners.signal }
  );
  hideRow.append(hideLabel, hideSwitch.container);
  controlsSection.append(detailRow, metadataRow, hideRow);
  const colorSection = environment.createElement("div", "ag-settings-section");
  const colorLabel = environment.createElement("div", "ag-settings-label");
  colorLabel.id = "agentation-marker-color-label";
  colorLabel.textContent = "Marker Color";
  const colorOptions = environment.createElement(
    "div",
    "ag-settings-color-options"
  );
  colorOptions.setAttribute("role", "group");
  colorOptions.setAttribute("aria-labelledby", colorLabel.id);
  const swatches = ACCENT_OPTIONS.map((accent) => {
    const button = environment.createElement(
      "button",
      "ag-settings-color-option"
    );
    button.type = "button";
    button.title = accent.label;
    button.setAttribute("aria-label", accent.label);
    button.style.setProperty("--swatch", accent.srgb);
    button.style.setProperty("--swatch-p3", accent.p3);
    button.addEventListener(
      "click",
      () => dispatch({
        type: "settings-change",
        patch: { annotationColorId: accent.id }
      }),
      { signal: listeners.signal }
    );
    colorOptions.append(button);
    return { id: accent.id, button };
  });
  colorSection.append(colorLabel, colorOptions);
  const checkboxSection = environment.createElement(
    "div",
    "ag-settings-section"
  );
  const autoClearField = createCheckboxField(
    "agentation-auto-clear",
    "Clear on copy/send",
    "Automatically clear annotations after copying"
  );
  autoClearField.input.addEventListener(
    "change",
    () => dispatch({
      type: "settings-change",
      patch: { autoClearAfterCopy: autoClearField.input.checked }
    }),
    { signal: listeners.signal }
  );
  const blockField = createCheckboxField(
    "agentation-block-interactions",
    "Block page interactions",
    void 0
  );
  blockField.input.addEventListener(
    "change",
    () => dispatch({
      type: "settings-change",
      patch: { blockInteractions: blockField.input.checked }
    }),
    { signal: listeners.signal }
  );
  checkboxSection.append(autoClearField.root, blockField.root);
  const navButton = environment.createElement("button", "ag-settings-nav-link");
  navButton.type = "button";
  const navLabel = environment.createElement("span");
  navLabel.textContent = "Manage MCP & Webhooks";
  const navRight = environment.createElement(
    "span",
    "ag-settings-nav-link-right"
  );
  const navIndicator = environment.createElement(
    "span",
    "ag-settings-mcp-nav-indicator"
  );
  navIndicator.setAttribute("aria-hidden", "true");
  navIndicator.hidden = true;
  const navChevron = environment.createSvg("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": "true",
    focusable: "false"
  });
  navChevron.append(
    environment.createSvg("path", {
      d: "M7.5 12.5L12 8L7.5 3.5",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    })
  );
  navRight.append(navIndicator, navChevron);
  navButton.append(navLabel, navRight);
  navButton.addEventListener(
    "click",
    () => dispatch({ type: "settings-page", page: "automations" }),
    { signal: listeners.signal }
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
    navButton
  );
  const backButton = environment.createElement(
    "button",
    "ag-settings-back-button"
  );
  backButton.type = "button";
  backButton.append(createIcon(environment, "chevron-left", 16));
  const backLabel = environment.createElement("span");
  backLabel.textContent = "Manage MCP & Webhooks";
  backButton.append(backLabel);
  backButton.addEventListener(
    "click",
    () => dispatch({ type: "settings-page", page: "main" }),
    { signal: listeners.signal }
  );
  const mcpSection = environment.createElement("div", "ag-settings-section");
  const mcpRow = environment.createElement("div", "ag-settings-row");
  const mcpHeader = environment.createElement(
    "span",
    "ag-settings-automation-header"
  );
  mcpHeader.append(environment.document.createTextNode("MCP Connection"));
  const mcpHelp = createHelp(
    "Connect via Model Context Protocol to let AI agents like Claude Code receive annotations in real-time."
  );
  mcpHeader.append(mcpHelp.trigger, mcpHelp.description);
  const mcpStatusDot = environment.createElement(
    "div",
    "ag-settings-mcp-status-dot"
  );
  mcpStatusDot.hidden = true;
  mcpRow.append(mcpHeader, mcpStatusDot);
  const mcpDescription = environment.createElement(
    "p",
    "ag-settings-automation-description ag-settings-mcp-description"
  );
  mcpDescription.append(
    environment.document.createTextNode(
      "MCP connection allows agents to receive and act on annotations. "
    )
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
    "ag-settings-section ag-settings-section-grow"
  );
  const webhookRow = environment.createElement("div", "ag-settings-row");
  const webhookHeader = environment.createElement(
    "span",
    "ag-settings-automation-header"
  );
  webhookHeader.append(environment.document.createTextNode("Webhooks"));
  const webhookHelp = createHelp(
    "Send annotation data to any URL endpoint when annotations change. Useful for custom integrations."
  );
  webhookHeader.append(webhookHelp.trigger, webhookHelp.description);
  const autoSend = environment.createElement("div", "ag-settings-auto-send");
  const autoSendLabel = environment.createElement(
    "label",
    "ag-settings-auto-send-label"
  );
  autoSendLabel.htmlFor = "agentation-auto-send";
  autoSendLabel.textContent = "Auto-Send";
  const autoSendSwitch = createSwitch("agentation-auto-send");
  autoSendSwitch.input.addEventListener(
    "change",
    () => dispatch({
      type: "settings-change",
      patch: { webhooksEnabled: autoSendSwitch.input.checked }
    }),
    { signal: listeners.signal }
  );
  autoSend.append(autoSendLabel, autoSendSwitch.container);
  webhookRow.append(webhookHeader, autoSend);
  const webhookDescription = environment.createElement(
    "p",
    "ag-settings-automation-description"
  );
  webhookDescription.textContent = "The webhook URL will receive live annotation changes and annotation data.";
  const webhookField = environment.createElement(
    "div",
    "ag-settings-webhook-field"
  );
  const webhookLabel = environment.createElement("label", "ag-visually-hidden");
  webhookLabel.htmlFor = "agentation-webhook-url";
  webhookLabel.textContent = "Webhook URL";
  const webhookInput = environment.createElement(
    "input",
    "ag-settings-webhook-input"
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
    "ag-settings-webhook-error"
  );
  webhookError.id = "agentation-webhook-error";
  webhookError.setAttribute("aria-live", "polite");
  webhookError.textContent = "Enter a valid http(s) URL.";
  webhookError.hidden = true;
  webhookField.append(webhookLabel, webhookInput, webhookError);
  webhookInput.addEventListener(
    "input",
    () => dispatch({
      type: "settings-change",
      patch: { webhookUrl: webhookInput.value }
    }),
    { signal: listeners.signal }
  );
  webhookInput.addEventListener(
    "keydown",
    (event) => event.stopPropagation(),
    { signal: listeners.signal }
  );
  webhookSection.append(webhookRow, webhookDescription, webhookField);
  automationsPage.append(
    backButton,
    createDivider(),
    mcpSection,
    createDivider(),
    webhookSection
  );
  container.append(mainPage, automationsPage);
  panel.append(container);
  root.append(panel);
  let latestModel;
  let renderedTheme;
  let cycleLabel;
  let cycleSlot = -1;
  function showCycleLabel(label2) {
    if (label2 === cycleLabel) return;
    cycleLabel = label2;
    const next = cycleSlot === 0 ? 1 : 0;
    cycleSlots[next].text.nodeValue = label2;
    cycleSlots[next].node.hidden = false;
    if (cycleSlot >= 0) cycleSlots[cycleSlot].node.hidden = true;
    cycleSlot = next;
  }
  return {
    root,
    update(model, _config) {
      latestModel = model;
      root.hidden = model.hidden;
      const position = model.toolbarPosition;
      root.style.left = position ? `${position.x}px` : "";
      root.style.top = position ? `${position.y}px` : "";
      root.style.right = position ? "auto" : "";
      root.style.bottom = position ? "auto" : "";
      panel.classList.toggle(
        "ag-settings-panel-below",
        position !== null && position.y < NEAR_BOTTOM_THRESHOLD
      );
      panel.classList.toggle("ag-settings-enter", model.settingsOpen);
      panel.classList.toggle("ag-settings-exit", !model.settingsOpen);
      if (model.settingsOpen) panel.removeAttribute("inert");
      else panel.setAttribute("inert", "");
      if (!model.settingsOpen) {
        for (const help of helps) help.hideNow();
      }
      const onAutomations = model.settingsPage === "automations";
      mainPage.classList.toggle("ag-settings-slide-left", onAutomations);
      automationsPage.classList.toggle("ag-settings-slide-in", onAutomations);
      navButton.setAttribute("aria-expanded", String(onAutomations));
      if (model.theme !== renderedTheme) {
        renderedTheme = model.theme;
        const dark = model.theme === "dark";
        sunSlot.hidden = !dark;
        moonSlot.hidden = dark;
        themeToggle.title = dark ? "Switch to light mode" : "Switch to dark mode";
        themeToggle.setAttribute("aria-label", themeToggle.title);
      }
      const detail = model.settings.outputDetail;
      const detailIndex = OUTPUT_DETAIL_OPTIONS.findIndex(
        (option) => option.value === detail
      );
      showCycleLabel(OUTPUT_DETAIL_OPTIONS[detailIndex]?.label ?? "");
      for (let index = 0; index < dots.length; index += 1) {
        dots[index].classList.toggle("is-active", index === detailIndex);
      }
      const adapterIds = model.metadataAdapterIds;
      const hasAdapters = adapterIds.length > 0;
      metadataRow.classList.toggle("ag-settings-row-disabled", !hasAdapters);
      metadataHelp.setContent(
        hasAdapters ? `Include component metadata from: ${adapterIds.join(", ")}` : "No metadata adapters are configured for this page."
      );
      metadataSwitch.input.disabled = !hasAdapters;
      metadataSwitch.input.checked = hasAdapters && model.settings.metadataEnabled;
      hideSwitch.input.checked = false;
      for (const swatch of swatches) {
        const selected = model.settings.annotationColorId === swatch.id;
        swatch.button.classList.toggle("is-selected", selected);
        swatch.button.setAttribute("aria-pressed", String(selected));
      }
      autoClearField.input.checked = model.settings.autoClearAfterCopy;
      blockField.input.checked = model.settings.blockInteractions;
      const connection = model.connection;
      navIndicator.hidden = !model.hasEndpoint || connection === "disconnected";
      navIndicator.classList.toggle("is-connected", connection === "connected");
      navIndicator.classList.toggle(
        "is-connecting",
        connection === "connecting"
      );
      mcpStatusDot.hidden = !model.hasEndpoint;
      mcpStatusDot.classList.toggle("is-connected", connection === "connected");
      mcpStatusDot.classList.toggle(
        "is-connecting",
        connection === "connecting"
      );
      mcpStatusDot.classList.toggle(
        "is-disconnected",
        connection === "disconnected"
      );
      mcpStatusDot.title = connection === "connected" ? "Connected" : connection === "connecting" ? "Connecting..." : "Disconnected";
      const webhookUrl = model.settings.webhookUrl;
      if (webhookInput.value !== webhookUrl) webhookInput.value = webhookUrl;
      const hasWebhookUrl = webhookUrl.trim().length > 0;
      const invalid = hasWebhookUrl && !isValidUrl(environment, webhookUrl);
      webhookError.hidden = !invalid;
      webhookInput.setAttribute("aria-invalid", String(invalid));
      autoSendLabel.classList.toggle(
        "is-active",
        model.settings.webhooksEnabled
      );
      autoSendLabel.classList.toggle("is-disabled", !webhookUrl);
      autoSendSwitch.input.checked = model.settings.webhooksEnabled;
      autoSendSwitch.input.disabled = !webhookUrl;
    },
    destroy() {
      for (const help of helps) help.destroy();
      listeners.abort();
      latestModel = void 0;
    }
  };
}

// src/browser/view/toolbar.ts
var TOOLTIP_SESSION_DELAY = 850;
var WIREFRAME_TINT = "#f97316";
var WIREFRAME_TINT_BACKGROUND = "rgba(249, 115, 22, 0.25)";
function isValidUrl2(environment, value) {
  if (!value || !value.trim()) return false;
  try {
    const url = new environment.window.URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
function countVisibleAnnotations(model) {
  let count = 0;
  for (const annotation of model.annotations) {
    if (model.exitingAnnotationIds.has(annotation.id)) continue;
    if (annotation.kind === "placement" || annotation.kind === "rearrange") {
      continue;
    }
    count += 1;
  }
  return count;
}
function createToolbarRegion(environment, dispatch) {
  const listeners = new environment.AbortController();
  const root = environment.createElement("div", "ag-toolbar");
  root.setAttribute("data-agentation-ui", "toolbar");
  root.setAttribute("part", "toolbar");
  root.setAttribute("data-agentation-toolbar", "");
  root.setAttribute("data-feedback-toolbar", "");
  const container = environment.createElement("div", "ag-toolbar-container");
  const toggleContent = environment.createElement(
    "div",
    "ag-toolbar-toggle-content"
  );
  const toggleIcon = createIcon(environment, "list-sparkle", 24);
  const badge = environment.createElement("span", "ag-toolbar-badge");
  badge.setAttribute("aria-hidden", "true");
  const badgeText = environment.document.createTextNode("");
  badge.append(badgeText);
  toggleContent.append(toggleIcon, badge);
  const controlsContent = environment.createElement(
    "div",
    "ag-toolbar-controls-content"
  );
  const liveStatus = environment.createElement(
    "span",
    "ag-toolbar-live-status ag-visually-hidden"
  );
  liveStatus.setAttribute("aria-live", "polite");
  liveStatus.setAttribute("aria-atomic", "true");
  const liveStatusText = environment.document.createTextNode("");
  liveStatus.append(liveStatusText);
  function createControl(iconName, label2, shortcut, keyshortcut, intent, iconSize = 24) {
    const wrapper = environment.createElement(
      "div",
      "ag-toolbar-button-wrapper"
    );
    const button = environment.createElement(
      "button",
      "ag-toolbar-control-button"
    );
    button.type = "button";
    button.setAttribute("aria-label", label2);
    if (keyshortcut) button.setAttribute("aria-keyshortcuts", keyshortcut);
    const icon = createIcon(environment, iconName, iconSize);
    button.append(icon);
    const tooltip = environment.createElement(
      "span",
      "ag-toolbar-button-tooltip"
    );
    const tooltipLabel = environment.createElement(
      "span",
      "ag-toolbar-tooltip-label"
    );
    const tooltipLabelText = environment.document.createTextNode(label2);
    tooltipLabel.append(tooltipLabelText);
    tooltip.append(tooltipLabel);
    if (shortcut) {
      const chip = environment.createElement("span", "ag-toolbar-shortcut");
      chip.textContent = shortcut;
      tooltip.append(chip);
    }
    button.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
        dispatch({ type: "tooltips-hidden", hidden: true });
        intent();
      },
      { signal: listeners.signal }
    );
    wrapper.append(button, tooltip);
    controlsContent.append(wrapper);
    return { wrapper, button, icon, label: tooltipLabelText };
  }
  const freeze = createControl(
    "pause-play",
    "Pause animations",
    "P",
    "p",
    () => dispatch({ type: "toggle-freeze" })
  );
  const layout = createControl(
    "layout",
    "Layout mode",
    "L",
    "l",
    () => dispatch({ type: "toggle-layout" }),
    21
  );
  const markers = createControl(
    "eye",
    "Show markers",
    "H",
    "h",
    () => dispatch({ type: "toggle-markers" })
  );
  const copy = createControl(
    "copy",
    "Copy feedback",
    "C",
    "c",
    () => dispatch({ type: "copy" })
  );
  const send = createControl(
    "send-arrow",
    "Send Annotations",
    "S",
    "s",
    () => dispatch({ type: "submit" })
  );
  send.wrapper.classList.add("ag-toolbar-send");
  const sendBadge = environment.createElement(
    "span",
    "ag-toolbar-button-badge"
  );
  sendBadge.setAttribute("aria-hidden", "true");
  const sendBadgeText = environment.document.createTextNode("");
  sendBadge.append(sendBadgeText);
  send.button.append(sendBadge);
  const clear = createControl(
    "trash-alt",
    "Clear all",
    "X",
    "x",
    () => dispatch({ type: "clear" })
  );
  clear.button.setAttribute("data-danger", "true");
  const settings = createControl(
    "gear",
    "Settings",
    void 0,
    void 0,
    () => dispatch({ type: "toggle-settings" })
  );
  const indicator = environment.createElement(
    "span",
    "ag-toolbar-mcp-indicator"
  );
  indicator.setAttribute("aria-hidden", "true");
  settings.wrapper.append(indicator);
  const divider = environment.createElement("div", "ag-toolbar-divider");
  divider.setAttribute("aria-hidden", "true");
  controlsContent.append(divider);
  const exit = createControl(
    "xmark-large",
    "Exit",
    "Esc",
    "Escape",
    () => dispatch({ type: "deactivate" })
  );
  container.append(toggleContent, controlsContent);
  root.append(container, liveStatus);
  let tooltipTimer;
  let suppressActivation = false;
  let dragActive = false;
  let latestModel;
  function clearTooltipTimer() {
    environment.timers.clearTimeout(tooltipTimer);
    tooltipTimer = void 0;
  }
  controlsContent.addEventListener(
    "mouseenter",
    () => {
      clearTooltipTimer();
      tooltipTimer = environment.timers.setTimeout(() => {
        tooltipTimer = void 0;
        dispatch({ type: "tooltip-session", active: true });
      }, TOOLTIP_SESSION_DELAY);
    },
    { signal: listeners.signal }
  );
  controlsContent.addEventListener(
    "mouseleave",
    () => {
      clearTooltipTimer();
      dispatch({ type: "tooltip-session", active: false });
      dispatch({ type: "tooltips-hidden", hidden: false });
    },
    { signal: listeners.signal }
  );
  container.addEventListener(
    "click",
    (event) => {
      if (latestModel?.active) return;
      if (suppressActivation) {
        suppressActivation = false;
        event.preventDefault();
        return;
      }
      dispatch({ type: "activate" });
    },
    { signal: listeners.signal }
  );
  container.addEventListener(
    "keydown",
    (event) => {
      if (latestModel?.active) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      dispatch({ type: "activate" });
    },
    { signal: listeners.signal }
  );
  container.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target;
      if (!(target instanceof environment.Element) || target.closest("button, [data-agentation-settings-panel]")) {
        return;
      }
      dragActive = true;
      dispatch({
        type: "drag-start",
        pointerX: event.clientX,
        pointerY: event.clientY
      });
    },
    { signal: listeners.signal }
  );
  environment.document.addEventListener(
    "pointermove",
    (event) => {
      if (!dragActive) return;
      dispatch({
        type: "drag-move",
        pointerX: event.clientX,
        pointerY: event.clientY
      });
    },
    { signal: listeners.signal }
  );
  const endDrag = () => {
    if (!dragActive) return;
    dragActive = false;
    suppressActivation = latestModel?.dragging ?? false;
    dispatch({ type: "drag-end" });
  };
  environment.document.addEventListener("pointerup", endDrag, {
    signal: listeners.signal
  });
  environment.document.addEventListener("pointercancel", endDrag, {
    signal: listeners.signal
  });
  return {
    root,
    update(model, config) {
      latestModel = model;
      root.hidden = model.hidden;
      const position = model.toolbarPosition;
      root.style.left = position ? `${position.x}px` : "";
      root.style.top = position ? `${position.y}px` : "";
      root.style.right = position ? "auto" : "";
      root.style.bottom = position ? "auto" : "";
      const annotationCount = model.annotations.length;
      const visibleCount = countVisibleAnnotations(model);
      const layoutContent = model.layout.placements.length > 0 || (model.layout.rearrange?.sections.length ?? 0) > 0;
      const wireframe = model.layout.active && model.layout.wireframe;
      const copyDisabled = wireframe ? !layoutContent : annotationCount === 0 && !layoutContent;
      const clearDisabled = annotationCount === 0 && !layoutContent;
      const effectiveWebhook = model.settings.webhookUrl || config.webhookUrl;
      const sendAvailable = model.hasEndpoint || isValidUrl2(environment, effectiveWebhook) || typeof config.onSubmit === "function";
      const sendResult = model.sendState === "sent" || model.sendState === "failed";
      container.classList.toggle("is-collapsed", !model.active);
      container.classList.toggle("is-expanded", model.active);
      container.classList.toggle("is-entrance", model.entrance);
      container.classList.toggle("is-hiding", model.hiding);
      container.classList.toggle("is-send-available", sendAvailable);
      if (model.active) {
        container.removeAttribute("role");
        container.removeAttribute("aria-label");
        container.removeAttribute("aria-expanded");
        container.removeAttribute("title");
        container.tabIndex = -1;
      } else {
        container.setAttribute("role", "button");
        container.setAttribute("aria-label", "Start feedback mode");
        container.setAttribute("aria-expanded", "false");
        container.title = "Start feedback mode";
        container.tabIndex = 0;
      }
      toggleContent.classList.toggle("is-visible", !model.active);
      toggleContent.classList.toggle("is-hidden", model.active);
      controlsContent.classList.toggle("is-visible", model.active);
      controlsContent.classList.toggle("is-hidden", !model.active);
      controlsContent.classList.toggle(
        "ag-toolbar-tooltip-below",
        position !== null && position.y < 100
      );
      controlsContent.classList.toggle(
        "ag-toolbar-tooltips-hidden",
        model.tooltipsHidden || model.settingsOpen
      );
      controlsContent.classList.toggle(
        "ag-toolbar-tooltips-in-session",
        model.tooltipSession
      );
      freeze.wrapper.classList.toggle(
        "ag-toolbar-button-wrapper-align-left",
        position !== null && position.x < 120
      );
      exit.wrapper.classList.toggle(
        "ag-toolbar-button-wrapper-align-right",
        position !== null && position.x > environment.innerWidth - 120
      );
      badge.hidden = visibleCount === 0;
      badgeText.nodeValue = String(visibleCount);
      badge.classList.toggle("is-fade-out", model.active);
      badge.classList.toggle("is-entrance", model.entrance);
      const freezeLabel = model.frozen ? "Resume animations" : "Pause animations";
      freeze.button.setAttribute("aria-label", freezeLabel);
      freeze.button.setAttribute("aria-pressed", String(model.frozen));
      freeze.button.setAttribute("data-active", String(model.frozen));
      freeze.label.nodeValue = freezeLabel;
      setIconState(freeze.icon, { paused: model.frozen });
      const layoutLabel = model.layout.active ? "Exit layout mode" : "Layout mode";
      layout.button.setAttribute("aria-label", layoutLabel);
      layout.button.setAttribute("aria-pressed", String(model.layout.active));
      layout.button.setAttribute("data-active", String(model.layout.active));
      layout.label.nodeValue = layoutLabel;
      layout.button.style.color = wireframe ? WIREFRAME_TINT : "";
      layout.button.style.background = wireframe ? WIREFRAME_TINT_BACKGROUND : "";
      const markersLabel = model.markersVisible ? "Hide markers" : "Show markers";
      markers.button.disabled = annotationCount === 0 || model.layout.active;
      markers.button.setAttribute("aria-label", markersLabel);
      markers.button.setAttribute("aria-pressed", String(model.markersVisible));
      markers.label.nodeValue = markersLabel;
      setIconState(markers.icon, { open: model.markersVisible });
      const copyLabel = wireframe ? "Copy layout" : "Copy feedback";
      copy.button.disabled = copyDisabled;
      copy.button.setAttribute("aria-label", copyLabel);
      copy.button.setAttribute("data-active", String(model.copied));
      copy.button.classList.toggle("ag-toolbar-status-showing", model.copied);
      copy.label.nodeValue = copyLabel;
      setIconState(copy.icon, {
        copied: model.copied,
        tint: wireframe && layoutContent ? WIREFRAME_TINT : void 0
      });
      send.wrapper.classList.toggle("is-send-visible", sendAvailable);
      send.button.disabled = !sendAvailable || annotationCount === 0 || model.sendState === "sending";
      send.button.tabIndex = sendAvailable ? 0 : -1;
      send.button.setAttribute("data-no-hover", String(sendResult));
      send.button.classList.toggle("ag-toolbar-status-showing", sendResult);
      setIconState(send.icon, { send: model.sendState });
      sendBadge.hidden = annotationCount === 0 || model.sendState !== "idle";
      sendBadgeText.nodeValue = String(annotationCount);
      clear.button.disabled = clearDisabled;
      settings.button.setAttribute("aria-expanded", String(model.settingsOpen));
      const indicatorVisible = model.hasEndpoint && model.connection !== "disconnected" && !model.settingsOpen;
      indicator.classList.toggle("is-visible", indicatorVisible);
      indicator.classList.toggle(
        "is-connected",
        model.connection === "connected"
      );
      indicator.classList.toggle(
        "is-connecting",
        model.connection === "connecting"
      );
      indicator.title = model.connection === "connected" ? "MCP Connected" : "MCP Connecting...";
      liveStatusText.nodeValue = statusText(model);
    },
    destroy() {
      clearTooltipTimer();
      listeners.abort();
    }
  };
}
function statusText(model) {
  if (model.toast) return model.toast;
  if (model.copied) return "Copied";
  if (model.sendState === "sending") return "Sending";
  if (model.sendState === "sent") return "Sent";
  if (model.sendState === "failed") return "Failed";
  return "";
}

// src/browser/view.ts
function createNativeAgentationView(environment, host, dispatch) {
  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const stylesheet = environment.createElement("style");
  stylesheet.textContent = styles_shadow_default;
  shadowRoot.append(stylesheet);
  const toolbar = createToolbarRegion(environment, dispatch);
  const settings = createSettingsRegion(environment, dispatch);
  const popup = createPopupRegion(environment, dispatch);
  const markers = createMarkerRegion(environment, dispatch);
  const overlay = createOverlayRegion(environment, dispatch);
  const layout = createLayoutRegion(environment, dispatch);
  const regions = [overlay, markers, layout, popup, settings, toolbar];
  for (const region of regions) shadowRoot.append(region.root);
  let destroyed = false;
  let lastModel;
  let lastConfig;
  return {
    update(model, config) {
      if (destroyed) return;
      lastModel = model;
      lastConfig = config;
      for (const region of regions) region.update(model, config);
    },
    focusEditor() {
      if (!destroyed) popup.focusEditor();
    },
    shakeEditor() {
      if (!destroyed) popup.shakeEditor();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const region of [...regions].reverse()) region.destroy();
      stylesheet.remove();
      lastModel = void 0;
      lastConfig = void 0;
    }
  };
}

// src/browser/runtime.ts
var TAG_NAME = "agentation-overlay";
var instances = /* @__PURE__ */ new WeakMap();
var DRAG_THRESHOLD = 8;
var TOOLBAR_DRAG_THRESHOLD = 10;
var TOOLBAR_VIEWPORT_PADDING = 20;
var INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [onclick]';
var TEXT_SELECTION_SELECTOR = "p, h1, h2, h3, h4, h5, h6, span, li, td, th, dt, dd, blockquote, figcaption, label, code, pre, em, strong, small, [contenteditable]";
var CLICK_SUPPRESSION_MS = 250;
var TOAST_MS = 2400;
var COPIED_MS = 2e3;
var SENT_MS = 2e3;
var MARKER_EXIT_MS = 250;
var RENUMBER_MS = 200;
var ENTRANCE_MS = 750;
var HIDE_MS = 300;
var ROUTE_POLL_MS = 400;
var SCROLL_IDLE_MS = 120;
var AREA_PROBE_MAX = 8;
var TOOLBAR_WIDTH = 337;
var TOOLBAR_HEIGHT = 44;
function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
function emptyRearrange(now) {
  return { sections: [], originalOrder: [], detectedAt: now };
}
var NativeAgentation = class {
  constructor(host, config) {
    this.config = {};
    this.destroyed = false;
    this.route = "";
    this.active = false;
    this.hiding = false;
    this.entrance = false;
    this.settingsOpen = false;
    this.settingsPage = "main";
    this.tooltipsHidden = false;
    this.tooltipSession = false;
    // --- Data -----------------------------------------------------------------
    this.annotations = [];
    this.exitingAnnotationIds = /* @__PURE__ */ new Set();
    this.animatedAnnotationIds = /* @__PURE__ */ new Set();
    this.renumberFrom = null;
    // --- Editing --------------------------------------------------------------
    this.editor = null;
    this.pendingTarget = null;
    // --- Interaction ----------------------------------------------------------
    this.markersVisible = true;
    this.markersExiting = false;
    this.hover = null;
    this.hoveredAnnotationId = null;
    this.outlines = [];
    this.dragOrigin = null;
    this.dragSelection = null;
    this.dragHighlights = [];
    this.dragElements = [];
    this.scrolling = false;
    this.suppressClickUntil = 0;
    this.toolbarDrag = null;
    /** Targets accumulated by modifier-clicking, committed when a modifier lifts. */
    this.multiSelect = [];
    // --- Layout mode ----------------------------------------------------------
    this.layoutActive = false;
    this.layoutExiting = false;
    this.wireframe = false;
    this.wireframeReady = false;
    this.wireframeOpacity = 1;
    this.wireframePurpose = "";
    this.activeComponent = null;
    this.placements = [];
    this.layoutInteracting = false;
    this.rearrangedElements = /* @__PURE__ */ new Map();
    // --- Connectivity ---------------------------------------------------------
    this.connection = "disconnected";
    this.sendState = "idle";
    this.copied = false;
    this.toast = null;
    this.markerExitTimers = /* @__PURE__ */ new Map();
    this.host = host;
    this.environment = createRuntimeEnvironment(host.ownerDocument);
    this.abort = new this.environment.AbortController();
    this.storage = createRuntimeStorage(
      this.environment,
      (failure) => this.onStorageFailure(failure)
    );
    this.freeze = createAnimationFreezeController(this.environment.document);
    this.view = createNativeAgentationView(
      this.environment,
      host,
      (intent) => this.dispatch(intent)
    );
    this.settings = this.storage.loadSettings();
    this.theme = this.storage.loadTheme();
    this.toolbarPosition = this.storage.loadToolbarPosition();
    this.hidden = this.storage.loadToolbarHidden();
    this.rearrange = emptyRearrange(this.environment.now());
    this.sync = createRuntimeSync({
      environment: this.environment,
      scheduler: this.freeze.scheduler,
      storage: this.storage,
      localAnnotations: () => this.annotations,
      onRemoteAnnotations: (records) => this.mergeRemote(records),
      onRemoteRemoved: (id) => this.removeRemote(id),
      onConnectionChange: (status) => {
        this.connection = status;
        this.render();
      },
      onSessionCreated: (sessionId) => {
        this.emit({ type: "session-created", sessionId });
        this.config.onSessionCreated?.(sessionId);
      },
      onError: (message, cause) => this.emitError("sync", message, true, cause)
    });
    this.route = this.currentRoute();
    this.loadRouteState();
    this.applyAccent();
    this.installListeners();
    this.configure(config);
    this.entrance = true;
    this.entranceTimer = this.freeze.scheduler.setTimeout(() => {
      this.entrance = false;
      this.render();
    }, ENTRANCE_MS);
    this.render();
  }
  // ===========================================================================
  // Public surface
  // ===========================================================================
  configure(config) {
    if (this.destroyed) throw new Error("Agentation controller has been destroyed");
    if (config.endpoint && !validHttpUrl(config.endpoint)) {
      throw new TypeError("Agentation endpoint must be an http(s) URL");
    }
    if (config.webhookUrl && !validHttpUrl(config.webhookUrl)) {
      throw new TypeError("Agentation webhookUrl must be an http(s) URL");
    }
    const previousClassName = this.config.className;
    this.config = config;
    if (previousClassName !== config.className) {
      if (previousClassName) this.host.classList.remove(...previousClassName.split(/\s+/));
      if (config.className) this.host.classList.add(...config.className.split(/\s+/));
    }
    void this.sync.configure(config, this.route, this.annotations);
    if (config.enableDemoMode) this.scheduleDemo();
    this.render();
  }
  getAnnotations() {
    return this.annotations.map((annotation) => ({ ...annotation }));
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    this.sync.destroy();
    this.restoreRearrangedElements();
    for (const handle of this.markerExitTimers.values()) {
      this.freeze.scheduler.clearTimeout(handle);
    }
    this.markerExitTimers.clear();
    for (const handle of [
      this.toastTimer,
      this.copiedTimer,
      this.sendTimer,
      this.entranceTimer,
      this.hideTimer,
      this.renumberTimer,
      this.scrollTimer,
      this.routeTimer,
      this.layoutExitTimer,
      this.markerHideTimer
    ]) {
      this.freeze.scheduler.clearTimeout(handle);
    }
    this.freeze.unfreeze();
    this.freeze.destroy();
    this.view.destroy();
    instances.delete(this.environment.document);
  }
  // ===========================================================================
  // Route
  // ===========================================================================
  currentRoute() {
    const { location } = this.environment.window;
    return `${location.pathname}${location.search}${location.hash}`;
  }
  checkRoute() {
    const next = this.currentRoute();
    if (next === this.route) return;
    this.restoreRearrangedElements();
    this.route = next;
    this.loadRouteState();
    void this.sync.configure(this.config, this.route, this.annotations);
    this.render();
  }
  loadRouteState() {
    this.annotations = this.storage.loadAnnotations(this.route);
    this.placements = this.storage.loadPlacements(this.route);
    this.rearrange = this.storage.loadRearrange(this.route) ?? emptyRearrange(this.environment.now());
    this.wireframePurpose = this.storage.loadWireframe(this.route)?.purpose ?? "";
    this.animatedAnnotationIds.clear();
    for (const annotation of this.annotations) this.animatedAnnotationIds.add(annotation.id);
    this.emitAnnotations("load", this.annotations);
  }
  saveRouteState() {
    this.storage.saveAnnotations(this.route, this.annotations, this.sync.sessionId ?? void 0);
    if (this.wireframe) {
      this.storage.saveWireframe(this.route, {
        rearrange: this.rearrange,
        placements: this.placements,
        purpose: this.wireframePurpose
      });
    } else {
      this.storage.savePlacements(this.route, this.placements);
      this.storage.saveRearrange(this.route, this.rearrange);
    }
  }
  // ===========================================================================
  // Listeners
  // ===========================================================================
  installListeners() {
    const { signal } = this.abort;
    const document = this.environment.document;
    const view = this.environment.window;
    document.addEventListener("mousemove", (event) => this.onPointerMove(event), { signal });
    document.addEventListener("mousedown", (event) => this.onPointerDown(event), { signal });
    document.addEventListener("mouseup", (event) => this.onPointerUp(event), { signal });
    document.addEventListener("click", (event) => this.onClick(event), {
      signal,
      capture: true
    });
    document.addEventListener("keydown", (event) => this.onKeyDown(event), { signal });
    document.addEventListener("keyup", (event) => this.onKeyUp(event), { signal });
    view.addEventListener("blur", () => this.cancelMultiSelect(), { signal });
    view.addEventListener("scroll", () => this.onScroll(), { signal, passive: true });
    view.addEventListener("resize", () => this.render(), { signal, passive: true });
    const poll = () => {
      if (this.destroyed) return;
      this.checkRoute();
      this.routeTimer = this.freeze.scheduler.setTimeout(poll, ROUTE_POLL_MS);
    };
    this.routeTimer = this.freeze.scheduler.setTimeout(poll, ROUTE_POLL_MS);
  }
  /** True when the event originated inside Agentation's own UI. */
  ownsEvent(event) {
    return event.composedPath().includes(this.host);
  }
  get targetContext() {
    return {
      environment: this.environment,
      host: this.host,
      adapters: this.config.metadata ?? [],
      metadataEnabled: this.settings.metadataEnabled,
      outputDetail: this.settings.outputDetail,
      onMetadataError: (adapterId, cause) => this.emitError("metadata", `Metadata adapter "${adapterId}" failed`, true, cause)
    };
  }
  onScroll() {
    this.scrolling = true;
    this.freeze.scheduler.clearTimeout(this.scrollTimer);
    this.scrollTimer = this.freeze.scheduler.setTimeout(() => {
      this.scrolling = false;
      this.render();
    }, SCROLL_IDLE_MS);
    this.render();
  }
  onPointerMove(event) {
    if (this.toolbarDrag) return;
    if (this.dragOrigin) {
      this.updateDragSelection(event);
      return;
    }
    if (!this.active || this.editor || this.layoutActive || this.ownsEvent(event)) {
      if (this.hover) {
        this.hover = null;
        this.render();
      }
      return;
    }
    const element = deepElementFromPoint(event.clientX, event.clientY, this.targetContext);
    if (!element) {
      if (this.hover) {
        this.hover = null;
        this.render();
      }
      return;
    }
    const target = collectTarget(element, event.clientX, event.clientY, this.targetContext);
    this.hover = {
      label: target.element,
      elementName: target.element,
      componentPath: target.framework?.componentPath?.join(" "),
      rect: this.viewportBox(element.getBoundingClientRect()),
      pointer: { x: event.clientX, y: event.clientY }
    };
    this.render();
  }
  updateDragSelection(event) {
    const origin = this.dragOrigin;
    if (!origin) return;
    const width = Math.abs(event.clientX - origin.x);
    const height = Math.abs(event.clientY - origin.y);
    if (width <= DRAG_THRESHOLD && height <= DRAG_THRESHOLD) return;
    this.dragSelection = {
      x: Math.min(origin.x, event.clientX),
      y: Math.min(origin.y, event.clientY),
      width,
      height
    };
    this.dragElements = this.elementsInRect(this.dragSelection);
    this.dragHighlights = this.dragElements.map(
      (element) => this.viewportBox(element.getBoundingClientRect())
    );
    this.hover = null;
    this.render();
  }
  onPointerDown(event) {
    if (!this.active || this.editor || this.layoutActive) return;
    if (event.button !== 0 || this.ownsEvent(event)) return;
    const element = deepElementFromPoint(event.clientX, event.clientY, this.targetContext);
    if (element && closestCrossingShadow(element, TEXT_SELECTION_SELECTOR)) return;
    this.dragOrigin = { x: event.clientX, y: event.clientY };
  }
  onPointerUp(event) {
    const origin = this.dragOrigin;
    const selection = this.dragSelection;
    this.dragOrigin = null;
    if (!origin || !selection) return;
    this.suppressClickUntil = this.environment.monotonic() + CLICK_SUPPRESSION_MS;
    const elements = this.dragElements;
    this.dragSelection = null;
    this.dragHighlights = [];
    this.dragElements = [];
    const target = elements.length > 0 ? collectGroup(elements, this.targetContext) : collectArea(
      new this.environment.DOMRect(
        selection.x,
        selection.y,
        selection.width,
        selection.height
      ),
      this.targetContext
    );
    if (!target) {
      this.render();
      return;
    }
    this.openEditor(target);
  }
  onClick(event) {
    if (!this.active || this.layoutActive || this.editor) return;
    if (this.ownsEvent(event)) return;
    if (this.environment.monotonic() < this.suppressClickUntil) return;
    const element = deepElementFromPoint(event.clientX, event.clientY, this.targetContext);
    if (!element) return;
    const primary = this.environment.isApplePlatform ? event.metaKey : event.ctrlKey;
    if (primary && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      this.toggleMultiSelect(element);
      this.render();
      return;
    }
    if (closestCrossingShadow(element, INTERACTIVE_SELECTOR)) {
      if (!this.settings.blockInteractions) return;
      event.preventDefault();
      event.stopPropagation();
    }
    const target = collectTarget(element, event.clientX, event.clientY, this.targetContext);
    this.openEditor(target);
  }
  // ===========================================================================
  // Modifier selection
  // ===========================================================================
  toggleMultiSelect(element) {
    const index = this.multiSelect.indexOf(element);
    if (index === -1) this.multiSelect.push(element);
    else this.multiSelect.splice(index, 1);
    this.outlines = this.multiSelect.map((selected) => ({
      kind: "multi",
      rect: this.viewportBox(selected.getBoundingClientRect())
    }));
  }
  cancelMultiSelect() {
    if (this.multiSelect.length === 0) return;
    this.multiSelect = [];
    this.outlines = [];
    this.render();
  }
  /**
   * Releasing either modifier ends the gesture: one target becomes an ordinary
   * annotation, several become a single grouped one.
   */
  commitMultiSelect() {
    const elements = this.multiSelect;
    this.multiSelect = [];
    if (elements.length === 0) return;
    if (elements.length === 1) {
      const rect = elements[0].getBoundingClientRect();
      this.openEditor(
        collectTarget(
          elements[0],
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          this.targetContext
        )
      );
      return;
    }
    this.openEditor(collectGroup(elements, this.targetContext));
  }
  onKeyUp(event) {
    if (this.multiSelect.length === 0) return;
    const primary = this.environment.isApplePlatform ? event.metaKey : event.ctrlKey;
    if (primary && event.shiftKey) return;
    this.commitMultiSelect();
    this.render();
  }
  onKeyDown(event) {
    const target = event.target;
    const typing = target instanceof this.environment.HTMLInputElement || target instanceof this.environment.HTMLTextAreaElement || target instanceof this.environment.HTMLSelectElement || target instanceof this.environment.HTMLElement && target.isContentEditable;
    const modifier = this.environment.isApplePlatform ? event.metaKey : event.ctrlKey;
    if (modifier && event.shiftKey && (event.key === "f" || event.key === "F")) {
      event.preventDefault();
      if (this.active) this.deactivate();
      else this.activate();
      this.render();
      return;
    }
    if (event.key === "Escape") {
      if (typing && this.ownsEvent(event)) return;
      if (this.layoutActive && this.activeComponent) this.activeComponent = null;
      else if (this.layoutActive) this.leaveLayout();
      else if (this.multiSelect.length > 0) this.cancelMultiSelect();
      else if (this.editor) this.closeEditor();
      else if (this.settingsOpen) this.settingsOpen = false;
      else if (this.active) this.deactivate();
      else return;
      this.render();
      return;
    }
    if (!this.active) return;
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    switch (event.key) {
      case "p":
      case "P":
        this.toggleFreeze();
        break;
      case "l":
      case "L":
        this.toggleLayout();
        break;
      case "h":
      case "H":
        if (this.annotations.length === 0) return;
        this.toggleMarkers();
        break;
      case "c":
      case "C":
        void this.copyOutput(false);
        break;
      case "s":
      case "S":
        void this.copyOutput(true);
        break;
      case "x":
      case "X":
        void this.clearAll();
        break;
      default:
        return;
    }
    event.preventDefault();
    this.tooltipsHidden = true;
    this.render();
  }
  // ===========================================================================
  // Geometry
  // ===========================================================================
  viewportBox(rect) {
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }
  /**
   * Elements meaningfully inside a drag rectangle. The original probed a grid of
   * hit-test points rather than walking the DOM, which naturally respects
   * stacking and overflow clipping; the same probe density is kept here.
   */
  elementsInRect(rect) {
    const columns = Math.max(2, Math.min(AREA_PROBE_MAX, Math.ceil(rect.width / 80)));
    const rows = Math.max(2, Math.min(AREA_PROBE_MAX, Math.ceil(rect.height / 60)));
    const found = [];
    const seen = /* @__PURE__ */ new Set();
    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const x = rect.x + rect.width * column / columns;
        const y = rect.y + rect.height * row / rows;
        const element = deepElementFromPoint(x, y, this.targetContext);
        if (!element || seen.has(element)) continue;
        seen.add(element);
        const box2 = element.getBoundingClientRect();
        if (box2.width < 4 || box2.height < 4) continue;
        if (found.some((existing) => existing.contains(element))) continue;
        for (let index = found.length - 1; index >= 0; index -= 1) {
          if (element.contains(found[index])) found.splice(index, 1);
        }
        found.push(element);
      }
    }
    return found;
  }
  // ===========================================================================
  // Intents
  // ===========================================================================
  dispatch(intent) {
    if (this.destroyed) return;
    switch (intent.type) {
      case "activate":
        this.activate();
        break;
      case "deactivate":
        this.deactivate();
        break;
      case "toggle-freeze":
        this.toggleFreeze();
        break;
      case "toggle-markers":
        this.toggleMarkers();
        break;
      case "toggle-layout":
        this.toggleLayout();
        break;
      case "toggle-settings":
        this.settingsOpen = !this.settingsOpen;
        if (!this.settingsOpen) this.settingsPage = "main";
        break;
      case "settings-page":
        this.settingsPage = intent.page;
        break;
      case "toggle-theme":
        this.theme = this.theme === "dark" ? "light" : "dark";
        this.storage.saveTheme(this.theme);
        this.applyAccent();
        break;
      case "hide-until-restart":
        this.hideUntilRestart();
        break;
      case "copy":
        void this.copyOutput(false);
        break;
      case "submit":
        void this.copyOutput(true);
        break;
      case "clear":
        void this.clearAll();
        break;
      case "tooltips-hidden":
        this.tooltipsHidden = intent.hidden;
        break;
      case "tooltip-session":
        this.tooltipSession = intent.active;
        break;
      case "drag-start":
        this.toolbarDrag = {
          pointerX: intent.pointerX,
          pointerY: intent.pointerY,
          moved: false
        };
        break;
      case "drag-move":
        this.moveToolbar(intent.pointerX, intent.pointerY);
        break;
      case "drag-end":
        if (this.toolbarDrag?.moved && this.toolbarPosition) {
          this.storage.saveToolbarPosition(this.toolbarPosition);
          this.suppressClickUntil = this.environment.monotonic() + CLICK_SUPPRESSION_MS;
        }
        this.toolbarDrag = null;
        break;
      case "settings-change":
        this.applySettings(intent.patch);
        break;
      case "editor-input":
        if (this.editor) this.editor = { ...this.editor, draft: intent.draft };
        break;
      case "editor-submit":
        void this.commitEditor(intent.draft);
        break;
      case "editor-cancel":
        this.closeEditor();
        break;
      case "editor-delete": {
        const id = this.editor?.annotationId;
        this.closeEditor();
        if (id) void this.deleteAnnotation(id);
        break;
      }
      case "marker-click":
        this.onMarkerClick(intent.id);
        break;
      case "marker-context":
        void this.deleteAnnotation(intent.id);
        break;
      case "marker-hover":
        this.onMarkerHover(intent.id);
        break;
      case "layout-select-component":
        this.activeComponent = intent.component;
        break;
      case "layout-drop-component":
        this.addPlacement(intent.component, intent.clientX, intent.clientY);
        break;
      case "layout-wireframe":
        this.setWireframe(intent.enabled);
        break;
      case "layout-wireframe-purpose":
        this.wireframePurpose = intent.purpose;
        this.saveRouteState();
        break;
      case "layout-wireframe-opacity":
        this.wireframeOpacity = intent.opacity;
        break;
      case "layout-clear":
        this.clearLayout();
        break;
      case "layout-start-over":
        this.clearLayout();
        this.setWireframe(false);
        break;
      case "layout-interacting":
        this.layoutInteracting = intent.interacting;
        break;
      case "placements-change":
        this.placements = [...intent.placements];
        this.saveRouteState();
        break;
      case "placement-sync":
        void this.sync.add(this.placementAnnotation(intent.placement));
        break;
      case "placement-delete":
        this.placements = this.placements.filter((placement) => placement.id !== intent.id);
        this.saveRouteState();
        void this.sync.delete(intent.id);
        break;
      case "rearrange-change":
        this.rearrange = intent.state;
        this.applyRearrangedElements();
        this.saveRouteState();
        break;
      case "rearrange-sync":
        void this.sync.add(this.rearrangeAnnotation(intent.section));
        break;
      case "rearrange-delete":
        this.deleteRearrangeSection(intent.id);
        break;
    }
    this.render();
  }
  // ===========================================================================
  // Shell
  // ===========================================================================
  activate() {
    this.active = true;
    this.hidden = false;
    this.applyAccent();
  }
  deactivate() {
    this.active = false;
    this.closeEditor();
    this.settingsOpen = false;
    this.hover = null;
    this.dragOrigin = null;
    this.dragSelection = null;
    this.dragHighlights = [];
    this.dragElements = [];
    this.leaveLayout();
    if (this.freeze.frozen) this.freeze.unfreeze();
  }
  applySettings(patch) {
    this.settings = { ...this.settings, ...patch };
    this.storage.saveSettings(this.settings);
    if (patch.annotationColorId !== void 0) this.applyAccent();
  }
  hideUntilRestart() {
    this.storage.saveToolbarHidden(true);
    this.hiding = true;
    this.settingsOpen = false;
    this.render();
    this.hideTimer = this.freeze.scheduler.setTimeout(() => {
      this.hiding = false;
      this.hidden = true;
      this.deactivate();
      this.render();
    }, HIDE_MS);
  }
  toggleFreeze() {
    if (this.freeze.frozen) this.freeze.unfreeze();
    else this.freeze.freeze();
  }
  toggleMarkers() {
    if (!this.markersVisible) {
      this.markersVisible = true;
      return;
    }
    this.markersExiting = true;
    this.freeze.scheduler.clearTimeout(this.markerHideTimer);
    this.markerHideTimer = this.freeze.scheduler.setTimeout(() => {
      this.markersExiting = false;
      this.markersVisible = false;
      this.render();
    }, MARKER_EXIT_MS);
  }
  /** Accent and theme ride on host attributes so `_tokens.scss` owns the values. */
  applyAccent() {
    const accent = ACCENT_OPTIONS.find((option) => option.id === this.settings.annotationColorId) ?? ACCENT_OPTIONS[1];
    this.host.setAttribute("data-agentation-accent", accent.id);
    this.host.setAttribute("data-agentation-theme", this.theme);
  }
  moveToolbar(pointerX, pointerY) {
    const drag = this.toolbarDrag;
    if (!drag) return;
    const dx = pointerX - drag.pointerX;
    const dy = pointerY - drag.pointerY;
    if (!drag.moved && Math.abs(dx) < TOOLBAR_DRAG_THRESHOLD && Math.abs(dy) < TOOLBAR_DRAG_THRESHOLD) {
      return;
    }
    drag.moved = true;
    const base = this.toolbarPosition ?? {
      x: this.environment.innerWidth - TOOLBAR_WIDTH - TOOLBAR_VIEWPORT_PADDING,
      y: this.environment.innerHeight - TOOLBAR_HEIGHT - TOOLBAR_VIEWPORT_PADDING
    };
    const maxX = this.environment.innerWidth - TOOLBAR_WIDTH - TOOLBAR_VIEWPORT_PADDING;
    const maxY = this.environment.innerHeight - TOOLBAR_HEIGHT - TOOLBAR_VIEWPORT_PADDING;
    this.toolbarPosition = {
      x: Math.max(TOOLBAR_VIEWPORT_PADDING, Math.min(maxX, base.x + dx)),
      y: Math.max(TOOLBAR_VIEWPORT_PADDING, Math.min(maxY, base.y + dy))
    };
    drag.pointerX = pointerX;
    drag.pointerY = pointerY;
  }
  // ===========================================================================
  // Editor
  // ===========================================================================
  openEditor(target) {
    this.pendingTarget = target;
    this.editor = {
      mode: "add",
      x: target.x,
      y: target.y,
      isFixed: target.isFixed ?? false,
      element: target.element,
      selectedText: target.selectedText,
      draft: "",
      isMultiSelect: target.isMultiSelect ?? false,
      computedStyles: target.computedStylesObject,
      exiting: false
    };
    this.hover = null;
    this.outlines = this.outlinesFor(target.boundingBox, target.isMultiSelect ?? false);
    this.render();
    this.view.focusEditor();
  }
  closeEditor() {
    this.editor = null;
    this.pendingTarget = null;
    this.outlines = [];
  }
  outlinesFor(box2, multi) {
    return box2 ? [{ kind: multi ? "multi" : "single", rect: box2 }] : [];
  }
  onMarkerClick(id) {
    if (this.settings.markerClickBehavior === "delete") {
      void this.deleteAnnotation(id);
      return;
    }
    const annotation = this.annotations.find((item) => item.id === id);
    if (!annotation) return;
    this.pendingTarget = null;
    this.editor = {
      mode: "edit",
      x: annotation.x,
      y: annotation.y,
      isFixed: annotation.isFixed ?? false,
      element: annotation.element,
      selectedText: annotation.selectedText,
      draft: annotation.comment,
      isMultiSelect: annotation.isMultiSelect ?? false,
      annotationId: annotation.id,
      exiting: false
    };
    this.outlines = this.outlinesFor(annotation.boundingBox, annotation.isMultiSelect ?? false);
    this.render();
    this.view.focusEditor();
  }
  onMarkerHover(id) {
    this.hoveredAnnotationId = id;
    if (!id) {
      if (!this.editor) this.outlines = [];
      return;
    }
    const annotation = this.annotations.find((item) => item.id === id);
    if (!annotation) return;
    const kind = annotation.isMultiSelect ? "multi" : "single";
    const boxes = annotation.elementBoundingBoxes ?? [];
    this.outlines = boxes.length > 0 ? boxes.map((rect) => ({ kind, rect })) : this.outlinesFor(annotation.boundingBox, annotation.isMultiSelect ?? false);
  }
  async commitEditor(draft) {
    const editor = this.editor;
    const comment = draft.trim();
    if (!editor || !comment) {
      this.view.shakeEditor();
      return;
    }
    if (editor.mode === "edit" && editor.annotationId) {
      const id = editor.annotationId;
      let updated;
      this.annotations = this.annotations.map((annotation2) => {
        if (annotation2.id !== id) return annotation2;
        updated = { ...annotation2, comment };
        return updated;
      });
      this.closeEditor();
      this.saveRouteState();
      this.render();
      if (!updated) return;
      this.emitAnnotations("update", [updated]);
      this.config.onAnnotationUpdate?.({ ...updated });
      void this.sync.update(updated);
      void this.fireWebhook("annotation.update", { annotation: updated });
      return;
    }
    const target = this.pendingTarget;
    if (!target) return;
    const annotation = {
      ...target,
      id: this.environment.randomId("ann"),
      comment,
      timestamp: this.environment.now(),
      kind: "feedback"
    };
    this.annotations = [...this.annotations, annotation];
    this.closeEditor();
    this.saveRouteState();
    this.render();
    this.emitAnnotations("add", [annotation]);
    this.config.onAnnotationAdd?.({ ...annotation });
    void this.sync.add(annotation);
    void this.fireWebhook("annotation.add", { annotation });
  }
  async deleteAnnotation(id) {
    const annotation = this.annotations.find((item) => item.id === id);
    if (!annotation) return;
    const index = this.annotations.indexOf(annotation);
    this.exitingAnnotationIds.add(id);
    if (this.editor?.annotationId === id) this.closeEditor();
    this.render();
    const handle = this.freeze.scheduler.setTimeout(() => {
      this.markerExitTimers.delete(id);
      this.exitingAnnotationIds.delete(id);
      this.annotations = this.annotations.filter((item) => item.id !== id);
      this.animatedAnnotationIds.delete(id);
      this.saveRouteState();
      this.startRenumber(index);
      this.render();
    }, MARKER_EXIT_MS);
    this.markerExitTimers.set(id, handle);
    this.emitAnnotations("delete", [annotation]);
    this.config.onAnnotationDelete?.({ ...annotation });
    void this.sync.delete(id);
    void this.fireWebhook("annotation.delete", { annotation });
  }
  startRenumber(from) {
    this.renumberFrom = from;
    this.freeze.scheduler.clearTimeout(this.renumberTimer);
    this.renumberTimer = this.freeze.scheduler.setTimeout(() => {
      this.renumberFrom = null;
      this.render();
    }, RENUMBER_MS);
  }
  async clearAll() {
    const hadLayout = this.placements.length > 0 || this.rearrange.sections.length > 0;
    if (this.annotations.length === 0 && !hadLayout) return;
    const removed = [...this.annotations];
    const ids = removed.map((annotation) => annotation.id);
    this.annotations = [];
    this.exitingAnnotationIds.clear();
    this.animatedAnnotationIds.clear();
    this.closeEditor();
    this.clearLayout();
    this.storage.clearAnnotations(this.route);
    this.render();
    if (removed.length === 0) return;
    this.emitAnnotations("clear", removed);
    this.config.onAnnotationsClear?.(removed.map((annotation) => ({ ...annotation })));
    void this.sync.clear(ids);
    void this.fireWebhook("annotations.clear", { annotations: removed });
  }
  // ===========================================================================
  // Remote state
  // ===========================================================================
  mergeRemote(records) {
    if (records.length === 0) return;
    const byId = new Map(this.annotations.map((annotation) => [annotation.id, annotation]));
    for (const record of records) {
      this.animatedAnnotationIds.add(record.id);
      byId.set(record.id, record);
    }
    this.annotations = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
    this.emitAnnotations("remote", records);
    this.render();
  }
  removeRemote(id) {
    if (!this.annotations.some((annotation) => annotation.id === id)) return;
    this.annotations = this.annotations.filter((annotation) => annotation.id !== id);
    this.animatedAnnotationIds.delete(id);
    this.saveRouteState();
    this.render();
  }
  // ===========================================================================
  // Layout mode
  // ===========================================================================
  toggleLayout() {
    if (this.layoutActive) {
      this.leaveLayout();
      return;
    }
    this.layoutActive = true;
    this.layoutExiting = false;
    this.settingsOpen = false;
    this.closeEditor();
    this.hover = null;
    this.wireframeReady = true;
    this.applyRearrangedElements();
  }
  leaveLayout() {
    if (!this.layoutActive) return;
    this.layoutActive = false;
    this.layoutExiting = true;
    this.activeComponent = null;
    this.layoutInteracting = false;
    this.restoreRearrangedElements();
    this.freeze.scheduler.clearTimeout(this.layoutExitTimer);
    this.layoutExitTimer = this.freeze.scheduler.setTimeout(() => {
      this.layoutExiting = false;
      this.render();
    }, MARKER_EXIT_MS);
  }
  setWireframe(enabled) {
    if (this.wireframe === enabled) return;
    this.wireframe = enabled;
    this.wireframeReady = false;
    if (enabled) {
      this.storage.savePlacements(this.route, this.placements);
      this.storage.saveRearrange(this.route, this.rearrange);
      const stash = this.storage.loadWireframe(this.route);
      this.placements = stash?.placements ?? [];
      this.rearrange = stash?.rearrange ?? emptyRearrange(this.environment.now());
      this.wireframePurpose = stash?.purpose ?? "";
      this.restoreRearrangedElements();
    } else {
      this.storage.saveWireframe(this.route, {
        rearrange: this.rearrange,
        placements: this.placements,
        purpose: this.wireframePurpose
      });
      this.placements = this.storage.loadPlacements(this.route);
      this.rearrange = this.storage.loadRearrange(this.route) ?? emptyRearrange(this.environment.now());
      this.applyRearrangedElements();
    }
    this.wireframeReady = true;
  }
  clearLayout() {
    this.restoreRearrangedElements();
    this.placements = [];
    this.rearrange = emptyRearrange(this.environment.now());
    this.wireframePurpose = "";
    this.activeComponent = null;
    this.storage.clearPlacements(this.route);
    this.storage.clearRearrange(this.route);
    this.storage.clearWireframe(this.route);
  }
  addPlacement(type, clientX, clientY) {
    const size = DEFAULT_SIZES[type];
    const placement = {
      id: this.environment.randomId("placement"),
      type,
      x: clientX,
      y: clientY + this.environment.scrollY,
      width: size.width,
      height: size.height,
      scrollY: this.environment.scrollY,
      timestamp: this.environment.now()
    };
    this.placements = [...this.placements, placement];
    this.activeComponent = null;
    this.saveRouteState();
    void this.sync.add(this.placementAnnotation(placement));
  }
  placementAnnotation(placement) {
    return {
      id: placement.id,
      x: placement.x / this.environment.innerWidth * 100,
      y: placement.y,
      comment: `Place a ${placement.type}`,
      element: placement.type,
      elementPath: `layout > ${placement.type}`,
      timestamp: placement.timestamp,
      kind: "placement",
      placement: {
        componentType: placement.type,
        width: placement.width,
        height: placement.height,
        scrollY: placement.scrollY,
        text: placement.text
      }
    };
  }
  rearrangeAnnotation(section) {
    return {
      id: section.id,
      x: section.currentRect.x / this.environment.innerWidth * 100,
      y: section.currentRect.y,
      comment: section.note ?? `Move ${section.label}`,
      element: section.label,
      elementPath: section.selector,
      timestamp: this.environment.now(),
      kind: "rearrange",
      rearrange: {
        selector: section.selector,
        label: section.label,
        tagName: section.tagName,
        originalRect: section.originalRect,
        currentRect: section.currentRect
      }
    };
  }
  deleteRearrangeSection(id) {
    const backup = this.rearrangedElements.get(id);
    if (backup) this.restoreElement(backup);
    this.rearrangedElements.delete(id);
    this.rearrange = {
      ...this.rearrange,
      sections: this.rearrange.sections.filter((section) => section.id !== id)
    };
    this.saveRouteState();
    void this.sync.delete(id);
  }
  /**
   * Layout mode moves real page elements. Their original inline styles are
   * captured on first move and restored verbatim on exit, so a page that styled
   * `transform` itself is handed back unchanged.
   */
  applyRearrangedElements() {
    for (const section of this.rearrange.sections) {
      let backup = this.rearrangedElements.get(section.id);
      if (!backup) {
        const element = this.environment.document.querySelector(section.selector);
        if (!element) continue;
        backup = {
          element,
          transform: element.style.transform,
          transformOrigin: element.style.transformOrigin,
          transition: element.style.transition,
          position: element.style.position,
          zIndex: element.style.zIndex
        };
        this.rearrangedElements.set(section.id, backup);
      }
      const dx = section.currentRect.x - section.originalRect.x;
      const dy = section.currentRect.y - section.originalRect.y;
      const sx = section.originalRect.width ? section.currentRect.width / section.originalRect.width : 1;
      const sy = section.originalRect.height ? section.currentRect.height / section.originalRect.height : 1;
      const style = backup.element.style;
      style.transformOrigin = "top left";
      style.transition = "none";
      if (style.position === "") style.position = "relative";
      style.zIndex = "9999";
      style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    }
  }
  restoreElement(backup) {
    const style = backup.element.style;
    style.transform = backup.transform;
    style.transformOrigin = backup.transformOrigin;
    style.transition = backup.transition;
    style.position = backup.position;
    style.zIndex = backup.zIndex;
  }
  restoreRearrangedElements() {
    for (const backup of this.rearrangedElements.values()) this.restoreElement(backup);
    this.rearrangedElements.clear();
  }
  // ===========================================================================
  // Output
  // ===========================================================================
  output() {
    const detail = this.settings.outputDetail;
    const viewport = {
      width: this.environment.innerWidth,
      height: this.environment.innerHeight
    };
    const chunks = [];
    if (!this.wireframe) {
      const feedback = generateOutput(
        this.annotations.filter((annotation) => (annotation.kind ?? "feedback") === "feedback"),
        this.route,
        detail
      );
      if (feedback) chunks.push(feedback);
    }
    if (this.placements.length > 0) {
      const design = generateDesignOutput(
        this.environment,
        this.placements,
        viewport,
        { blankCanvas: this.wireframe, wireframePurpose: this.wireframePurpose },
        detail
      );
      if (design) chunks.push(design);
    }
    if (this.rearrange.sections.length > 0) {
      const moved = generateRearrangeOutput(this.environment, this.rearrange, detail, viewport);
      if (moved) chunks.push(moved);
    }
    return chunks.join("\n\n");
  }
  async copyOutput(submit) {
    const output = this.output();
    if (!output) {
      this.flash("Nothing to copy");
      return;
    }
    if (submit) {
      await this.submitOutput(output);
      return;
    }
    if (this.config.copyToClipboard !== false) {
      try {
        await this.environment.writeClipboardText(output);
      } catch (cause) {
        this.emitError("clipboard", "Could not write to the clipboard", true, cause);
        this.flash("Clipboard unavailable");
        return;
      }
    }
    this.copied = true;
    this.render();
    this.freeze.scheduler.clearTimeout(this.copiedTimer);
    this.copiedTimer = this.freeze.scheduler.setTimeout(() => {
      this.copied = false;
      this.render();
    }, COPIED_MS);
    this.emit({ type: "copy", output, annotations: this.annotations });
    this.config.onCopy?.(output);
    if (this.settings.autoClearAfterCopy) void this.clearAll();
  }
  async submitOutput(output) {
    this.sendState = "sending";
    this.render();
    const delivered = await this.deliver(output);
    if (this.destroyed) return;
    this.sendState = delivered ? "sent" : "failed";
    this.render();
    this.freeze.scheduler.clearTimeout(this.sendTimer);
    this.sendTimer = this.freeze.scheduler.setTimeout(() => {
      this.sendState = "idle";
      this.render();
    }, SENT_MS);
    if (delivered && this.settings.autoClearAfterCopy) void this.clearAll();
  }
  /** Submit reaches every configured destination; success means at least one. */
  async deliver(output) {
    const event = this.emit({ type: "submit", output, annotations: this.annotations }, true);
    if (event.defaultPrevented) return true;
    let delivered = false;
    if (this.config.onSubmit) {
      try {
        this.config.onSubmit(
          output,
          this.annotations.map((annotation) => ({ ...annotation }))
        );
        delivered = true;
      } catch (cause) {
        this.emitError("callback", "onSubmit threw", true, cause);
      }
    }
    if (await this.sync.action(output)) delivered = true;
    if (await this.fireWebhook("submit", { output }, true)) delivered = true;
    return delivered;
  }
  async fireWebhook(event, payload, force = false) {
    const target = this.settings.webhookUrl || this.config.webhookUrl;
    if (!target || !validHttpUrl(target)) return false;
    if (!this.settings.webhooksEnabled && !force) return false;
    try {
      const response = await this.environment.fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, url: this.environment.href, ...payload })
      });
      if (!response.ok) throw new Error(`Webhook responded ${response.status}`);
      return true;
    } catch (cause) {
      this.emitError("webhook", "Webhook delivery failed", true, cause);
      return false;
    }
  }
  // ===========================================================================
  // Demo mode
  // ===========================================================================
  scheduleDemo() {
    const demos = this.config.demoAnnotations;
    if (!demos || demos.length === 0 || this.annotations.length > 0) return;
    this.freeze.scheduler.setTimeout(() => {
      if (this.destroyed || this.annotations.length > 0) return;
      const added = [];
      for (const demo of demos) {
        const element = this.environment.document.querySelector(demo.selector);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        const target = collectTarget(
          element,
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          this.targetContext
        );
        added.push({
          ...target,
          id: this.environment.randomId("ann"),
          comment: demo.comment,
          selectedText: demo.selectedText,
          timestamp: this.environment.now(),
          kind: "feedback"
        });
      }
      if (added.length === 0) return;
      this.annotations = [...this.annotations, ...added];
      this.active = true;
      this.applyAccent();
      this.saveRouteState();
      this.emitAnnotations("load", added);
      this.render();
    }, this.config.demoDelay ?? 1e3);
  }
  // ===========================================================================
  // Events
  // ===========================================================================
  emit(detail, cancelable = false) {
    const event = new this.environment.CustomEvent("agentation", {
      detail,
      bubbles: true,
      composed: true,
      cancelable
    });
    this.host.dispatchEvent(event);
    try {
      this.config.onEvent?.(event);
    } catch (cause) {
      if (detail.type !== "error") {
        this.emitError("callback", "onEvent threw", true, cause);
      }
    }
    return event;
  }
  emitAnnotations(reason, affected) {
    this.emit({ type: "annotations", reason, current: this.annotations, affected });
  }
  emitError(operation, message, recoverable, cause) {
    this.emit({ type: "error", operation, message, recoverable, cause });
  }
  onStorageFailure(failure) {
    this.emitError(
      "storage",
      `Could not ${failure.operation} "${failure.key}"; continuing in memory`,
      true,
      failure.cause
    );
  }
  flash(message) {
    this.toast = message;
    this.render();
    this.freeze.scheduler.clearTimeout(this.toastTimer);
    this.toastTimer = this.freeze.scheduler.setTimeout(() => {
      this.toast = null;
      this.render();
    }, TOAST_MS);
  }
  // ===========================================================================
  // Render
  // ===========================================================================
  get layoutState() {
    return {
      active: this.layoutActive,
      exiting: this.layoutExiting,
      wireframe: this.wireframe,
      wireframeReady: this.wireframeReady,
      wireframeOpacity: this.wireframeOpacity,
      wireframePurpose: this.wireframePurpose,
      activeComponent: this.activeComponent,
      placements: this.placements,
      rearrange: this.rearrange,
      interacting: this.layoutInteracting
    };
  }
  render() {
    if (this.destroyed) return;
    this.host.hidden = this.hidden && !this.hiding;
    const model = {
      active: this.active,
      hidden: this.hidden,
      hiding: this.hiding,
      entrance: this.entrance,
      theme: this.theme,
      settings: this.settings,
      toolbarPosition: this.toolbarPosition,
      // `moved`, not merely "a pointer is down": the toolbar region reads this
      // on `pointerup` to decide whether to swallow the synthesized click, so a
      // stationary press on the collapsed circle must still activate.
      dragging: this.toolbarDrag?.moved === true,
      settingsOpen: this.settingsOpen,
      settingsPage: this.settingsPage,
      tooltipsHidden: this.tooltipsHidden,
      tooltipSession: this.tooltipSession,
      annotations: this.annotations,
      exitingAnnotationIds: this.exitingAnnotationIds,
      animatedAnnotationIds: this.animatedAnnotationIds,
      renumberFrom: this.renumberFrom,
      editor: this.editor,
      markersVisible: this.markersVisible,
      markersExiting: this.markersExiting,
      hover: this.hover,
      hoveredAnnotationId: this.hoveredAnnotationId,
      outlines: this.outlines,
      dragSelection: this.dragSelection,
      dragHighlights: this.dragHighlights,
      scrolling: this.scrolling,
      frozen: this.freeze.frozen,
      layout: this.layoutState,
      hasEndpoint: Boolean(this.config.endpoint),
      connection: this.connection,
      sendState: this.sendState,
      copied: this.copied,
      metadataAdapterIds: (this.config.metadata ?? []).map((adapter) => adapter.id),
      toast: this.toast
    };
    this.view.update(model, this.config);
  }
};
function defineAgentationElement(realm) {
  var _config, _runtime, _failure;
  const view = realm ?? (typeof window === "undefined" ? void 0 : window);
  if (!view?.customElements) return void 0;
  const existing = view.customElements.get(TAG_NAME);
  if (existing) return existing;
  const HTMLElementCtor = view.HTMLElement;
  class AgentationOverlay extends HTMLElementCtor {
    constructor() {
      super(...arguments);
      __privateAdd(this, _config, {});
      __privateAdd(this, _runtime);
      __privateAdd(this, _failure);
    }
    get config() {
      return __privateGet(this, _config);
    }
    set config(next) {
      __privateSet(this, _config, next);
      __privateGet(this, _runtime)?.configure(next);
    }
    connectedCallback() {
      if (__privateGet(this, _runtime)) return;
      const document = this.ownerDocument;
      if (instances.has(document)) {
        __privateSet(this, _failure, "Only one Agentation instance per document is supported");
        console.warn(`[Agentation] ${__privateGet(this, _failure)}`);
        return;
      }
      __privateSet(this, _failure, void 0);
      __privateSet(this, _runtime, new NativeAgentation(this, __privateGet(this, _config)));
      instances.set(document, __privateGet(this, _runtime));
    }
    disconnectedCallback() {
      __privateGet(this, _runtime)?.destroy();
      __privateSet(this, _runtime, void 0);
    }
    getRuntime() {
      return __privateGet(this, _runtime);
    }
    getFailure() {
      return __privateGet(this, _failure);
    }
  }
  _config = new WeakMap();
  _runtime = new WeakMap();
  _failure = new WeakMap();
  view.customElements.define(TAG_NAME, AgentationOverlay);
  return view.customElements.get(TAG_NAME);
}
function mountAgentation(document, config = {}) {
  defineAgentationElement(document.defaultView ?? void 0);
  const element = document.createElement(TAG_NAME);
  element.config = config;
  document.body.append(element);
  const runtime = element.getRuntime?.();
  if (!runtime) {
    element.remove();
    throw new Error(element.getFailure?.() ?? "Agentation failed to initialize");
  }
  let destroyed = false;
  return {
    element,
    configure(next) {
      if (destroyed) throw new Error("Agentation controller has been destroyed");
      element.config = next;
    },
    getAnnotations() {
      return destroyed ? [] : runtime.getAnnotations();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      element.remove();
    }
  };
}
export {
  defineAgentationElement,
  mountAgentation
};
//# sourceMappingURL=browser.mjs.map