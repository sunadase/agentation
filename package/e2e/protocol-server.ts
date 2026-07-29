// =============================================================================
// Deterministic Agentation protocol server
// =============================================================================
//
// Implements exactly the routes `src/utils/sync.ts` and `src/browser/sync.ts`
// call, plus the webhook target and a `/__e2e/*` control surface the specs use
// to script network conditions. In-memory state, monotonic ids, no dependencies:
// run it with `node e2e/protocol-server.ts` (Node strips the types).
//
// Routes the runtime calls:
//   GET    /health
//   GET    /sessions
//   POST   /sessions                       { url }
//   GET    /sessions/:id
//   POST   /sessions/:id/annotations       <annotation>
//   PATCH  /annotations/:id                <partial annotation>
//   DELETE /annotations/:id
//   POST   /sessions/:id/action            { output }
//   GET    /sessions/:id/events            (server-sent events)
//   POST   /webhook                        <webhook payload>
//
// Control surface for the specs:
//   POST /__e2e/reset
//   GET  /__e2e/requests
//   POST /__e2e/network                    { online: boolean }
//   POST /__e2e/sessions/:id/expire
//   POST /__e2e/annotations/:id/resolve
// =============================================================================

import * as http from "node:http";

type Json = Record<string, unknown>;

type StoredSession = {
  id: string;
  url: string;
  status: "active" | "approved" | "closed";
  createdAt: string;
  updatedAt: string;
  /** Expired sessions answer 404 so the stale-id recovery path is reachable. */
  expired: boolean;
};

type StoredAnnotation = Json & { id: string; sessionId: string };

type RequestLogEntry = { method: string; path: string; body: unknown };

const PORT = Number(process.env.AGENTATION_E2E_PORT ?? 4175);

// A fixed clock: every response body is byte-stable across runs.
const EPOCH = "2026-01-01T00:00:00.000Z";

const sessions = new Map<string, StoredSession>();
const annotations = new Map<string, StoredAnnotation>();
const streams = new Map<string, Set<http.ServerResponse>>();
const requests: RequestLogEntry[] = [];
let sessionCounter = 0;
/** Flipped by `/__e2e/network`; offline drops every protocol route. */
let online = true;

function reset(): void {
  for (const listeners of streams.values()) {
    for (const listener of listeners) listener.end();
  }
  streams.clear();
  sessions.clear();
  annotations.clear();
  requests.length = 0;
  sessionCounter = 0;
  online = true;
}

function broadcast(sessionId: string, event: string, payload: unknown): number {
  const listeners = streams.get(sessionId);
  if (!listeners) return 0;
  const frame = `event: ${event}\ndata: ${JSON.stringify({ payload })}\n\n`;
  for (const listener of listeners) listener.write(frame);
  return listeners.size;
}

function send(
  response: http.ServerResponse,
  status: number,
  body?: unknown,
): void {
  const headers: http.OutgoingHttpHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Cache-Control": "no-store",
  };
  if (body === undefined) {
    response.writeHead(status, headers);
    response.end();
    return;
  }
  const text = JSON.stringify(body);
  response.writeHead(status, {
    ...headers,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(text),
  });
  response.end(text);
}

async function readBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

function openStream(
  sessionId: string,
  request: http.IncomingMessage,
  response: http.ServerResponse,
): void {
  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  response.write(": connected\n\n");

  let listeners = streams.get(sessionId);
  if (!listeners) {
    listeners = new Set();
    streams.set(sessionId, listeners);
  }
  listeners.add(response);
  request.on("close", () => listeners?.delete(response));
}

