// =============================================================================
// Wireframe Skeleton Renderers
// =============================================================================
//
// Each component type gets a skeleton wireframe that scales to the given
// dimensions. Geometry is derived from the placement's current size, so the
// whole subtree is rebuilt whenever that size changes — exactly what the
// original React renderers did on every re-render.
//
// Colours come from the `--agd-*` custom properties the layout overlay defines.
// =============================================================================

import type { ComponentType } from "./types";
import type { RuntimeEnvironment } from "../environment";

type StyleValue = string | number;
type Style = Record<string, StyleValue>;

/**
 * Properties React leaves unitless. Everything else gets `px` appended to a
 * numeric value, so the ported style objects stay literal transcriptions.
 */
const UNITLESS: Record<string, true> = {
  flex: true,
  flexGrow: true,
  flexShrink: true,
  fontWeight: true,
  lineHeight: true,
  opacity: true,
  order: true,
  zIndex: true,
};

function applyStyle(node: HTMLElement | SVGElement, style: Style): void {
  const target = node.style as unknown as Record<string, string>;
  for (const [property, value] of Object.entries(style)) {
    target[property] =
      typeof value === "number" && !UNITLESS[property] ? `${value}px` : String(value);
  }
}

function box(
  environment: RuntimeEnvironment,
  style: Style,
  ...children: (Node | null)[]
): HTMLDivElement {
  const node = environment.createElement("div");
  applyStyle(node, style);
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

function label(
  environment: RuntimeEnvironment,
  style: Style,
  text: string,
): HTMLSpanElement {
  const node = environment.createElement("span");
  applyStyle(node, style);
  node.textContent = text;
  return node;
}

function svg(
  environment: RuntimeEnvironment,
  attributes: Record<string, string>,
  ...children: SVGElement[]
): SVGSVGElement {
  const node = environment.createSvg("svg", attributes);
  for (const child of children) node.appendChild(child);
  return node;
}

// --- Primitive shapes -------------------------------------------------------

function bar(
  environment: RuntimeEnvironment,
  w: number | string,
  h = 3,
  strong?: boolean,
): HTMLDivElement {
  return box(environment, {
    width: typeof w === "number" ? `${w}px` : w,
    height: h,
    borderRadius: 2,
    background: strong ? "var(--agd-bar-strong)" : "var(--agd-bar)",
    flexShrink: 0,
  });
}

function block(
  environment: RuntimeEnvironment,
  w: number | string,
  h: number | string,
  radius = 3,
  style?: Style,
): HTMLDivElement {
  return box(environment, {
    width: typeof w === "number" ? `${w}px` : w,
    height: typeof h === "number" ? `${h}px` : h,
    borderRadius: radius,
    border: "1px dashed var(--agd-stroke)",
    background: "var(--agd-fill)",
    flexShrink: 0,
    ...style,
  });
}

function circle(environment: RuntimeEnvironment, size: number): HTMLDivElement {
  return box(environment, {
    width: size,
    height: size,
    borderRadius: "50%",
    border: "1px dashed var(--agd-stroke)",
    background: "var(--agd-fill)",
    flexShrink: 0,
  });
}

// --- Skeleton renderers per type -------------------------------------------

type SkeletonProps = { width: number; height: number; text?: string };
type Renderer = (
  environment: RuntimeEnvironment,
  props: SkeletonProps,
) => HTMLElement | SVGElement;

const navigationSkeleton: Renderer = (e, { width, height }) => {
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
      bar(e, width * 0.06),
    ),
    block(e, width * 0.1, Math.min(28, height * 0.5), 4),
  );
};

const heroSkeleton: Renderer = (e, { width, height, text }) =>
  box(
    e,
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: height * 0.05,
    },
    text
      ? label(
          e,
          {
            fontSize: Math.min(20, height * 0.08),
            fontWeight: 600,
            color: "var(--agd-text-3)",
            textAlign: "center",
            maxWidth: "80%",
          },
          text,
        )
      : bar(e, width * 0.5, Math.max(6, height * 0.04), true),
    bar(e, width * 0.6),
    bar(e, width * 0.4),
    block(e, Math.min(140, width * 0.2), Math.min(36, height * 0.12), 6, {
      marginTop: height * 0.06,
    }),
  );

const sidebarSkeleton: Renderer = (e, { width, height }) => {
  const items = Math.max(3, Math.floor(height / 36));
  const root = box(e, {
    padding: width * 0.08,
    display: "flex",
    flexDirection: "column",
    gap: height * 0.03,
  });
  root.appendChild(bar(e, width * 0.6, 4, true));
  for (let i = 0; i < items; i++) {
    root.appendChild(
      box(
        e,
        { display: "flex", alignItems: "center", gap: 6 },
        block(e, 10, 10, 2),
        bar(e, width * (0.4 + ((i * 17) % 30) / 100)),
      ),
    );
  }
  return root;
};

const footerSkeleton: Renderer = (e, { width, height }) => {
  const cols = Math.max(2, Math.min(4, Math.floor(width / 160)));
  const root = box(e, {
    display: "flex",
    padding: `${height * 0.12}px ${width * 0.03}px`,
    gap: width * 0.05,
  });
  for (let i = 0; i < cols; i++) {
    root.appendChild(
      box(
        e,
        { flex: 1, display: "flex", flexDirection: "column", gap: 4 },
        bar(e, "60%", 3, true),
        bar(e, "80%", 2),
        bar(e, "70%", 2),
        bar(e, "60%", 2),
      ),
    );
  }
  return root;
};

