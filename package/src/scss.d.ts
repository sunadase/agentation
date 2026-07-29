// Type declarations for SCSS modules
declare module "*.shadow.scss" {
  /** Compiled CSS text, injected into a shadow root by the caller. */
  const css: string;
  export default css;
}

declare module "*.module.scss" {
  const classes: { [key: string]: string };
  export default classes;
}

declare module "*.scss" {
  const content: { [key: string]: string };
  export default content;
}
