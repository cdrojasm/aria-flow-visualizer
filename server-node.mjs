import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const CLIENT_DIR = join(fileURLToPath(import.meta.url), "../dist/client");
const PORT = process.env.PORT || 3000;

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

const { default: handler } = await import("./dist/server/server.js");

const server = createServer(async (req, res) => {
  // Serve hashed static assets with immutable cache
  if (req.url.startsWith("/assets/")) {
    const filePath = join(CLIENT_DIR, req.url);
    if (existsSync(filePath)) {
      res.setHeader("Content-Type", MIME[extname(filePath)] ?? "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      createReadStream(filePath).pipe(res);
      return;
    }
  }

  // SSR: adapt Node IncomingMessage → fetch Request → Node ServerResponse
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  const request = new Request(new URL(req.url, `http://${req.headers.host || "localhost"}`), {
    method: req.method,
    headers: req.headers,
    ...(chunks.length && req.method !== "GET" && req.method !== "HEAD"
      ? { body: Buffer.concat(chunks) }
      : {}),
  });

  const response = await handler.fetch(request, {}, {});
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  response.body ? Readable.fromWeb(response.body).pipe(res) : res.end();
});

server.listen(PORT, () => console.log(`Listening on :${PORT}`));
