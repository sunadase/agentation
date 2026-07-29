// =============================================================================
// Copy and submit
// =============================================================================
//
// Copy produces the markdown report, hands it to `onCopy` and writes it to the
// real clipboard. Submit is a different operation: it never touches the
// clipboard, it reaches the protocol server's `/sessions/:id/action` route and
// the configured webhook, and it reports the outcome on the toolbar.
//
// The clipboard is asserted two ways. Every engine proves the *write* happened
// by the absence of a recoverable `clipboard` error — the runtime awaits the real
// `navigator.clipboard.writeText`, so a rejection would surface there. Chromium
// additionally reads the clipboard back, because it is the only engine where the
// read permission can be granted from a test.
// =============================================================================

import { expect, test } from "@playwright/test";
import {
  REACT_APP,
  SHORTCUT,
  activate,
  annotate,
  calls,
  harness,
  open,
  protocolRequests,
  requestOutput,
  resetProtocol,
  webhookEvent,
} from "./support";

test.beforeEach(async ({ page }) => {
  await resetProtocol(page);
});

test("copy hands the markdown report to onCopy and emits a copy event", async ({
  page,
}) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  await annotate(view, "#page-card-title", "tighten this heading");

  await view.control(SHORTCUT.copy).click();

  const copied = await calls(page, "onCopy");
  expect(copied).toHaveLength(1);
  const markdown = copied[0].output ?? "";
  // The report names the route, numbers the annotation and carries the comment.
  expect(markdown).toContain("## Page Feedback: /browser.html");
  expect(markdown).toContain("### 1. ");
  expect(markdown).toContain("tighten this heading");

  const state = await harness(page);
  // The cancelable `copy` event carries exactly the same bytes.
  expect(state.events.filter((event) => event.type === "copy")).toMatchObject([
    { type: "copy", output: markdown },
  ]);
  // A real clipboard write happened: a rejection would have emitted this.
  expect(
    state.events.filter(
      (event) => event.type === "error" && event.operation === "clipboard",
    ),
  ).toEqual([]);

  // The toolbar acknowledges the copy.
  await expect(view.control(SHORTCUT.copy)).toHaveAttribute("data-active", "true");
  await expect(view.liveStatus).toHaveText("Copied");
});

test("copy writes the report to the real clipboard", async ({ browserName, page }) => {
  // Chromium is the only engine where clipboard *read* can be granted, so it is
  // the only place the write can be verified by reading it back. The other
  // engines assert the write through the absence of a `clipboard` error above.
  test.skip(
    browserName !== "chromium",
    "clipboard-read cannot be granted in Firefox or WebKit",
  );

  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  await annotate(view, "#page-card-title", "clipboard payload");

  await view.control(SHORTCUT.copy).click();
  await expect(view.liveStatus).toHaveText("Copied");

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("clipboard payload");
  expect(clipboard).toBe((await calls(page, "onCopy"))[0].output);
});

test("copyToClipboard:false still reports the output without touching the clipboard", async ({
  page,
}) => {
  const view = await open(page, REACT_APP, "browser.html", { clipboard: false });
  await activate(view);
  await annotate(view, "#page-heading", "no clipboard please");

  await view.control(SHORTCUT.copy).click();

  expect((await calls(page, "onCopy"))[0].output).toContain("no clipboard please");
  const state = await harness(page);
  expect(
    state.events.filter(
      (event) => event.type === "error" && event.operation === "clipboard",
    ),
  ).toEqual([]);
});

test("copy reports nothing to copy when there is no output", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);

  // With no annotations the control is disabled, so the reachable route to the
  // empty-output branch is the keyboard shortcut.
  await expect(view.control(SHORTCUT.copy)).toBeDisabled();
  await page.keyboard.press("c");

  await expect(view.liveStatus).toHaveText("Nothing to copy");
  expect(await calls(page, "onCopy")).toHaveLength(0);
});

test("submit reaches the protocol server, the webhook and onSubmit", async ({
  page,
}) => {
  const view = await open(page, REACT_APP, "browser.html", {
    endpoint: true,
    webhook: true,
    submit: true,
  });
  // The endpoint creates a session before anything is submitted.
  await expect
    .poll(async () => (await calls(page, "onSessionCreated")).length)
    .toBe(1);

  await activate(view);
  await annotate(view, "#page-card-title", "ship this");

  await view.control(SHORTCUT.send).click();
  await expect(view.liveStatus).toHaveText("Sent");

  const submitted = await calls(page, "onSubmit");
  expect(submitted).toHaveLength(1);
  expect(submitted[0].output).toContain("ship this");

  const requests = await protocolRequests(page);
  const action = requests.filter((request) =>
    /^\/sessions\/[^/]+\/action$/.test(request.path),
  );
  expect(action).toHaveLength(1);
  expect(requestOutput(action[0])).toContain("ship this");

  const webhooks = requests.filter((request) => request.path === "/webhook");
  // One automatic delivery for the add, one forced delivery for the submit.
  expect(webhooks.map(webhookEvent)).toEqual(["annotation.add", "submit"]);

  // Submit must not write the clipboard.
  expect(await calls(page, "onCopy")).toHaveLength(0);
});

test("annotation mutations are delivered to the webhook automatically", async ({
  page,
}) => {
  const view = await open(page, REACT_APP, "browser.html", { webhook: true });
  await activate(view);
  await annotate(view, "#page-heading", "first");

  await view.markers.first().click();
  await expect(view.popupTextarea).toHaveValue("first");
  await view.popupTextarea.press("ControlOrMeta+a");
  await view.popupTextarea.pressSequentially("second");
  await view.popupSubmit.click();
  await expect(view.popup).toBeHidden();

  await view.control(SHORTCUT.clear).click();
  await expect(view.markers).toHaveCount(0);

  await expect
    .poll(async () => {
      const requests = await protocolRequests(page);
      return requests
        .filter((request) => request.path === "/webhook")
        .map(webhookEvent);
    })
    .toEqual(["annotation.add", "annotation.update", "annotations.clear"]);
});

test("a failing webhook is reported but never rolls back local state", async ({
  page,
}) => {
  // A syntactically valid http(s) URL that nothing is listening on: the delivery
  // must fail, be reported as recoverable, and leave the annotation in place.
  const view = await open(page, REACT_APP, "browser.html", {
    webhookUrl: "http://127.0.0.1:1/webhook",
  });
  await activate(view);
  await annotate(view, "#page-heading", "kept locally");

  await expect
    .poll(async () => {
      const state = await harness(page);
      return state.events.filter(
        (event) => event.type === "error" && event.operation === "webhook",
      ).length;
    })
    .toBeGreaterThan(0);

  const state = await harness(page);
  expect(
    state.events.filter(
      (event) => event.type === "error" && event.operation === "webhook",
    )[0].message,
  ).toBe("Webhook delivery failed");
  // Local state is untouched.
  await expect(view.markers).toHaveCount(1);
  expect(await calls(page, "onAnnotationAdd")).toHaveLength(1);
});

test("submit is unavailable with no endpoint, webhook or onSubmit", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  await annotate(view, "#page-heading", "nowhere to send");

  // The Send slot collapses to zero width when no destination exists, so the
  // control is disabled and the shortcut has nothing to reach.
  await expect(view.control(SHORTCUT.send)).toBeDisabled();
  await page.keyboard.press("s");

  expect(await calls(page, "onSubmit")).toHaveLength(0);
  expect(
    (await protocolRequests(page)).filter((request) =>
      request.path.endsWith("/action"),
    ),
  ).toEqual([]);
  await expect(view.liveStatus).toHaveText("");
});