const server = http.createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const { pathname } = new URL(request.url ?? "/", "http://127.0.0.1");

  if (method === "OPTIONS") {
    send(response, 204);
    return;
  }

  const body = method === "GET" || method === "DELETE" ? undefined : await readBody(request);
  if (!pathname.startsWith("/__e2e/")) {
    requests.push({ method, path: pathname, body });
  }

  // ---------------------------------------------------------------------------
  // Control surface — always reachable, even while "offline"
  // ---------------------------------------------------------------------------

  if (pathname === "/__e2e/reset" && method === "POST") {
    reset();
    send(response, 200, { ok: true });
    return;
  }
  if (pathname === "/__e2e/requests" && method === "GET") {
    send(response, 200, { requests });
    return;
  }
  if (pathname === "/__e2e/network" && method === "POST") {
    online = (body as { online?: boolean } | undefined)?.online !== false;
    if (!online) {
      for (const listeners of streams.values()) {
        for (const listener of listeners) listener.end();
      }
      streams.clear();
    }
    send(response, 200, { online });
    return;
  }

  const expire = /^\/__e2e\/sessions\/([^/]+)\/expire$/.exec(pathname);
  if (expire && method === "POST") {
    const session = sessions.get(expire[1]);
    if (session) session.expired = true;
    send(response, 200, { expired: Boolean(session) });
    return;
  }

  const resolve = /^\/__e2e\/annotations\/([^/]+)\/resolve$/.exec(pathname);
  if (resolve && method === "POST") {
    const annotation = annotations.get(resolve[1]);
    if (!annotation) {
      send(response, 404, { error: "unknown annotation" });
      return;
    }
    annotation.status = "resolved";
    const delivered = broadcast(annotation.sessionId, "annotation.updated", annotation);
    send(response, 200, { delivered });
    return;
  }

  // ---------------------------------------------------------------------------
  // Protocol routes
  // ---------------------------------------------------------------------------

  if (!online) {
    // A dead socket, not a polite error: the runtime's offline path is a fetch
    // rejection, and a 503 body would exercise a different branch.
    request.destroy();
    response.destroy();
    return;
  }

  if (pathname === "/health" && method === "GET") {
    send(response, 200, { status: "ok" });
    return;
  }

  if (pathname === "/webhook" && method === "POST") {
    send(response, 200, { received: true });
    return;
  }

  if (pathname === "/sessions" && method === "GET") {
    send(response, 200, [...sessions.values()].filter((session) => !session.expired));
    return;
  }

  if (pathname === "/sessions" && method === "POST") {
    sessionCounter += 1;
    const session: StoredSession = {
      id: `ses_${sessionCounter}`,
      url: String((body as { url?: unknown } | undefined)?.url ?? ""),
      status: "active",
      createdAt: EPOCH,
      updatedAt: EPOCH,
      expired: false,
    };
    sessions.set(session.id, session);
    send(response, 201, session);
    return;
  }

  const sessionEvents = /^\/sessions\/([^/]+)\/events$/.exec(pathname);
  if (sessionEvents && method === "GET") {
    openStream(sessionEvents[1], request, response);
    return;
  }

  const sessionAnnotations = /^\/sessions\/([^/]+)\/annotations$/.exec(pathname);
  if (sessionAnnotations && method === "POST") {
    const session = sessions.get(sessionAnnotations[1]);
    if (!session || session.expired) {
      send(response, 404, { error: "unknown session" });
      return;
    }
    const incoming = (body ?? {}) as Json;
    const id = typeof incoming.id === "string" ? incoming.id : `ann_${annotations.size + 1}`;
    // The id is echoed unchanged: a different id means "the server replaced
    // your record", which is a distinct runtime path and not what this fixture
    // is here to trigger.
    const stored: StoredAnnotation = { ...incoming, id, sessionId: session.id };
    annotations.set(id, stored);
    send(response, 201, stored);
    return;
  }

  const sessionAction = /^\/sessions\/([^/]+)\/action$/.exec(pathname);
  if (sessionAction && method === "POST") {
    const session = sessions.get(sessionAction[1]);
    if (!session || session.expired) {
      send(response, 404, { error: "unknown session" });
      return;
    }
    const sseListeners = broadcast(session.id, "action.requested", {
      sessionId: session.id,
      output: String((body as { output?: unknown } | undefined)?.output ?? ""),
    });
    const owned = [...annotations.values()].filter(
      (annotation) => annotation.sessionId === session.id,
    );
    send(response, 200, {
      success: true,
      annotationCount: owned.length,
      delivered: { sseListeners, webhooks: 0, total: sseListeners },
    });
    return;
  }

  const singleSession = /^\/sessions\/([^/]+)$/.exec(pathname);
  if (singleSession && method === "GET") {
    const session = sessions.get(singleSession[1]);
    if (!session || session.expired) {
      send(response, 404, { error: "unknown session" });
      return;
    }
    send(response, 200, {
      ...session,
      annotations: [...annotations.values()].filter(
        (annotation) => annotation.sessionId === session.id,
      ),
    });
    return;
  }

  const singleAnnotation = /^\/annotations\/([^/]+)$/.exec(pathname);
  if (singleAnnotation && method === "PATCH") {
    const existing = annotations.get(singleAnnotation[1]);
    if (!existing) {
      send(response, 404, { error: "unknown annotation" });
      return;
    }
    Object.assign(existing, (body ?? {}) as Json, { id: existing.id });
    send(response, 200, existing);
    return;
  }
  if (singleAnnotation && method === "DELETE") {
    if (!annotations.delete(singleAnnotation[1])) {
      send(response, 404, { error: "unknown annotation" });
      return;
    }
    send(response, 204);
    return;
  }

  send(response, 404, { error: `no route for ${method} ${pathname}` });
});

server.listen(PORT, "127.0.0.1", () => {
  // Playwright's `webServer` waits for this line.
  console.log(`agentation protocol fixture listening on http://127.0.0.1:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    reset();
    server.close(() => process.exit(0));
  });
}