const modalSkeleton: Renderer = (e, { width }) =>
  box(
    e,
    { height: "100%", display: "flex", flexDirection: "column" },
    box(
      e,
      {
        padding: "10px 12px",
        borderBottom: "1px solid var(--agd-stroke)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      },
      bar(e, width * 0.3, 4, true),
      box(e, { width: 14, height: 14, border: "1px solid var(--agd-stroke)", borderRadius: 3 }),
    ),
    box(
      e,
      { flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 6 },
      bar(e, "90%"),
      bar(e, "70%"),
      bar(e, "80%"),
    ),
    box(
      e,
      {
        padding: "10px 12px",
        borderTop: "1px solid var(--agd-stroke)",
        display: "flex",
        justifyContent: "flex-end",
        gap: 8,
      },
      block(e, 70, 26, 4),
      block(e, 70, 26, 4, { background: "var(--agd-bar)" }),
    ),
  );

const cardSkeleton: Renderer = (e) =>
  box(
    e,
    { height: "100%", display: "flex", flexDirection: "column" },
    box(e, {
      height: "40%",
      background: "var(--agd-fill)",
      borderBottom: "1px dashed var(--agd-stroke)",
    }),
    box(
      e,
      { flex: 1, padding: 10, display: "flex", flexDirection: "column", gap: 5 },
      bar(e, "70%", 4, true),
      bar(e, "95%", 2),
      bar(e, "85%", 2),
      bar(e, "50%", 2),
    ),
  );

const textSkeleton: Renderer = (e, { width, height, text }) => {
  if (text) {
    const node = box(e, {
      padding: 4,
      fontSize: Math.min(14, height * 0.3),
      lineHeight: 1.5,
      color: "var(--agd-text-3)",
      wordBreak: "break-word",
      overflow: "hidden",
    });
    node.textContent = text;
    return node;
  }
  const lines = Math.max(2, Math.floor(height / 18));
  const root = box(e, { display: "flex", flexDirection: "column", gap: 6, padding: 4 });
  root.appendChild(bar(e, width * 0.6, 5, true));
  for (let i = 0; i < lines; i++) {
    root.appendChild(bar(e, `${70 + ((i * 13) % 25)}%`, 2));
  }
  return root;
};

const imageSkeleton: Renderer = (e, { width, height }) =>
  box(
    e,
    { height: "100%", position: "relative" },
    svg(
      e,
      {
        width: "100%",
        height: "100%",
        viewBox: `0 0 ${width} ${height}`,
        preserveAspectRatio: "none",
        fill: "none",
      },
      e.createSvg("line", {
        x1: "0",
        y1: "0",
        x2: String(width),
        y2: String(height),
        stroke: "var(--agd-stroke)",
        "stroke-width": "1",
      }),
      e.createSvg("line", {
        x1: String(width),
        y1: "0",
        x2: "0",
        y2: String(height),
        stroke: "var(--agd-stroke)",
        "stroke-width": "1",
      }),
      e.createSvg("circle", {
        cx: String(width * 0.3),
        cy: String(height * 0.3),
        r: String(Math.min(width, height) * 0.08),
        fill: "var(--agd-fill)",
        stroke: "var(--agd-stroke)",
        "stroke-width": "0.8",
      }),
    ),
  );

const tableSkeleton: Renderer = (e, { width, height }) => {
  const cols = Math.max(2, Math.min(5, Math.floor(width / 100)));
  const rows = Math.max(2, Math.min(6, Math.floor(height / 32)));
  const root = box(e, { height: "100%", display: "flex", flexDirection: "column" });

  const head = box(e, {
    display: "flex",
    borderBottom: "1px solid var(--agd-stroke)",
    padding: "6px 0",
  });
  for (let i = 0; i < cols; i++) {
    head.appendChild(box(e, { flex: 1, padding: "0 8px" }, bar(e, "70%", 3, true)));
  }
  root.appendChild(head);

  for (let r = 0; r < rows; r++) {
    const row = box(e, {
      display: "flex",
      borderBottom: "1px solid rgba(255,255,255,0.03)",
      padding: "6px 0",
    });
    for (let c = 0; c < cols; c++) {
      row.appendChild(
        box(e, { flex: 1, padding: "0 8px" }, bar(e, `${50 + ((r * 7 + c * 13) % 40)}%`, 2)),
      );
    }
    root.appendChild(row);
  }
  return root;
};

const listSkeleton: Renderer = (e, { height }) => {
  const items = Math.max(2, Math.floor(height / 28));
  const root = box(e, { display: "flex", flexDirection: "column", gap: 4, padding: 4 });
  for (let i = 0; i < items; i++) {
    root.appendChild(
      box(
        e,
        { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" },
        circle(e, 8),
        bar(e, `${55 + ((i * 17) % 35)}%`, 2),
      ),
    );
  }
  return root;
};

const buttonSkeleton: Renderer = (e, { width, height, text }) =>
  box(
    e,
    {
      height: "100%",
      borderRadius: Math.min(8, height / 3),
      border: "1px solid var(--agd-stroke)",
      background: "var(--agd-fill)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    text
      ? label(
          e,
          {
            fontSize: Math.min(13, height * 0.4),
            fontWeight: 500,
            color: "var(--agd-text-3)",
            letterSpacing: "-0.01em",
          },
          text,
        )
      : bar(e, Math.max(20, width * 0.5), 3, true),
  );

const inputSkeleton: Renderer = (e, { width, height }) =>
  box(
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
        paddingLeft: 8,
      },
      bar(e, "40%", 2),
    ),
  );

const formSkeleton: Renderer = (e, { width, height }) => {
  const fields = Math.max(2, Math.min(5, Math.floor(height / 56)));
  const root = box(e, {
    display: "flex",
    flexDirection: "column",
    gap: height * 0.04,
    padding: 8,
  });
  for (let i = 0; i < fields; i++) {
    root.appendChild(
      box(
        e,
        { display: "flex", flexDirection: "column", gap: 4 },
        bar(e, 60 + ((i * 17) % 30), 2),
        block(e, "100%", 28, 4),
      ),
    );
  }
  root.appendChild(
    block(e, Math.min(120, width * 0.35), 30, 6, {
      marginTop: 8,
      alignSelf: "flex-end",
      background: "var(--agd-bar)",
    }),
  );
  return root;
};

const tabsSkeleton: Renderer = (e, { width }) => {
  const tabCount = Math.max(2, Math.min(4, Math.floor(width / 120)));
  const strip = box(e, {
    display: "flex",
    gap: 2,
    borderBottom: "1px solid var(--agd-stroke)",
  });
  for (let i = 0; i < tabCount; i++) {
    strip.appendChild(
      box(
        e,
        {
          padding: "8px 12px",
          borderBottom: i === 0 ? "2px solid var(--agd-bar-strong)" : "none",
        },
        bar(e, 60, 3, i === 0),
      ),
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
      bar(e, "75%", 2),
    ),
  );
};

const avatarSkeleton: Renderer = (e, { width, height }) => {
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
      "stroke-dasharray": "3 2",
    }),
    e.createSvg("circle", {
      cx: String(width / 2),
      cy: String(height * 0.38),
      r: String(r * 0.28),
      stroke: "var(--agd-stroke)",
      fill: "var(--agd-fill)",
      "stroke-width": "0.8",
    }),
    e.createSvg("path", {
      d: `M${width / 2 - r * 0.55} ${height * 0.78} C${width / 2 - r * 0.55} ${height * 0.55} ${width / 2 + r * 0.55} ${height * 0.55} ${width / 2 + r * 0.55} ${height * 0.78}`,
      stroke: "var(--agd-stroke)",
      fill: "var(--agd-fill)",
      "stroke-width": "0.8",
    }),
  );
};

