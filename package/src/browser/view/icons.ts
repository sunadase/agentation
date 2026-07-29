// =============================================================================
// Icons
// =============================================================================
//
// Framework-free ports of the SVGs in `src/components/icons.tsx`. Path data,
// viewBoxes and default sizes are copied verbatim: the icons are the product's
// visual signature and any drift shows up as a pixel diff.
//
// Two details differ from the React originals, both forced by the shadow root:
//
//  1. State transitions live in `_icons.scss` instead of a CSS-module import,
//     so a single stylesheet serves every instance.
//  2. `clipPath` ids are per-instance. The originals hardcode ids such as
//     `clip0_2_45`; with several copies in one tree the first definition wins
//     for all of them, which silently clips the wrong icon.
// =============================================================================

import type { RuntimeEnvironment } from "../environment";

export type IconName =
  | "list-sparkle"
  | "pause-play"
  | "layout"
  | "eye"
  | "copy"
  | "send-arrow"
  | "trash-alt"
  | "gear"
  | "xmark-large"
  | "xmark"
  | "close"
  | "check-small"
  | "chevron-left"
  | "chevron-right"
  | "sun"
  | "moon"
  | "trash"
  | "edit"
  | "help"
  | "plus"
  | "checkmark";

export type SendIconState = "idle" | "sending" | "sent" | "failed";

export type IconState = {
  paused?: boolean;
  open?: boolean;
  copied?: boolean;
  tint?: string;
  send?: SendIconState;
};

type SvgSpec = {
  tag: keyof SVGElementTagNameMap;
  attrs?: Record<string, string>;
  /** Marks a switchable state layer, addressed by `setIconState`. */
  layer?: string;
  /** Transition class applied to a state layer. */
  transition?: "state" | "state-fast" | "fade" | "fade-fast";
  children?: readonly SvgSpec[];
};

type IconSpec = {
  size: number;
  viewBox: string;
  /** Wrap children in a clip group, as the exported SVGs do. */
  clip?: boolean;
  children: readonly SvgSpec[];
};

const LAYER_ATTR = "data-ag-icon-layer";
const STATE_ATTR = "data-ag-icon-state";

const STROKE = "currentColor";
const GREEN = "var(--agentation-color-green)";
const RED = "var(--agentation-color-red)";

