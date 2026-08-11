import * as http from "node:http";
import * as https from "node:https";

// Playwright's APIRequestContext buffers a response whole: `request.post(...)`
// resolves only once the last byte has arrived, and `response.text()` hands over
// a finished string. That is enough to check what a stream *said*, and it can
// never check *when* — a reply delivered in one blob at the end is
// indistinguishable from one delivered token by token.
//
// So the one test that has to prove the transport really streams talks to the
// portal through Node's own client instead, and records the arrival time of
// every read. Nothing else should need this: the frame contract is far cheaper
// to assert on a buffered body.

/** One `data` event on the response — one read the client got before the end. */
export type StreamRead = {
  /** Milliseconds from the request being sent. */
  atMs: number;
  text: string;
};

export type RawStreamResponse = {
  status: number;
  headers: Record<string, string>;
  /** Milliseconds from the request being sent to the response headers landing. */
  responseAtMs: number;
  /** Every read, in order. Two or more of them is what "streamed" means here. */
  reads: StreamRead[];
  /** The reads joined back together — the same body a buffering client sees. */
  body: string;
};

/**
 * POSTs JSON and reads the response as it arrives.
 *
 * `timeoutMs` guards the whole exchange, not one socket read: a stream that
 * never terminates (the `generate_image` hang) would otherwise hold the test
 * until Playwright kills it, with the reads collected so far thrown away. On the
 * cap the request is destroyed and what did arrive is returned.
 */
export async function postAndReadStream(
  url: string,
  options: {
    headers: Record<string, string>;
    body: unknown;
    timeoutMs?: number;
  },
): Promise<RawStreamResponse> {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  const payload = JSON.stringify(options.body);

  return new Promise<RawStreamResponse>((resolve, reject) => {
    const startedAt = Date.now();
    const reads: StreamRead[] = [];
    let settled = false;

    const request = client.request(
      {
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          ...options.headers,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        const responseAtMs = Date.now() - startedAt;
        response.setEncoding("utf8");

        response.on("data", (chunk: string) => {
          reads.push({ atMs: Date.now() - startedAt, text: chunk });
        });

        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            status: response.statusCode ?? 0,
            headers: Object.fromEntries(
              Object.entries(response.headers).map(([name, value]) => [
                name,
                Array.isArray(value) ? value.join(", ") : (value ?? ""),
              ]),
            ),
            responseAtMs,
            reads,
            body: reads.map((read) => read.text).join(""),
          });
        };

        response.on("end", finish);
        // A destroyed request ends the response without `end` — keep the reads.
        response.on("close", finish);
        response.on("error", finish);
      },
    );

    const timer = setTimeout(() => {
      request.destroy();
    }, options.timeoutMs ?? 120000);

    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    request.write(payload);
    request.end();
  });
}