const badgeSkeleton: Renderer = (e, { width, height }) =>
  box(
    e,
    {
      height: "100%",
      borderRadius: height / 2,
      border: "1px solid var(--agd-stroke)",
      background: "var(--agd-fill)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    bar(e, Math.max(16, width * 0.5), 2, true),
  );

const headerSkeleton: Renderer = (e, { width, height }) =>
  box(
    e,
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: height * 0.08,
    },
    bar(e, width * 0.5, Math.max(5, height * 0.06), true),
    bar(e, width * 0.35),
  );

const sectionSkeleton: Renderer = (e, { width, height }) =>
  box(
    e,
    {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      gap: height * 0.04,
      padding: width * 0.04,
    },
    bar(e, width * 0.3, 4, true),
    bar(e, width * 0.7),
    bar(e, width * 0.5),
    box(
      e,
      { flex: 1, display: "flex", gap: width * 0.03, marginTop: height * 0.06 },
      block(e, "33%", "100%", 4),
      block(e, "33%", "100%", 4),
      block(e, "33%", "100%", 4),
    ),
  );

const gridSkeleton: Renderer = (e, { width, height }) => {
  const cols = Math.max(2, Math.min(4, Math.floor(width / 140)));
  const rows = Math.max(1, Math.min(3, Math.floor(height / 120)));
  const root = box(e, {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
    gap: 6,
    height: "100%",
  });
  for (let i = 0; i < cols * rows; i++) root.appendChild(block(e, "100%", "100%", 4));
  return root;
};

const dropdownSkeleton: Renderer = (e, { width, height }) => {
  const items = Math.max(2, Math.floor((height - 32) / 28));
  const list = box(e, {
    flex: 1,
    padding: 4,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  });
  for (let i = 0; i < items; i++) {
    list.appendChild(
      box(
        e,
        {
          padding: "4px 6px",
          borderRadius: 3,
          background: i === 0 ? "var(--agd-fill)" : "transparent",
        },
        bar(e, `${50 + ((i * 17) % 35)}%`, 2, i === 0),
      ),
    );
  }
  return box(
    e,
    { height: "100%", display: "flex", flexDirection: "column" },
    box(
      e,
      { padding: "6px 8px", borderBottom: "1px solid var(--agd-stroke)" },
      bar(e, width * 0.5, 3, true),
    ),
    list,
  );
};

const toggleSkeleton: Renderer = (e, { width, height }) => {
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
      "stroke-width": "1",
    }),
    e.createSvg("circle", {
      cx: String(width - r),
      cy: String(height / 2),
      r: String(r * 0.7),
      fill: "var(--agd-bar)",
    }),
  );
};

const searchSkeleton: Renderer = (e, { height }) => {
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
      gap: 6,
    },
    circle(e, Math.min(14, height * 0.4)),
    bar(e, "50%", 2),
  );
};

const toastSkeleton: Renderer = (e, { height }) =>
  box(
    e,
    {
      height: "100%",
      borderRadius: 8,
      border: "1px dashed var(--agd-stroke)",
      background: "var(--agd-fill)",
      display: "flex",
      alignItems: "center",
      padding: "0 10px",
      gap: 8,
    },
    circle(e, Math.min(20, height * 0.5)),
    box(
      e,
      { flex: 1, display: "flex", flexDirection: "column", gap: 3 },
      bar(e, "60%", 3, true),
      bar(e, "80%", 2),
    ),
    box(e, {
      width: 14,
      height: 14,
      border: "1px solid var(--agd-stroke)",
      borderRadius: 3,
      flexShrink: 0,
    }),
  );