/** `stroke` + round caps and joins — by far the most common combination. */
function strokePath(d: string, width = "1.5"): SvgSpec {
  return {
    tag: "path",
    attrs: {
      d,
      stroke: STROKE,
      "stroke-width": width,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
  };
}

function circleOutline(color: string): SvgSpec {
  return {
    tag: "path",
    attrs: {
      d: "M12 20C7.58172 20 4 16.4182 4 12C4 7.58172 7.58172 4 12 4C16.4182 4 20 7.58172 20 12C20 16.4182 16.4182 20 12 20Z",
      stroke: color,
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
  };
}

function checkCircle(color: string): readonly SvgSpec[] {
  return [
    circleOutline(color),
    {
      tag: "path",
      attrs: {
        d: "M15 10L11 14.25L9.25 12.25",
        stroke: color,
        "stroke-width": "1.5",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      },
    },
  ];
}

const COPY_GLYPH: readonly SvgSpec[] = [
  {
    tag: "path",
    attrs: {
      d: "M4.75 11.25C4.75 10.4216 5.42157 9.75 6.25 9.75H12.75C13.5784 9.75 14.25 10.4216 14.25 11.25V17.75C14.25 18.5784 13.5784 19.25 12.75 19.25H6.25C5.42157 19.25 4.75 18.5784 4.75 17.75V11.25Z",
      stroke: STROKE,
      "stroke-width": "1.5",
    },
  },
  {
    tag: "path",
    attrs: {
      d: "M17.25 14.25H17.75C18.5784 14.25 19.25 13.5784 19.25 12.75V6.25C19.25 5.42157 18.5784 4.75 17.75 4.75H11.25C10.4216 4.75 9.75 5.42157 9.75 6.25V6.75",
      stroke: STROKE,
      "stroke-width": "1.5",
      "stroke-linecap": "round",
    },
  },
];

const EYE_OPEN: readonly SvgSpec[] = [
  strokePath(
    "M3.91752 12.7539C3.65127 12.2996 3.65037 11.7515 3.9149 11.2962C4.9042 9.59346 7.72688 5.49994 12 5.49994C16.2731 5.49994 19.0958 9.59346 20.0851 11.2962C20.3496 11.7515 20.3487 12.2996 20.0825 12.7539C19.0908 14.4459 16.2694 18.4999 12 18.4999C7.73064 18.4999 4.90918 14.4459 3.91752 12.7539Z",
  ),
  strokePath(
    "M12 14.8261C13.5608 14.8261 14.8261 13.5608 14.8261 12C14.8261 10.4392 13.5608 9.17392 12 9.17392C10.4392 9.17392 9.17391 10.4392 9.17391 12C9.17391 13.5608 10.4392 14.8261 12 14.8261Z",
  ),
];

const EYE_CLOSED: readonly SvgSpec[] = [
  {
    tag: "path",
    attrs: {
      d: "M18.6025 9.28503C18.9174 8.9701 19.4364 8.99481 19.7015 9.35271C20.1484 9.95606 20.4943 10.507 20.7342 10.9199C21.134 11.6086 21.1329 12.4454 20.7303 13.1328C20.2144 14.013 19.2151 15.5225 17.7723 16.8193C16.3293 18.1162 14.3852 19.2497 12.0008 19.25C11.4192 19.25 10.8638 19.1823 10.3355 19.0613C9.77966 18.934 9.63498 18.2525 10.0382 17.8493C10.2412 17.6463 10.5374 17.573 10.8188 17.6302C11.1993 17.7076 11.5935 17.75 12.0008 17.75C13.8848 17.7497 15.4867 16.8568 16.7693 15.7041C18.0522 14.5511 18.9606 13.1867 19.4363 12.375C19.5656 12.1543 19.5659 11.8943 19.4373 11.6729C19.2235 11.3049 18.921 10.8242 18.5364 10.3003C18.3085 9.98991 18.3302 9.5573 18.6025 9.28503ZM12.0008 4.75C12.5814 4.75006 13.1358 4.81803 13.6632 4.93953C14.2182 5.06741 14.362 5.74812 13.9593 6.15091C13.7558 6.35435 13.4589 6.42748 13.1771 6.36984C12.7983 6.29239 12.4061 6.25006 12.0008 6.25C10.1167 6.25 8.51415 7.15145 7.23028 8.31543C5.94678 9.47919 5.03918 10.8555 4.56426 11.6729C4.43551 11.8945 4.43582 12.1542 4.56524 12.375C4.77587 12.7343 5.07189 13.2012 5.44718 13.7105C5.67623 14.0213 5.65493 14.4552 5.38193 14.7282C5.0671 15.0431 4.54833 15.0189 4.28292 14.6614C3.84652 14.0736 3.50813 13.5369 3.27129 13.1328C2.86831 12.4451 2.86717 11.6088 3.26739 10.9199C3.78185 10.0345 4.77959 8.51239 6.22247 7.2041C7.66547 5.89584 9.61202 4.75 12.0008 4.75Z",
      fill: STROKE,
    },
  },
  {
    tag: "path",
    attrs: {
      d: "M5 19L19 5",
      stroke: STROKE,
      "stroke-width": "1.5",
      "stroke-linecap": "round",
    },
  },
];

/**
 * Outer glyph shared by the 16 px `IconTrashAlt` and the 24 px `IconTrash`. The
 * two differ only in the trailing tick's rounding, so each tail is spelled out.
 */
const TRASH_HEAD =
  "M13.5 4C14.7426 4 15.75 5.00736 15.75 6.25V7H18.5C18.9142 7 19.25 7.33579 19.25 7.75C19.25 8.16421 18.9142 8.5 18.5 8.5H17.9678L17.6328 16.2217C17.61 16.7475 17.5912 17.1861 17.5469 17.543C17.5015 17.9087 17.4225 18.2506 17.2461 18.5723C16.9747 19.0671 16.5579 19.4671 16.0518 19.7168C15.7227 19.8791 15.3772 19.9422 15.0098 19.9717C14.6514 20.0004 14.2126 20 13.6865 20H10.3135C9.78735 20 9.34856 20.0004 8.99023 19.9717C8.62278 19.9422 8.27729 19.8791 7.94824 19.7168C7.44205 19.4671 7.02532 19.0671 6.75391 18.5723C6.57751 18.2506 6.49853 17.9087 6.45312 17.543C6.40883 17.1861 6.39005 16.7475 6.36719 16.2217L6.03223 8.5H5.5C5.08579 8.5 4.75 8.16421 4.75 7.75C4.75 7.33579 5.08579 7 5.5 7H8.25V6.25C8.25 5.00736 9.25736 4 10.5 4H13.5ZM7.86621 16.1562C7.89013 16.7063 7.90624 17.0751 7.94141 17.3584C7.97545 17.6326 8.02151 17.7644 8.06934 17.8516C8.19271 18.0763 8.38239 18.2577 8.6123 18.3711C8.70153 18.4151 8.83504 18.4545 9.11035 18.4766C9.39482 18.4994 9.76335 18.5 10.3135 18.5H13.6865C14.2367 18.5 14.6052 18.4994 14.8896 18.4766C15.165 18.4545 15.2985 18.4151 15.3877 18.3711C15.6176 18.2577 15.8073 18.0763 15.9307 17.8516C15.9785 17.7644 16.0245 17.6326 16.0586 17.3584C16.0938 17.0751 16.1099 16.7063 16.1338 16.1562L16.4668 8.5H7.5332L7.86621 16.1562ZM9.97656 10.75C10.3906 10.7371 10.7371 11.0626 10.75 11.4766L10.875 15.4766C10.8879 15.8906 10.5624 16.2371 10.1484 16.25C9.73443 16.2629 9.38794 15.9374 9.375 15.5234L9.25 11.5234C9.23706 11.1094 9.56255 10.7629 9.97656 10.75Z";

const TRASH_ALT_TAIL =
  "M14.0244 10.75C14.4384 10.7635 14.7635 11.1105 14.75 11.5244L14.6201 15.5244C14.6066 15.9384 14.2596 16.2634 13.8457 16.25C13.4317 16.2365 13.1067 15.8896 13.1201 15.4756L13.251 11.4756C13.2645 11.0617 13.6105 10.7366 14.0244 10.75ZM10.5 5.5C10.0858 5.5 9.75 5.83579 9.75 6.25V7H14.25V6.25C14.25 5.83579 13.9142 5.5 13.5 5.5H10.5Z";

const TRASH_TAIL =
  "M14.0244 10.75C14.4383 10.7635 14.7635 11.1105 14.75 11.5244L14.6201 15.5244C14.6066 15.9384 14.2596 16.2634 13.8457 16.25C13.4317 16.2365 13.1067 15.8896 13.1201 15.4756L13.251 11.4756C13.2645 11.0617 13.6105 10.7366 14.0244 10.75ZM10.5 5.5C10.0858 5.5 9.75 5.83579 9.75 6.25V7H14.25V6.25C14.25 5.83579 13.9142 5.5 13.5 5.5H10.5Z";

const SUN_RAYS: readonly string[] = [
  "M10 3.9585V5.05698",
  "M10 14.9429V16.0414",
  "M5.7269 5.72656L6.50682 6.50649",
  "M13.4932 13.4932L14.2731 14.2731",
  "M3.95834 10H5.05683",
  "M14.9432 10H16.0417",
  "M5.7269 14.2731L6.50682 13.4932",
  "M13.4932 6.50649L14.2731 5.72656",
];

const ICONS: Record<IconName, IconSpec> = {
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
          "stroke-linejoin": "round",
        },
      },
    ],
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
              "stroke-linecap": "round",
            },
          },
          {
            tag: "path",
            attrs: {
              d: "M16 18L16 6",
              stroke: STROKE,
              "stroke-width": "1.5",
              "stroke-linecap": "round",
            },
          },
        ],
      },
      {
        tag: "path",
        layer: "play",
        transition: "fade-fast",
        attrs: {
          d: "M17.75 10.701C18.75 11.2783 18.75 12.7217 17.75 13.299L8.75 18.4952C7.75 19.0725 6.5 18.3509 6.5 17.1962L6.5 6.80384C6.5 5.64914 7.75 4.92746 8.75 5.50481L17.75 10.701Z",
          stroke: STROKE,
          "stroke-width": "1.5",
        },
      },
    ],
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
          "stroke-width": "1.5",
        },
      },
      {
        tag: "line",
        attrs: {
          x1: "3",
          y1: "9",
          x2: "21",
          y2: "9",
          stroke: STROKE,
          "stroke-width": "1.5",
        },
      },
      {
        tag: "line",
        attrs: {
          x1: "9",
          y1: "9",
          x2: "9",
          y2: "21",
          stroke: STROKE,
          "stroke-width": "1.5",
        },
      },
    ],
  },
  eye: {
    size: 24,
    viewBox: "0 0 24 24",
    children: [
      { tag: "g", layer: "open", transition: "fade", children: EYE_OPEN },
      { tag: "g", layer: "closed", transition: "fade", children: EYE_CLOSED },
    ],
  },
  copy: {
    size: 24,
    viewBox: "0 0 24 24",
    children: [
      { tag: "g", layer: "copy", transition: "state", children: COPY_GLYPH },
      { tag: "g", layer: "copied", transition: "state", children: checkCircle(GREEN) },
    ],
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
            "M9.875 14.125L12.3506 19.6951C12.7184 20.5227 13.9091 20.4741 14.2083 19.6193L18.8139 6.46032C19.0907 5.6695 18.3305 4.90933 17.5397 5.18611L4.38072 9.79174C3.52589 10.0909 3.47731 11.2816 4.30494 11.6494L9.875 14.125ZM9.875 14.125L13.375 10.625",
          ),
        ],
      },
      {
        tag: "g",
        layer: "sent",
        transition: "state-fast",
        children: checkCircle(GREEN),
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
              "stroke-linecap": "round",
            },
          },
          {
            tag: "circle",
            attrs: {
              cx: "12",
              cy: "15",
              r: "0.5",
              fill: RED,
              stroke: RED,
              "stroke-width": "1",
            },
          },
        ],
      },
    ],
  },
  "trash-alt": {
    size: 16,
    viewBox: "0 0 24 24",
    children: [{ tag: "path", attrs: { d: `${TRASH_HEAD} ${TRASH_ALT_TAIL}`, fill: STROKE } }],
  },
  gear: {
    size: 16,
    viewBox: "0 0 24 24",
    children: [
      strokePath(
        "M10.6504 5.81117C10.9939 4.39628 13.0061 4.39628 13.3496 5.81117C13.5715 6.72517 14.6187 7.15891 15.4219 6.66952C16.6652 5.91193 18.0881 7.33479 17.3305 8.57815C16.8411 9.38134 17.2748 10.4285 18.1888 10.6504C19.6037 10.9939 19.6037 13.0061 18.1888 13.3496C17.2748 13.5715 16.8411 14.6187 17.3305 15.4219C18.0881 16.6652 16.6652 18.0881 15.4219 17.3305C14.6187 16.8411 13.5715 17.2748 13.3496 18.1888C13.0061 19.6037 10.9939 19.6037 10.6504 18.1888C10.4285 17.2748 9.38135 16.8411 8.57815 17.3305C7.33479 18.0881 5.91193 16.6652 6.66952 15.4219C7.15891 14.6187 6.72517 13.5715 5.81117 13.3496C4.39628 13.0061 4.39628 10.9939 5.81117 10.6504C6.72517 10.4285 7.15891 9.38134 6.66952 8.57815C5.91193 7.33479 7.33479 5.91192 8.57815 6.66952C9.38135 7.15891 10.4285 6.72517 10.6504 5.81117Z",
      ),
      {
        tag: "circle",
        attrs: { cx: "12", cy: "12", r: "2.5", stroke: STROKE, "stroke-width": "1.5" },
      },
    ],
  },
  "xmark-large": {
    size: 24,
    viewBox: "0 0 24 24",
    children: [
      {
        tag: "path",
        attrs: {
          d: "M16.7198 6.21973C17.0127 5.92683 17.4874 5.92683 17.7803 6.21973C18.0732 6.51262 18.0732 6.9874 17.7803 7.28027L13.0606 12L17.7803 16.7197C18.0732 17.0126 18.0732 17.4874 17.7803 17.7803C17.4875 18.0731 17.0127 18.0731 16.7198 17.7803L12.0001 13.0605L7.28033 17.7803C6.98746 18.0731 6.51268 18.0731 6.21979 17.7803C5.92689 17.4874 5.92689 17.0126 6.21979 16.7197L10.9395 12L6.21979 7.28027C5.92689 6.98738 5.92689 6.51262 6.21979 6.21973C6.51268 5.92683 6.98744 5.92683 7.28033 6.21973L12.0001 10.9395L16.7198 6.21973Z",
          fill: STROKE,
        },
      },
    ],
  },
  xmark: {
    size: 16,
    viewBox: "0 0 24 24",
    clip: true,
    children: [strokePath("M16.25 16.25L7.75 7.75"), strokePath("M7.75 16.25L16.25 7.75")],
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
          "stroke-linecap": "round",
        },
      },
    ],
  },
  "check-small": {
    size: 14,
    viewBox: "0 0 14 14",
    children: [strokePath("M3.9375 7L6.125 9.1875L10.5 4.8125")],
  },
  "chevron-left": {
    size: 16,
    viewBox: "0 0 16 16",
    children: [strokePath("M8.5 3.5L4 8L8.5 12.5")],
  },
  "chevron-right": {
    size: 16,
    viewBox: "0 0 16 16",
    children: [strokePath("M8.5 11.5L12 8L8.5 4.5")],
  },
  sun: {
    size: 16,
    viewBox: "0 0 20 20",
    children: [
      strokePath(
        "M9.99999 12.7082C11.4958 12.7082 12.7083 11.4956 12.7083 9.99984C12.7083 8.50407 11.4958 7.2915 9.99999 7.2915C8.50422 7.2915 7.29166 8.50407 7.29166 9.99984C7.29166 11.4956 8.50422 12.7082 9.99999 12.7082Z",
        "1.25",
      ),
      ...SUN_RAYS.map((d) => strokePath(d, "1.25")),
    ],
  },
  moon: {
    size: 16,
    viewBox: "0 0 20 20",
    children: [
      strokePath(
        "M15.5 10.4955C15.4037 11.5379 15.0124 12.5314 14.3721 13.3596C13.7317 14.1878 12.8688 14.8165 11.8841 15.1722C10.8995 15.5278 9.83397 15.5957 8.81217 15.3679C7.79038 15.1401 6.8546 14.6259 6.11434 13.8857C5.37408 13.1454 4.85995 12.2096 4.63211 11.1878C4.40427 10.166 4.47215 9.10048 4.82781 8.11585C5.18346 7.13123 5.81218 6.26825 6.64039 5.62791C7.4686 4.98756 8.46206 4.59634 9.5045 4.5C8.89418 5.32569 8.60049 6.34302 8.67685 7.36695C8.75321 8.39087 9.19454 9.35339 9.92058 10.0794C10.6466 10.8055 11.6091 11.2468 12.6331 11.3231C13.657 11.3995 14.6743 11.1058 15.5 10.4955Z",
        "1.13793",
      ),
    ],
  },
  trash: {
    size: 24,
    viewBox: "0 0 24 24",
    children: [{ tag: "path", attrs: { d: `${TRASH_HEAD} ${TRASH_TAIL}`, fill: STROKE } }],
  },
  edit: {
    size: 16,
    viewBox: "0 0 16 16",
    children: [
      strokePath(
        "M11.3799 6.9572L9.05645 4.63375M11.3799 6.9572L6.74949 11.5699C6.61925 11.6996 6.45577 11.791 6.277 11.8339L4.29549 12.3092C3.93194 12.3964 3.60478 12.0683 3.69297 11.705L4.16585 9.75693C4.20893 9.57947 4.29978 9.4172 4.42854 9.28771L9.05645 4.63375M11.3799 6.9572L12.3455 5.98759C12.9839 5.34655 12.9839 4.31002 12.3455 3.66897C11.7033 3.02415 10.6594 3.02415 10.0172 3.66897L9.06126 4.62892L9.05645 4.63375",
        "0.9",
      ),
    ],
  },
  help: {
    size: 20,
    viewBox: "0 0 20 20",
    children: [
      {
        tag: "circle",
        attrs: { cx: "10", cy: "10", r: "5.375", stroke: STROKE, "stroke-width": "1.25" },
      },
      strokePath(
        "M8.5 8.5C8.73 7.85 9.31 7.49 10 7.5C10.86 7.51 11.5 8.13 11.5 9C11.5 10.08 10 10.5 10 10.5V10.75",
        "1.25",
      ),
      { tag: "circle", attrs: { cx: "10", cy: "12.625", r: "0.625", fill: STROKE } },
    ],
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
          "stroke-linecap": "round",
        },
      },
    ],
  },
  checkmark: {
    size: 16,
    viewBox: "0 0 24 24",
    clip: true,
    children: [strokePath("M16.25 8.75L10 15.25L7.25 12.25")],
  },
};

