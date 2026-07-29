// =============================================================================
// Layout Mode Geometry
// =============================================================================
//
// Pure rect arithmetic shared by placement editing and page rearrangement.
// Extracted verbatim from the original React overlays so that snapping,
// resizing and nudging behave identically in the native runtime — the
// thresholds below are load-bearing UX, not tunables.
// =============================================================================

export type Box = { x: number; y: number; width: number; height: number };

export type Guide = { axis: "x" | "y"; pos: number };

export type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** Handle order the original overlays render, clockwise from top-left. */
export const HANDLE_DIRECTIONS: readonly HandleDir[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

/** Smallest width/height a placement or captured section may be resized to. */
export const MIN_SIZE = 24;

/** Distance within which an edge or centre line latches onto a candidate. */
export const SNAP_THRESHOLD = 5;

export type SnapEdges = {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
};

export type SnapResult = { dx: number; dy: number; guides: Guide[] };

/**
 * Snap `rect` against `targets`, returning the correction delta plus the guide
 * lines to draw at the snapped position.
 *
 * `targets` is already filtered by the caller: exclude the rects being dragged,
 * then append any cross-overlay rects, preserving that order — the "nearest
 * wins" tie-break depends on it.
 *
 * Omitting `activeEdges` snaps the whole rect (drag-move): left, right and
 * centre-x all seek a match, likewise top, bottom and centre-y. Supplying it
 * restricts the seeking edges to those being dragged (resize).
 */
export function computeSnap(
  rect: Box,
  targets: readonly Box[],
  activeEdges?: SnapEdges,
): SnapResult {
  let bestDx = Infinity;
  let bestDy = Infinity;

  const mL = rect.x, mR = rect.x + rect.width, mCx = rect.x + rect.width / 2;
  const mT = rect.y, mB = rect.y + rect.height, mCy = rect.y + rect.height / 2;

  const checkAll = !activeEdges;
  const xFroms = checkAll ? [mL, mR, mCx] : [
    ...(activeEdges.left ? [mL] : []),
    ...(activeEdges.right ? [mR] : []),
  ];
  const yFroms = checkAll ? [mT, mB, mCy] : [
    ...(activeEdges.top ? [mT] : []),
    ...(activeEdges.bottom ? [mB] : []),
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

  // Collect guide lines at snapped positions
  const guides: Guide[] = [];
  const seen = new Set<string>();
  const sL = mL + dx, sR = mR + dx, sCx = mCx + dx;
  const sT = mT + dy, sB = mB + dy, sCy = mCy + dy;

  for (const o of targets) {
    const oL = o.x, oR = o.x + o.width, oCx = o.x + o.width / 2;
    const oT = o.y, oB = o.y + o.height, oCy = o.y + o.height / 2;

    for (const xPos of [oL, oCx, oR]) {
      for (const sx of [sL, sCx, sR]) {
        if (Math.abs(sx - xPos) < 0.5) {
          const key = `x:${Math.round(xPos)}`;
          if (!seen.has(key)) { seen.add(key); guides.push({ axis: "x", pos: xPos }); }
        }
      }
    }
    for (const yPos of [oT, oCy, oB]) {
      for (const sy of [sT, sCy, sB]) {
        if (Math.abs(sy - yPos) < 0.5) {
          const key = `y:${Math.round(yPos)}`;
          if (!seen.has(key)) { seen.add(key); guides.push({ axis: "y", pos: yPos }); }
        }
      }
    }
  }

  return { dx, dy, guides };
}

/** Translate `rect` by its snap delta — the drag-move case. */
export function snapMovedRect(
  rect: Box,
  targets: readonly Box[],
): { rect: Box; guides: Guide[] } {
  const { dx, dy, guides } = computeSnap(rect, targets);
  return {
    rect: { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height },
    guides,
  };
}

/** Which edges a resize handle moves. */
export function edgesForHandle(dir: HandleDir): SnapEdges {
  return {
    left: dir.includes("w"),
    right: dir.includes("e"),
    top: dir.includes("n"),
    bottom: dir.includes("s"),
  };
}

/**
 * Resize `start` by a pointer delta for one of the eight handles. West/north
 * handles keep the opposite edge pinned, so hitting MIN_SIZE stops the origin
 * from travelling further.
 */
export function resizeRect(start: Box, dir: HandleDir, dx: number, dy: number): Box {
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

/**
 * Shift-constrained resize: force `resized` back onto `aspectRatio`
 * (`start.width / start.height`). On a corner the axis the pointer moved
 * furthest along wins; on an edge the dragged axis drives the other.
 */
export function constrainAspectRatio(
  resized: Box,
  start: Box,
  dir: HandleDir,
  aspectRatio: number,
): Box {
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

/**
 * Fold a snap delta into a rect being resized: the trailing edge grows or
 * shrinks rather than the whole rect sliding.
 */
export function applyResizeSnap(
  rect: Box,
  snap: Pick<SnapResult, "dx" | "dy">,
  activeEdges: SnapEdges,
): Box {
  let { x: nx, y: ny, width: nw, height: nh } = rect;

  if (snap.dx !== 0) {
    if (activeEdges.right) nw += snap.dx;
    else if (activeEdges.left) { nx += snap.dx; nw -= snap.dx; }
  }
  if (snap.dy !== 0) {
    if (activeEdges.bottom) nh += snap.dy;
    else if (activeEdges.top) { ny += snap.dy; nh -= snap.dy; }
  }

  return { x: nx, y: ny, width: nw, height: nh };
}

/** Keep a rect's origin inside the page — size is deliberately untouched. */
export function clampToOrigin(box: Box): Box {
  return {
    x: Math.max(0, box.x),
    y: Math.max(0, box.y),
    width: box.width,
    height: box.height,
  };
}