const progressSkeleton: Renderer = (e, { width, height }) =>
  svg(
    e,
    { width: "100%", height: "100%", viewBox: `0 0 ${width} ${height}`, fill: "none" },
    e.createSvg("rect", {
      x: "0",
      y: "0",
      width: String(width),
      height: String(height),
      rx: String(height / 2),
      stroke: "var(--agd-stroke)",
      "stroke-width": "0.8",
    }),
    e.createSvg("rect", {
      x: "1",
      y: "1",
      width: String(width * 0.65),
      height: String(height - 2),
      rx: String((height - 2) / 2),
      fill: "var(--agd-bar)",
    }),
  );

const chartSkeleton: Renderer = (e, { width }) => {
  const bars = Math.max(3, Math.min(7, Math.floor(width / 50)));
  const barW = width / (bars * 2);
  const root = box(e, {
    height: "100%",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-around",
    padding: "0 4px",
    borderBottom: "1px solid var(--agd-stroke)",
  });
  for (let i = 0; i < bars; i++) {
    const h = 30 + ((i * 37 + 17) % 55);
    root.appendChild(block(e, barW, `${h}%`, 2));
  }
  return root;
};

const videoSkeleton: Renderer = (e, { width, height }) => {
  const btnR = Math.min(width, height) * 0.12;
  return box(
    e,
    {
      height: "100%",
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
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
        justifyContent: "center",
      },
      box(e, {
        width: 0,
        height: 0,
        borderLeft: `${btnR * 0.6}px solid var(--agd-bar-strong)`,
        borderTop: `${btnR * 0.4}px solid transparent`,
        borderBottom: `${btnR * 0.4}px solid transparent`,
        marginLeft: btnR * 0.15,
      }),
    ),
  );
};

const tooltipSkeleton: Renderer = (e) =>
  box(
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
        justifyContent: "center",
      },
      bar(e, "60%", 2),
    ),
    box(e, {
      width: 8,
      height: 8,
      background: "var(--agd-fill)",
      border: "1px dashed var(--agd-stroke)",
      borderTop: "none",
      borderLeft: "none",
      transform: "rotate(45deg)",
      marginTop: -5,
    }),
  );

const breadcrumbSkeleton: Renderer = (e, { width }) => {
  const items = Math.max(2, Math.min(4, Math.floor(width / 80)));
  const root = box(e, { display: "flex", alignItems: "center", height: "100%", gap: 4 });
  for (let i = 0; i < items; i++) {
    root.appendChild(
      box(
        e,
        { display: "flex", alignItems: "center", gap: 4 },
        i > 0 ? label(e, { color: "var(--agd-stroke)", fontSize: 10 }, "/") : null,
        bar(e, 40 + ((i * 13) % 20), 2, i === items - 1),
      ),
    );
  }
  return root;
};

const paginationSkeleton: Renderer = (e, { width, height }) => {
  const count = Math.max(3, Math.min(5, Math.floor(width / 40)));
  const sz = Math.min(28, height * 0.8);
  const root = box(e, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 4,
  });
  for (let i = 0; i < count; i++) {
    root.appendChild(block(e, sz, sz, 4, i === 1 ? { background: "var(--agd-bar)" } : undefined));
  }
  return root;
};

const dividerSkeleton: Renderer = (e) =>
  box(
    e,
    { display: "flex", alignItems: "center", height: "100%" },
    box(e, { width: "100%", height: 1, background: "var(--agd-stroke)" }),
  );

const accordionSkeleton: Renderer = (e, { height }) => {
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
          flex: i === 0 ? 2 : 1,
        },
        bar(e, `${40 + ((i * 17) % 25)}%`, 3, true),
        label(e, { fontSize: 8, color: "var(--agd-stroke)" }, i === 0 ? "▼" : "▶"),
      ),
    );
  }
  return root;
};

const carouselSkeleton: Renderer = (e) =>
  box(
    e,
    { height: "100%", display: "flex", flexDirection: "column", gap: 6 },
    box(
      e,
      { flex: 1, display: "flex", gap: 6, alignItems: "center" },
      label(e, { fontSize: 12, color: "var(--agd-stroke)" }, "‹"),
      block(e, "100%", "100%", 4),
      label(e, { fontSize: 12, color: "var(--agd-stroke)" }, "›"),
    ),
    box(
      e,
      { display: "flex", justifyContent: "center", gap: 4 },
      circle(e, 5),
      circle(e, 5),
      circle(e, 5),
    ),
  );

const pricingSkeleton: Renderer = (e, { width, height }) => {
  const features = box(e, {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    width: "100%",
    padding: "8px 0",
  });
  for (let i = 0; i < 4; i++) {
    features.appendChild(
      box(
        e,
        { display: "flex", alignItems: "center", gap: 4 },
        circle(e, 5),
        bar(e, `${50 + ((i * 17) % 35)}%`, 2),
      ),
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
      gap: height * 0.04,
    },
    bar(e, width * 0.4, 3, true),
    bar(e, width * 0.3, 6, true),
    features,
    block(e, width * 0.7, Math.min(32, height * 0.1), 6, { background: "var(--agd-bar)" }),
  );
};

const testimonialSkeleton: Renderer = (e) =>
  box(
    e,
    { height: "100%", display: "flex", flexDirection: "column", padding: 10, gap: 8 },
    label(
      e,
      { fontSize: 18, lineHeight: 1, color: "var(--agd-stroke)", fontFamily: "serif" },
      "\u201C",
    ),
    box(
      e,
      { flex: 1, display: "flex", flexDirection: "column", gap: 4 },
      bar(e, "90%", 2),
      bar(e, "75%", 2),
      bar(e, "60%", 2),
    ),
    box(
      e,
      { display: "flex", alignItems: "center", gap: 6 },
      circle(e, 20),
      box(
        e,
        { display: "flex", flexDirection: "column", gap: 2 },
        bar(e, 60, 3, true),
        bar(e, 40, 2),
      ),
    ),
  );