const TRANSITION_CLASS: Record<NonNullable<SvgSpec["transition"]>, string> = {
  state: "ag-icon-state",
  "state-fast": "ag-icon-state-fast",
  fade: "ag-icon-fade",
  "fade-fast": "ag-icon-fade-fast",
};

/** Initial layer visibility, matching each React component's default props. */
const INITIAL_LAYERS: Partial<Record<IconName, IconState>> = {
  "pause-play": { paused: false },
  eye: { open: true },
  copy: { copied: false },
  "send-arrow": { send: "idle" },
};

function build(environment: RuntimeEnvironment, spec: SvgSpec, parent: SVGElement): void {
  const node = environment.createSvg(spec.tag, spec.attrs);
  if (spec.transition) node.classList.add(TRANSITION_CLASS[spec.transition]);
  if (spec.layer) node.setAttribute(LAYER_ATTR, spec.layer);
  for (const child of spec.children ?? []) build(environment, child, node);
  parent.append(node);
}

export function createIcon(
  environment: RuntimeEnvironment,
  name: IconName,
  size?: number,
): SVGSVGElement {
  const spec = ICONS[name];
  const resolved = String(size ?? spec.size);
  const svg = environment.createSvg("svg", {
    width: resolved,
    height: resolved,
    viewBox: spec.viewBox,
    fill: "none",
    // Icon buttons always carry their own accessible label, so the glyph itself
    // stays out of the accessibility tree and out of the tab order.
    "aria-hidden": "true",
    focusable: "false",
  });
  svg.dataset.agIcon = name;

  if (spec.clip) {
    const clipId = environment.randomId("agicon");
    const group = environment.createSvg("g", { "clip-path": `url(#${clipId})` });
    for (const child of spec.children) build(environment, child, group);
    const clipPath = environment.createSvg("clipPath", { id: clipId });
    clipPath.append(
      environment.createSvg("rect", { width: "24", height: "24", fill: "white" }),
    );
    const defs = environment.createSvg("defs");
    defs.append(clipPath);
    svg.append(group, defs);
  } else {
    for (const child of spec.children) build(environment, child, svg);
  }

  const initial = INITIAL_LAYERS[name];
  if (initial) setIconState(svg, initial);
  return svg;
}

