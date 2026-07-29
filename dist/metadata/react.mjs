// src/utils/react-detection.ts
var FiberTags = {
  FunctionComponent: 0,
  ClassComponent: 1,
  IndeterminateComponent: 2,
  HostRoot: 3,
  HostPortal: 4,
  HostComponent: 5,
  // DOM elements like <div>
  HostText: 6,
  Fragment: 7,
  Mode: 8,
  ContextConsumer: 9,
  ContextProvider: 10,
  ForwardRef: 11,
  Profiler: 12,
  SuspenseComponent: 13,
  MemoComponent: 14,
  SimpleMemoComponent: 15,
  LazyComponent: 16,
  // React 18/19 additions
  IncompleteClassComponent: 17,
  DehydratedFragment: 18,
  SuspenseListComponent: 19,
  // Note: 20 is unused/reserved
  ScopeComponent: 21,
  OffscreenComponent: 22,
  LegacyHiddenComponent: 23,
  CacheComponent: 24,
  TracingMarkerComponent: 25,
  HostHoistable: 26,
  HostSingleton: 27,
  IncompleteFunctionComponent: 28,
  Throw: 29,
  ViewTransitionComponent: 30,
  ActivityComponent: 31
};
var DEFAULT_SKIP_EXACT = /* @__PURE__ */ new Set([
  "Component",
  "PureComponent",
  "Fragment",
  "Suspense",
  "Profiler",
  "StrictMode",
  "Routes",
  "Route",
  "Outlet",
  // Framework internals - exact matches
  "Root",
  "ErrorBoundaryHandler",
  "HotReload",
  "Hot"
]);
var DEFAULT_SKIP_PATTERNS = [
  /Boundary$/,
  // ErrorBoundary, RedirectBoundary
  /BoundaryHandler$/,
  // ErrorBoundaryHandler
  /Provider$/,
  // ThemeProvider, Context.Provider
  /Consumer$/,
  // Context.Consumer
  /^(Inner|Outer)/,
  // InnerLayoutRouter
  /Router$/,
  // AppRouter, BrowserRouter
  /^Client(Page|Segment|Root)/,
  // ClientPageRoot, ClientSegmentRoot
  /^Segment(ViewNode|Node)$/,
  // Next.js App Router internals
  /^LayoutSegment/,
  // Next.js layout segment wrappers
  /^Server(Root|Component|Render)/,
  // ServerRoot (not ServerStatus)
  /^RSC/,
  // RSCComponent
  /Context$/,
  // LayoutRouterContext
  /^Hot(Reload)?$/,
  // HotReload (exact match to avoid false positives)
  /^(Dev|React)(Overlay|Tools|Root)/,
  // DevTools, ReactDevOverlay
  /Overlay$/,
  // ReactDevOverlay, ErrorOverlay
  /Handler$/,
  // ScrollAndFocusHandler, ErrorBoundaryHandler
  /^With[A-Z]/,
  // withRouter, WithAuth (HOCs)
  /Wrapper$/,
  // Generic wrappers
  /^Root$/
  // Generic Root component
];
var DEFAULT_USER_PATTERNS = [
  /Page$/,
  // HomePage, InstallPage
  /View$/,
  // ListView, DetailView
  /Screen$/,
  // HomeScreen
  /Section$/,
  // HeroSection
  /Card$/,
  // ProductCard
  /List$/,
  // UserList
  /Item$/,
  // ListItem, MenuItem
  /Form$/,
  // LoginForm
  /Modal$/,
  // ConfirmModal
  /Dialog$/,
  // AlertDialog
  /Button$/,
  // SubmitButton (but not all buttons)
  /Nav$/,
  // SideNav, TopNav
  /Header$/,
  // PageHeader
  /Footer$/,
  // PageFooter
  /Layout$/,
  // MainLayout (careful - could be framework)
  /Panel$/,
  // SidePanel
  /Tab$/,
  // SettingsTab
  /Menu$/
  // DropdownMenu
];
function resolveConfig(config) {
  const mode = config?.mode ?? "filtered";
  let skipExact = DEFAULT_SKIP_EXACT;
  if (config?.skipExact) {
    const additional = config.skipExact instanceof Set ? config.skipExact : new Set(config.skipExact);
    skipExact = /* @__PURE__ */ new Set([...DEFAULT_SKIP_EXACT, ...additional]);
  }
  return {
    maxComponents: config?.maxComponents ?? 6,
    maxDepth: config?.maxDepth ?? 30,
    mode,
    skipExact,
    skipPatterns: config?.skipPatterns ? [...DEFAULT_SKIP_PATTERNS, ...config.skipPatterns] : DEFAULT_SKIP_PATTERNS,
    userPatterns: config?.userPatterns ?? DEFAULT_USER_PATTERNS,
    filter: config?.filter
  };
}
function normalizeComponentName(name) {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
}
function getAncestorClasses(element, maxDepth = 10) {
  const classes = /* @__PURE__ */ new Set();
  let current = element;
  let depth = 0;
  while (current && depth < maxDepth) {
    if (current.className && typeof current.className === "string") {
      current.className.split(/\s+/).forEach((cls) => {
        if (cls.length > 1) {
          const normalized = cls.replace(/[_][a-zA-Z0-9]{5,}.*$/, "").toLowerCase();
          if (normalized.length > 1) {
            classes.add(normalized);
          }
        }
      });
    }
    current = current.parentElement;
    depth++;
  }
  return classes;
}
function componentCorrelatesWithDOM(componentName, domClasses) {
  const normalized = normalizeComponentName(componentName);
  for (const cls of domClasses) {
    if (cls === normalized) return true;
    const componentWords = normalized.split("-").filter((w) => w.length > 2);
    const classWords = cls.split("-").filter((w) => w.length > 2);
    for (const cWord of componentWords) {
      for (const dWord of classWords) {
        if (cWord === dWord || cWord.includes(dWord) || dWord.includes(cWord)) {
          return true;
        }
      }
    }
  }
  return false;
}
function shouldIncludeComponent(name, depth, config, domClasses) {
  if (config.filter) {
    return config.filter(name, depth);
  }
  switch (config.mode) {
    case "all":
      return true;
    case "filtered":
      if (config.skipExact.has(name)) {
        return false;
      }
      if (config.skipPatterns.some((p) => p.test(name))) {
        return false;
      }
      return true;
    case "smart":
      if (config.skipExact.has(name)) {
        return false;
      }
      if (config.skipPatterns.some((p) => p.test(name))) {
        return false;
      }
      if (domClasses && componentCorrelatesWithDOM(name, domClasses)) {
        return true;
      }
      if (config.userPatterns.some((p) => p.test(name))) {
        return true;
      }
      return false;
    default:
      return true;
  }
}
var reactDetectionCache = null;
var componentCacheAll = /* @__PURE__ */ new WeakMap();
function hasReactFiber(element) {
  return Object.keys(element).some(
    (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$") || key.startsWith("__reactProps$")
  );
}
function isReactPage() {
  if (reactDetectionCache !== null) {
    return reactDetectionCache;
  }
  if (typeof document === "undefined") {
    return false;
  }
  if (document.body && hasReactFiber(document.body)) {
    reactDetectionCache = true;
    return true;
  }
  const commonRoots = ["#root", "#app", "#__next", "[data-reactroot]"];
  for (const selector of commonRoots) {
    const el = document.querySelector(selector);
    if (el && hasReactFiber(el)) {
      reactDetectionCache = true;
      return true;
    }
  }
  if (document.body) {
    for (const child of document.body.children) {
      if (hasReactFiber(child)) {
        reactDetectionCache = true;
        return true;
      }
    }
  }
  reactDetectionCache = false;
  return false;
}
var componentCacheAllRef = { map: componentCacheAll };
function getReactFiberKey(element) {
  const keys = Object.keys(element);
  return keys.find(
    (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")
  ) || null;
}
function getFiberFromElement(element) {
  const key = getReactFiberKey(element);
  if (!key) return null;
  return element[key];
}
function getComponentNameFromType(type) {
  if (!type) return null;
  if (type.displayName) return type.displayName;
  if (type.name) return type.name;
  return null;
}
function getComponentNameFromFiber(fiber) {
  const { tag, type, elementType } = fiber;
  if (tag === FiberTags.HostComponent || tag === FiberTags.HostText || tag === FiberTags.HostHoistable || tag === FiberTags.HostSingleton) {
    return null;
  }
  if (tag === FiberTags.Fragment || tag === FiberTags.Mode || tag === FiberTags.Profiler || tag === FiberTags.DehydratedFragment) {
    return null;
  }
  if (tag === FiberTags.HostRoot || tag === FiberTags.HostPortal || tag === FiberTags.ScopeComponent || tag === FiberTags.OffscreenComponent || tag === FiberTags.LegacyHiddenComponent || tag === FiberTags.CacheComponent || tag === FiberTags.TracingMarkerComponent || tag === FiberTags.Throw || tag === FiberTags.ViewTransitionComponent || tag === FiberTags.ActivityComponent) {
    return null;
  }
  if (tag === FiberTags.ForwardRef) {
    const elType = elementType;
    if (elType?.render) {
      const innerName = getComponentNameFromType(elType.render);
      if (innerName) return innerName;
    }
    if (elType?.displayName) return elType.displayName;
    return getComponentNameFromType(type);
  }
  if (tag === FiberTags.MemoComponent || tag === FiberTags.SimpleMemoComponent) {
    const elType = elementType;
    if (elType?.type) {
      const innerName = getComponentNameFromType(elType.type);
      if (innerName) return innerName;
    }
    if (elType?.displayName) return elType.displayName;
    return getComponentNameFromType(type);
  }
  if (tag === FiberTags.ContextProvider) {
    const elType = type;
    if (elType?._context?.displayName) {
      return `${elType._context.displayName}.Provider`;
    }
    return null;
  }
  if (tag === FiberTags.ContextConsumer) {
    const elType = type;
    if (elType?.displayName) {
      return `${elType.displayName}.Consumer`;
    }
    return null;
  }
  if (tag === FiberTags.LazyComponent) {
    const elType = elementType;
    if (elType?._status === 1 && elType._result) {
      return getComponentNameFromType(elType._result);
    }
    return null;
  }
  if (tag === FiberTags.SuspenseComponent || tag === FiberTags.SuspenseListComponent) {
    return null;
  }
  if (tag === FiberTags.IncompleteClassComponent || tag === FiberTags.IncompleteFunctionComponent) {
    return getComponentNameFromType(type);
  }
  if (tag === FiberTags.FunctionComponent || tag === FiberTags.ClassComponent || tag === FiberTags.IndeterminateComponent) {
    return getComponentNameFromType(type);
  }
  return null;
}
function isMinifiedName(name) {
  if (name.length <= 2) return true;
  if (name.length <= 3 && name === name.toLowerCase()) return true;
  return false;
}
function getReactComponentName(element, config) {
  const resolved = resolveConfig(config);
  const useCache = resolved.mode === "all";
  if (useCache) {
    const cached = componentCacheAllRef.map.get(element);
    if (cached !== void 0) {
      return cached;
    }
  }
  if (!isReactPage()) {
    const result2 = { path: null, components: [] };
    if (useCache) {
      componentCacheAllRef.map.set(element, result2);
    }
    return result2;
  }
  const domClasses = resolved.mode === "smart" ? getAncestorClasses(element) : void 0;
  const components = [];
  try {
    let fiber = getFiberFromElement(element);
    let depth = 0;
    while (fiber && depth < resolved.maxDepth && components.length < resolved.maxComponents) {
      const name = getComponentNameFromFiber(fiber);
      if (name && !isMinifiedName(name) && shouldIncludeComponent(name, depth, resolved, domClasses)) {
        components.push(name);
      }
      fiber = fiber.return;
      depth++;
    }
  } catch {
    const result2 = { path: null, components: [] };
    if (useCache) {
      componentCacheAllRef.map.set(element, result2);
    }
    return result2;
  }
  if (components.length === 0) {
    const result2 = { path: null, components: [] };
    if (useCache) {
      componentCacheAllRef.map.set(element, result2);
    }
    return result2;
  }
  const path = components.slice().reverse().map((c) => `<${c}>`).join(" ");
  const result = { path, components };
  if (useCache) {
    componentCacheAllRef.map.set(element, result);
  }
  return result;
}

// src/utils/source-location.ts
import React from "react";
var FIBER_TAGS = {
  FunctionComponent: 0,
  ClassComponent: 1,
  IndeterminateComponent: 2,
  HostRoot: 3,
  HostPortal: 4,
  HostComponent: 5,
  HostText: 6,
  Fragment: 7,
  Mode: 8,
  ContextConsumer: 9,
  ContextProvider: 10,
  ForwardRef: 11,
  Profiler: 12,
  SuspenseComponent: 13,
  MemoComponent: 14,
  SimpleMemoComponent: 15,
  LazyComponent: 16
};
function getFiberFromElement2(element) {
  if (!element || typeof element !== "object") {
    return null;
  }
  const keys = Object.keys(element);
  const fiberKey = keys.find((key) => key.startsWith("__reactFiber$"));
  if (fiberKey) {
    return element[fiberKey] || null;
  }
  const instanceKey = keys.find((key) => key.startsWith("__reactInternalInstance$"));
  if (instanceKey) {
    return element[instanceKey] || null;
  }
  const possibleFiberKey = keys.find((key) => {
    if (!key.startsWith("__react")) return false;
    const value = element[key];
    return value && typeof value === "object" && "_debugSource" in value;
  });
  if (possibleFiberKey) {
    return element[possibleFiberKey] || null;
  }
  return null;
}
function getComponentName(fiber) {
  if (!fiber.type) {
    return null;
  }
  if (typeof fiber.type === "string") {
    return null;
  }
  if (typeof fiber.type === "object" || typeof fiber.type === "function") {
    const type = fiber.type;
    if (type.displayName) {
      return type.displayName;
    }
    if (type.name) {
      return type.name;
    }
  }
  return null;
}
function findDebugSource(fiber, maxDepth = 50) {
  let current = fiber;
  let depth = 0;
  while (current && depth < maxDepth) {
    if (current._debugSource) {
      return {
        source: current._debugSource,
        componentName: getComponentName(current)
      };
    }
    if (current._debugOwner?._debugSource) {
      return {
        source: current._debugOwner._debugSource,
        componentName: getComponentName(current._debugOwner)
      };
    }
    current = current.return;
    depth++;
  }
  return null;
}
function findDebugSourceReact19(fiber) {
  let current = fiber;
  let depth = 0;
  const maxDepth = 50;
  while (current && depth < maxDepth) {
    const anyFiber = current;
    const possibleSourceKeys = [
      "_debugSource",
      "__source",
      "_source",
      "debugSource"
    ];
    for (const key of possibleSourceKeys) {
      const source = anyFiber[key];
      if (source && typeof source === "object" && "fileName" in source) {
        return {
          source,
          componentName: getComponentName(current)
        };
      }
    }
    if (current.memoizedProps) {
      const props = current.memoizedProps;
      if (props.__source && typeof props.__source === "object") {
        const source = props.__source;
        if (source.fileName && source.lineNumber) {
          return {
            source: {
              fileName: source.fileName,
              lineNumber: source.lineNumber,
              columnNumber: source.columnNumber
            },
            componentName: getComponentName(current)
          };
        }
      }
    }
    current = current.return;
    depth++;
  }
  return null;
}
var sourceProbeCache = /* @__PURE__ */ new Map();
function unwrapComponentType(fiber) {
  const tag = fiber.tag;
  const type = fiber.type;
  const elementType = fiber.elementType;
  if (typeof type === "string" || type == null) return null;
  if (typeof type === "function" && type.prototype?.isReactComponent) {
    return null;
  }
  if ((tag === FIBER_TAGS.FunctionComponent || tag === FIBER_TAGS.IndeterminateComponent) && typeof type === "function") {
    return type;
  }
  if (tag === FIBER_TAGS.ForwardRef && elementType) {
    const render = elementType.render;
    if (typeof render === "function") return render;
  }
  if ((tag === FIBER_TAGS.MemoComponent || tag === FIBER_TAGS.SimpleMemoComponent) && elementType) {
    const inner = elementType.type;
    if (typeof inner === "function") return inner;
  }
  if (typeof type === "function") return type;
  return null;
}
function getReactDispatcher() {
  const reactModule = React;
  const r19 = reactModule.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (r19 && "H" in r19) {
    return {
      get: () => r19.H,
      set: (d) => {
        r19.H = d;
      }
    };
  }
  const r18 = reactModule.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  if (r18) {
    const dispatcher = r18.ReactCurrentDispatcher;
    if (dispatcher && "current" in dispatcher) {
      return {
        get: () => dispatcher.current,
        set: (d) => {
          dispatcher.current = d;
        }
      };
    }
  }
  return null;
}
function parseComponentFrame(stack) {
  const lines = stack.split("\n");
  const skipPatterns = [
    /source-location/,
    /\/dist\/index\./,
    // Our bundled output (dist/index.mjs, dist/index.js)
    /node_modules\//,
    // Any package in node_modules
    /react-dom/,
    /react\.development/,
    /react\.production/,
    /chunk-[A-Z0-9]+/i,
    /react-stack-bottom-frame/,
    /react-reconciler/,
    /scheduler/,
    /<anonymous>/
    // Proxy handler frames
  ];
  const v8Re = /^\s*at\s+(?:.*?\s+\()?(.+?):(\d+):(\d+)\)?$/;
  const webkitRe = /^[^@]*@(.+?):(\d+):(\d+)$/;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (skipPatterns.some((p) => p.test(trimmed))) continue;
    const match = v8Re.exec(trimmed) || webkitRe.exec(trimmed);
    if (match) {
      return {
        fileName: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10)
      };
    }
  }
  return null;
}
function cleanSourcePath(rawPath) {
  let path = rawPath;
  path = path.replace(/[?#].*$/, "");
  path = path.replace(/^turbopack:\/\/\/\[project\]\//, "");
  path = path.replace(/^webpack-internal:\/\/\/\.\//, "");
  path = path.replace(/^webpack-internal:\/\/\//, "");
  path = path.replace(/^webpack:\/\/\/\.\//, "");
  path = path.replace(/^webpack:\/\/\//, "");
  path = path.replace(/^turbopack:\/\/\//, "");
  path = path.replace(/^https?:\/\/[^/]+\//, "");
  path = path.replace(/^file:\/\/\//, "/");
  path = path.replace(/^\([^)]+\)\/\.\//, "");
  path = path.replace(/^\.\//, "");
  return path;
}
function probeComponentSource(fiber) {
  const fn = unwrapComponentType(fiber);
  if (!fn) return null;
  if (sourceProbeCache.has(fn)) {
    return sourceProbeCache.get(fn);
  }
  const dispatcher = getReactDispatcher();
  if (!dispatcher) {
    sourceProbeCache.set(fn, null);
    return null;
  }
  const original = dispatcher.get();
  let result = null;
  try {
    const stackCapturingDispatcher = new Proxy(
      {},
      {
        get() {
          throw new Error("probe");
        }
      }
    );
    dispatcher.set(stackCapturingDispatcher);
    try {
      fn({});
    } catch (e) {
      if (e instanceof Error && e.message === "probe" && e.stack) {
        const frame = parseComponentFrame(e.stack);
        if (frame) {
          const cleaned = cleanSourcePath(frame.fileName);
          result = {
            fileName: cleaned,
            lineNumber: frame.line,
            columnNumber: frame.column,
            componentName: getComponentName(fiber) || void 0
          };
        }
      }
    }
  } finally {
    dispatcher.set(original);
  }
  sourceProbeCache.set(fn, result);
  return result;
}
function probeSourceWalk(fiber, maxDepth = 15) {
  let current = fiber;
  let depth = 0;
  while (current && depth < maxDepth) {
    const source = probeComponentSource(current);
    if (source) return source;
    current = current.return;
    depth++;
  }
  return null;
}
function getSourceLocation(element) {
  const fiber = getFiberFromElement2(element);
  if (!fiber) {
    return {
      found: false,
      reason: "no-fiber",
      isReactApp: false,
      isProduction: false
    };
  }
  let debugInfo = findDebugSource(fiber);
  if (!debugInfo) {
    debugInfo = findDebugSourceReact19(fiber);
  }
  if (debugInfo?.source) {
    return {
      found: true,
      source: {
        fileName: debugInfo.source.fileName,
        lineNumber: debugInfo.source.lineNumber,
        columnNumber: debugInfo.source.columnNumber,
        componentName: debugInfo.componentName || void 0
      },
      isReactApp: true,
      isProduction: false
    };
  }
  const probed = probeSourceWalk(fiber);
  if (probed) {
    return { found: true, source: probed, isReactApp: true, isProduction: false };
  }
  return {
    found: false,
    reason: "no-debug-source",
    isReactApp: true,
    isProduction: false
  };
}

// src/metadata/react.ts
var OUTPUT_TO_REACT_MODE = {
  compact: "off",
  standard: "filtered",
  detailed: "smart",
  forensic: "all"
};
function createReactMetadataAdapter(options = {}) {
  const explicitMode = options.mode;
  return {
    id: "react",
    inspect(element, context) {
      if (!(element instanceof HTMLElement)) return void 0;
      const mode = explicitMode ?? (context ? OUTPUT_TO_REACT_MODE[context.outputDetail] : void 0);
      const componentNames = mode === "off" ? [] : getReactComponentName(element, { ...options, mode }).components;
      const location = getSourceLocation(element);
      if (!componentNames.length && (!location.found || !location.source)) {
        return void 0;
      }
      return {
        componentPath: componentNames.length ? [...componentNames].reverse() : void 0,
        source: location.found && location.source ? {
          file: location.source.fileName,
          line: location.source.lineNumber,
          column: location.source.columnNumber
        } : void 0,
        confidence: location.found ? "exact" : "heuristic"
      };
    }
  };
}
export {
  createReactMetadataAdapter
};
//# sourceMappingURL=react.mjs.map