const ctaSkeleton: Renderer = (e, { width, height }) =>
  box(
    e,
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: height * 0.08,
    },
    bar(e, width * 0.5, Math.max(4, height * 0.05), true),
    bar(e, width * 0.35),
    block(e, Math.min(140, width * 0.25), Math.min(32, height * 0.15), 6, {
      marginTop: height * 0.04,
      background: "var(--agd-bar)",
    }),
  );

const alertSkeleton: Renderer = (e) =>
  box(
    e,
    {
      height: "100%",
      borderRadius: 6,
      border: "1px dashed var(--agd-stroke)",
      background: "var(--agd-fill)",
      display: "flex",
      alignItems: "center",
      padding: "0 10px",
      gap: 8,
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
        flexShrink: 0,
      },
      box(e, { width: 2, height: 6, background: "var(--agd-bar-strong)", borderRadius: 1 }),
    ),
    box(
      e,
      { flex: 1, display: "flex", flexDirection: "column", gap: 3 },
      bar(e, "40%", 3, true),
      bar(e, "70%", 2),
    ),
  );

const bannerSkeleton: Renderer = (e, { width, height }) =>
  box(
    e,
    {
      height: "100%",
      background: "var(--agd-fill)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "0 12px",
    },
    bar(e, width * 0.4, 3, true),
    block(e, 60, Math.min(24, height * 0.6), 4),
  );

const statSkeleton: Renderer = (e, { width, height }) =>
  box(
    e,
    {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: height * 0.06,
    },
    bar(e, width * 0.5, 2),
    bar(e, width * 0.4, Math.max(8, height * 0.18), true),
    bar(e, width * 0.3, 2),
  );

const stepperSkeleton: Renderer = (e, { width, height }) => {
  const steps = Math.max(3, Math.min(5, Math.floor(width / 100)));
  const dotR = Math.min(12, height * 0.35);
  const root = box(e, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "100%",
    padding: "0 8px",
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
          flexShrink: 0,
        }),
        i < steps - 1
          ? box(e, { flex: 1, height: 1, background: "var(--agd-stroke)", margin: "0 4px" })
          : null,
      ),
    );
  }
  return root;
};

const tagSkeleton: Renderer = (e, { width }) =>
  box(
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
      padding: "0 6px",
    },
    bar(e, Math.max(16, width * 0.5), 2, true),
    box(e, {
      width: 8,
      height: 8,
      borderRadius: "50%",
      border: "1px solid var(--agd-stroke)",
      flexShrink: 0,
    }),
  );

const ratingSkeleton: Renderer = (e, { width, height }) => {
  const stars = 5;
  const sz = Math.min(height * 0.7, width / (stars * 1.5));
  const root = box(e, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: sz * 0.2,
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
          fill: i < 3 ? "var(--agd-bar)" : "none",
        }),
      ),
    );
  }
  return root;
};

const mapSkeleton: Renderer = (e, { width, height }) => {
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
      opacity: ".2",
    }),
    e.createSvg("line", {
      x1: "0",
      y1: String(height * 0.6),
      x2: String(width),
      y2: String(height * 0.2),
      stroke: "var(--agd-stroke)",
      "stroke-width": "0.5",
      opacity: ".15",
    }),
    e.createSvg("line", {
      x1: String(width * 0.4),
      y1: "0",
      x2: String(width * 0.6),
      y2: String(height),
      stroke: "var(--agd-stroke)",
      "stroke-width": "0.5",
      opacity: ".15",
    }),
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
      overflow: "hidden",
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
          opacity: ".4",
        }),
        e.createSvg("circle", { cx: "8", cy: "8", r: "3", fill: "var(--agd-fill)" }),
      ),
    ),
  );
};

const timelineSkeleton: Renderer = (e, { height }) => {
  const items = Math.max(3, Math.min(5, Math.floor(height / 60)));

  const rail = box(e, {
    width: 16,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  });
  for (let i = 0; i < items; i++) {
    rail.appendChild(
      box(
        e,
        { display: "flex", flexDirection: "column", alignItems: "center", flex: 1 },
        circle(e, 8),
        i < items - 1 ? box(e, { flex: 1, width: 1, background: "var(--agd-stroke)" }) : null,
      ),
    );
  }

  const entries = box(e, {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-around",
    paddingLeft: 8,
  });
  for (let i = 0; i < items; i++) {
    entries.appendChild(
      box(
        e,
        { display: "flex", flexDirection: "column", gap: 3 },
        bar(e, `${35 + ((i * 13) % 25)}%`, 3, true),
        bar(e, `${50 + ((i * 17) % 30)}%`, 2),
      ),
    );
  }

  return box(e, { display: "flex", height: "100%", padding: "8px 0" }, rail, entries);
};

const fileUploadSkeleton: Renderer = (e, { width, height }) =>
  box(
    e,
    {
      height: "100%",
      borderRadius: 8,
      border: "2px dashed var(--agd-stroke)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: height * 0.06,
    },
    svg(
      e,
      { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none" },
      e.createSvg("path", {
        d: "M12 16V4m0 0l-4 4m4-4l4 4",
        stroke: "var(--agd-stroke)",
        "stroke-width": "1.5",
      }),
      e.createSvg("path", {
        d: "M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2",
        stroke: "var(--agd-stroke)",
        "stroke-width": "1.5",
      }),
    ),
    bar(e, width * 0.4, 2),
    bar(e, width * 0.25, 2),
  );

const codeBlockSkeleton: Renderer = (e, { height }) => {
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
      gap: 4,
    },
    box(
      e,
      { display: "flex", gap: 3, marginBottom: 4 },
      circle(e, 6),
      circle(e, 6),
      circle(e, 6),
    ),
  );
  for (let i = 0; i < lines; i++) {
    root.appendChild(
      box(
        e,
        { display: "flex", gap: 6, paddingLeft: i > 0 && i < lines - 1 ? 12 : 0 },
        bar(e, `${25 + ((i * 23) % 50)}%`, 2, i === 0),
      ),
    );
  }
  return root;
};