function show(layer: SVGElement, visible: boolean, scaled: boolean): void {
  layer.classList.toggle("ag-icon-visible", visible && !scaled);
  layer.classList.toggle("ag-icon-visible-scaled", visible && scaled);
  layer.classList.toggle("ag-icon-hidden", !visible && !scaled);
  layer.classList.toggle("ag-icon-hidden-scaled", !visible && scaled);
  layer.classList.remove("ag-icon-sending");
}

function layerOf(node: SVGSVGElement, name: string): SVGElement | null {
  return node.querySelector<SVGElement>(`[${LAYER_ATTR}="${name}"]`);
}

/**
 * Flip a stateful icon between its layers. Cheap no-op when the requested state
 * already matches, so callers may pass it on every model update.
 */
export function setIconState(node: SVGSVGElement, state: IconState): void {
  const name = node.dataset.agIcon as IconName | undefined;
  if (!name) return;

  const signature = `${state.paused ?? ""}|${state.open ?? ""}|${state.copied ?? ""}|${state.tint ?? ""}|${state.send ?? ""}`;
  if (node.getAttribute(STATE_ATTR) === signature) return;
  node.setAttribute(STATE_ATTR, signature);

  if (name === "pause-play" && state.paused !== undefined) {
    const pause = layerOf(node, "pause");
    const play = layerOf(node, "play");
    if (pause) show(pause, !state.paused, false);
    if (play) show(play, state.paused, false);
    return;
  }

  if (name === "eye" && state.open !== undefined) {
    const open = layerOf(node, "open");
    const closed = layerOf(node, "closed");
    if (open) show(open, state.open, false);
    if (closed) show(closed, !state.open, false);
    return;
  }

  if (name === "copy") {
    if (state.copied !== undefined) {
      const copy = layerOf(node, "copy");
      const copied = layerOf(node, "copied");
      if (copy) show(copy, !state.copied, true);
      if (copied) show(copied, state.copied, true);
    }
    // The original tinted the whole SVG inline so `currentColor` strokes follow
    // the toolbar accent without a stylesheet round-trip.
    node.style.color = state.tint ?? "";
    node.style.transition = state.tint ? "color 0.3s ease" : "";
    return;
  }

  if (name === "send-arrow" && state.send !== undefined) {
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