const calendarSkeleton: Renderer = (e, { width, height }) => {
  const cols = 7;
  const rows = 5;
  const cellSz = Math.min((width - 16) / cols, (height - 40) / (rows + 1));

  const grid = box(e, {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: 2,
    padding: "0 4px",
    flex: 1,
  });
  for (let i = 0; i < cols; i++) {
    grid.appendChild(
      box(
        e,
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: cellSz * 0.6,
        },
        bar(e, cellSz * 0.5, 2),
      ),
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
            justifyContent: "center",
          },
          box(e, {
            width: 2,
            height: 2,
            borderRadius: 1,
            background: "var(--agd-bar-strong)",
            opacity: i === 12 ? 1 : 0.3,
          }),
        ),
      ),
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
        padding: "6px 8px",
      },
      label(e, { fontSize: 8, color: "var(--agd-stroke)" }, "‹"),
      bar(e, width * 0.3, 3, true),
      label(e, { fontSize: 8, color: "var(--agd-stroke)" }, "›"),
    ),
    grid,
  );
};

const notificationSkeleton: Renderer = (e, { height }) =>
  box(
    e,
    {
      height: "100%",
      borderRadius: 8,
      border: "1px dashed var(--agd-stroke)",
      background: "var(--agd-fill)",
      display: "flex",
      alignItems: "center",
      padding: "0 10px",
      gap: 8,
    },
    circle(e, Math.min(32, height * 0.55)),
    box(
      e,
      { flex: 1, display: "flex", flexDirection: "column", gap: 3 },
      bar(e, "50%", 3, true),
      bar(e, "75%", 2),
    ),
    bar(e, 30, 2),
  );

const productCardSkeleton: Renderer = (e, { width }) =>
  box(
    e,
    { height: "100%", display: "flex", flexDirection: "column" },
    box(e, {
      height: "50%",
      background: "var(--agd-fill)",
      borderBottom: "1px dashed var(--agd-stroke)",
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
        block(e, Math.min(70, width * 0.3), 26, 4, { background: "var(--agd-bar)" }),
      ),
    ),
  );

const profileSkeleton: Renderer = (e, { width, height }) => {
  const avatarSz = Math.min(48, height * 0.3);
  const stats = box(e, { display: "flex", gap: width * 0.08, marginTop: height * 0.04 });
  for (let i = 0; i < 3; i++) {
    stats.appendChild(
      box(
        e,
        { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
        bar(e, 20, 3, true),
        bar(e, 28, 2),
      ),
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
      gap: height * 0.06,
    },
    circle(e, avatarSz),
    bar(e, width * 0.45, 4, true),
    bar(e, width * 0.3, 2),
    stats,
  );
};

const drawerSkeleton: Renderer = (e, { width, height }) => {
  const panelW = Math.max(width * 0.6, 80);
  const items = Math.max(3, Math.floor(height / 40));
  const panel = box(
    e,
    {
      flex: 1,
      borderLeft: "1px solid var(--agd-stroke)",
      display: "flex",
      flexDirection: "column",
      padding: width * 0.04,
    },
    box(
      e,
      {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: height * 0.06,
      },
      bar(e, panelW * 0.4, 4, true),
      box(e, { width: 12, height: 12, border: "1px solid var(--agd-stroke)", borderRadius: 3 }),
    ),
  );
  for (let i = 0; i < items; i++) {
    panel.appendChild(
      box(e, { padding: "6px 0" }, bar(e, `${50 + ((i * 17) % 35)}%`, 2, i === 0)),
    );
  }
  return box(
    e,
    { height: "100%", display: "flex" },
    box(e, { width: width - panelW, background: "var(--agd-fill)", opacity: 0.3 }),
    panel,
  );
};

const popoverSkeleton: Renderer = (e) =>
  box(
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
        gap: 5,
      },
      bar(e, "70%", 3, true),
      bar(e, "90%", 2),
      bar(e, "60%", 2),
    ),
    box(e, {
      width: 10,
      height: 10,
      background: "var(--agd-fill)",
      border: "1px dashed var(--agd-stroke)",
      borderTop: "none",
      borderLeft: "none",
      transform: "rotate(45deg)",
      marginTop: -6,
    }),
  );

const logoSkeleton: Renderer = (e, { width, height }) => {
  const iconSz = Math.min(height * 0.7, width * 0.3);
  return box(
    e,
    { height: "100%", display: "flex", alignItems: "center", gap: width * 0.08 },
    block(e, iconSz, iconSz, iconSz * 0.25),
    bar(e, width * 0.45, Math.max(4, height * 0.2), true),
  );
};

const faqSkeleton: Renderer = (e, { width, height }) => {
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
          flex: i === 0 ? 2 : 1,
        },
        box(
          e,
          { display: "flex", alignItems: "center", gap: 6 },
          label(e, { fontSize: 9, fontWeight: 700, color: "var(--agd-stroke)" }, "Q"),
          bar(e, width * (0.3 + ((i * 13) % 25) / 100), 3, true),
        ),
        label(e, { fontSize: 8, color: "var(--agd-stroke)" }, i === 0 ? "▼" : "▶"),
      ),
    );
  }
  return root;
};

const gallerySkeleton: Renderer = (e, { width, height }) => {
  const cols = Math.max(2, Math.min(4, Math.floor(width / 120)));
  const rows = Math.max(1, Math.min(3, Math.floor(height / 120)));
  const root = box(e, {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
    gap: 4,
    height: "100%",
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
          overflow: "hidden",
        },
        svg(
          e,
          {
            width: "100%",
            height: "100%",
            viewBox: "0 0 100 100",
            preserveAspectRatio: "none",
            fill: "none",
          },
          e.createSvg("line", {
            x1: "0",
            y1: "0",
            x2: "100",
            y2: "100",
            stroke: "var(--agd-stroke)",
            "stroke-width": "0.5",
          }),
          e.createSvg("line", {
            x1: "100",
            y1: "0",
            x2: "0",
            y2: "100",
            stroke: "var(--agd-stroke)",
            "stroke-width": "0.5",
          }),
        ),
      ),
    );
  }
  return root;
};

const checkboxSkeleton: Renderer = (e, { width, height }) => {
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
      "stroke-width": "1.5",
    }),
    e.createSvg("path", {
      d: `M${sz * 0.25} ${height / 2}l${sz * 0.2} ${sz * 0.2} ${sz * 0.3}-${sz * 0.35}`,
      stroke: "var(--agd-bar)",
      "stroke-width": "1.5",
      fill: "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
};

const radioSkeleton: Renderer = (e, { width, height }) => {
  const r = Math.min(width, height) / 2 - 1;
  return svg(
    e,
    { width: "100%", height: "100%", viewBox: `0 0 ${width} ${height}`, fill: "none" },
    e.createSvg("circle", {
      cx: String(width / 2),
      cy: String(height / 2),
      r: String(r),
      stroke: "var(--agd-stroke)",
      "stroke-width": "1.5",
    }),
    e.createSvg("circle", {
      cx: String(width / 2),
      cy: String(height / 2),
      r: String(r * 0.45),
      fill: "var(--agd-bar)",
    }),
  );
};

const sliderSkeleton: Renderer = (e, { width, height }) => {
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
        position: "relative",
      },
      box(e, {
        width: fillW,
        height: "100%",
        borderRadius: trackH / 2,
        background: "var(--agd-bar)",
      }),
    ),
    box(e, {
      position: "absolute",
      left: fillW - thumbR,
      width: thumbR * 2,
      height: thumbR * 2,
      borderRadius: "50%",
      border: "1.5px solid var(--agd-stroke)",
      background: "var(--agd-fill)",
    }),
  );
};

const datePickerSkeleton: Renderer = (e, { width, height }) => {
  const inputH = Math.min(36, height * 0.15);
  const cols = 7;
  const rows = 4;
  const cellSz = Math.min((width - 16) / cols, (height - inputH - 40) / (rows + 1));

  const grid = box(e, {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: 1,
    padding: "0 4px",
    flex: 1,
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
            background: i === 10 ? "var(--agd-bar)" : "transparent",
          },
          box(
            e,
            {
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
            box(e, {
              width: 1.5,
              height: 1.5,
              borderRadius: 1,
              background: "var(--agd-bar-strong)",
              opacity: i === 10 ? 1 : 0.25,
            }),
          ),
        ),
      ),
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
        justifyContent: "space-between",
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
          "stroke-width": "1",
        }),
        e.createSvg("line", {
          x1: "2",
          y1: "6",
          x2: "14",
          y2: "6",
          stroke: "var(--agd-stroke)",
          "stroke-width": "0.5",
        }),
      ),
    ),
    box(
      e,
      {
        flex: 1,
        borderRadius: 6,
        border: "1px dashed var(--agd-stroke)",
        background: "var(--agd-fill)",
        display: "flex",
        flexDirection: "column",
      },
      box(
        e,
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 6px",
        },
        label(e, { fontSize: 7, color: "var(--agd-stroke)" }, "‹"),
        bar(e, width * 0.25, 2, true),
        label(e, { fontSize: 7, color: "var(--agd-stroke)" }, "›"),
      ),
      grid,
    ),
  );
};

const skeletonSkeleton: Renderer = (e, { height }) =>
  box(
    e,
    {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: height * 0.08,
      padding: 4,
    },
    box(e, { width: "100%", height: height * 0.2, borderRadius: 4, background: "var(--agd-fill)" }),
    box(e, {
      width: "70%",
      height: Math.max(6, height * 0.1),
      borderRadius: 3,
      background: "var(--agd-fill)",
    }),
    box(e, {
      width: "90%",
      height: Math.max(4, height * 0.06),
      borderRadius: 3,
      background: "var(--agd-fill)",
    }),
    box(e, {
      width: "50%",
      height: Math.max(4, height * 0.06),
      borderRadius: 3,
      background: "var(--agd-fill)",
    }),
  );

const chipSkeleton: Renderer = (e, { height }) =>
  box(
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
        gap: 4,
      },
      bar(e, "60%", 2, true),
      box(e, {
        width: Math.max(6, height * 0.3),
        height: Math.max(6, height * 0.3),
        borderRadius: "50%",
        border: "1px solid var(--agd-stroke)",
        flexShrink: 0,
        marginLeft: "auto",
      }),
    ),
  );

const iconSkeleton: Renderer = (e, { width, height }) => {
  const sz = Math.min(width, height);
  return svg(
    e,
    { width: "100%", height: "100%", viewBox: `0 0 ${width} ${height}`, fill: "none" },
    e.createSvg("path", {
      d: `M${width / 2} ${(height - sz) / 2 + sz * 0.1}l${sz * 0.12} ${sz * 0.25} ${sz * 0.28} ${sz * 0.04}-${sz * 0.2} ${sz * 0.2} ${sz * 0.05} ${sz * 0.28}-${sz * 0.25}-${sz * 0.12}-${sz * 0.25} ${sz * 0.12} ${sz * 0.05}-${sz * 0.28}-${sz * 0.2}-${sz * 0.2} ${sz * 0.28}-${sz * 0.04}z`,
      stroke: "var(--agd-stroke)",
      "stroke-width": "1",
      fill: "var(--agd-fill)",
    }),
  );
};

const spinnerSkeleton: Renderer = (e, { width, height }) => {
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
      opacity: ".2",
    }),
    e.createSvg("path", {
      d: `M${width / 2} ${height / 2 - r}a${r} ${r} 0 0 1 ${r} ${r}`,
      stroke: "var(--agd-bar-strong)",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
    }),
  );
};

const featureSkeleton: Renderer = (e, { width, height }) => {
  const iconSz = Math.min(36, height * 0.25, width * 0.12);
  const items = Math.max(1, Math.min(3, Math.floor(height / 80)));
  const root = box(e, {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "space-around",
    padding: 8,
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
          bar(e, `${40 + ((i * 13) % 20)}%`, 3, true),
          bar(e, `${60 + ((i * 17) % 25)}%`, 2),
        ),
      ),
    );
  }
  return root;
};

const teamSkeleton: Renderer = (e, { width, height }) => {
  const cols = Math.max(2, Math.min(4, Math.floor(width / 120)));
  const avatarSz = Math.min(36, height * 0.25);
  const members = box(e, {
    display: "flex",
    gap: width * 0.06,
    justifyContent: "center",
    flex: 1,
    alignItems: "center",
  });
  for (let i = 0; i < cols; i++) {
    members.appendChild(
      box(
        e,
        { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
        circle(e, avatarSz),
        bar(e, width * 0.12, 3, true),
        bar(e, width * 0.08, 2),
      ),
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
      padding: height * 0.06,
    },
    bar(e, width * 0.3, 4, true),
    members,
  );
};

const loginSkeleton: Renderer = (e, { width, height }) => {
  const fields = Math.max(2, Math.min(3, Math.floor(height / 80)));
  const inputs = box(e, {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: height * 0.03,
    marginTop: height * 0.04,
  });
  for (let i = 0; i < fields; i++) {
    inputs.appendChild(
      box(
        e,
        { display: "flex", flexDirection: "column", gap: 3 },
        bar(e, Math.min(60, width * 0.2), 2),
        block(e, "100%", Math.min(32, height * 0.1), 4),
      ),
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
      gap: height * 0.04,
    },
    bar(e, width * 0.5, Math.max(5, height * 0.04), true),
    bar(e, width * 0.35, 2),
    inputs,
    block(e, "100%", Math.min(36, height * 0.12), 6, {
      marginTop: height * 0.03,
      background: "var(--agd-bar)",
    }),
    bar(e, width * 0.4, 2),
  );
};

const contactSkeleton: Renderer = (e, { width, height }) =>
  box(
    e,
    {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      padding: width * 0.04,
      gap: height * 0.03,
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
        block(e, "100%", Math.min(28, height * 0.1), 4),
      ),
      box(
        e,
        { flex: 1, display: "flex", flexDirection: "column", gap: 3 },
        bar(e, 40, 2),
        block(e, "100%", Math.min(28, height * 0.1), 4),
      ),
    ),
    box(
      e,
      { display: "flex", flexDirection: "column", gap: 3 },
      bar(e, 50, 2),
      block(e, "100%", Math.min(28, height * 0.1), 4),
    ),
    box(
      e,
      { display: "flex", flexDirection: "column", gap: 3, flex: 1 },
      bar(e, 60, 2),
      block(e, "100%", "100%", 4),
    ),
    block(e, Math.min(120, width * 0.3), Math.min(30, height * 0.1), 6, {
      alignSelf: "flex-end",
      background: "var(--agd-bar)",
    }),
  );

// --- Skeleton registry ------------------------------------------------------

const SKELETON_RENDERERS: Partial<Record<ComponentType, Renderer>> = {
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
  contact: contactSkeleton,
};

// --- Public API -------------------------------------------------------------

type SkeletonRecord = {
  environment: RuntimeEnvironment;
  type: ComponentType;
  text: string | undefined;
};

/**
 * A skeleton's geometry is a function of its placement size, so the host
 * remembers what it was built from and `updateSkeleton` can repaint it.
 */
const RECORDS = new WeakMap<Element, SkeletonRecord>();

function paint(
  host: HTMLElement,
  record: SkeletonRecord,
  width: number,
  height: number,
): void {
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
      justifyContent: "center",
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
          opacity: 0.5,
        },
        type,
      ),
    );
    return;
  }

  applyStyle(host, {
    width: "100%",
    height: "100%",
    padding: 8,
    position: "relative",
    pointerEvents: "none",
  });
  host.appendChild(renderer(environment, { width, height, text }));
}

/**
 * Build the wireframe skeleton for a placed component. The returned node is the
 * padded host wrapper; hand it back to `updateSkeleton` when the size changes.
 */
export function createSkeleton(
  environment: RuntimeEnvironment,
  type: ComponentType,
  width: number,
  height: number,
  text?: string,
): HTMLElement {
  const host = environment.createElement("div");
  const record: SkeletonRecord = { environment, type, text };
  RECORDS.set(host, record);
  paint(host, record, width, height);
  return host;
}

/** Repaint a skeleton at a new size. No-op for nodes this module did not build. */
export function updateSkeleton(node: Element, width: number, height: number): void {
  const record = RECORDS.get(node);
  if (!record) return;
  paint(node as HTMLElement, record, width, height);
}
