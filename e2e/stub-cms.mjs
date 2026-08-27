// A stand-in for Hygraph, so the app can be driven end-to-end without network.
//
// `cms.ts` talks to the CMS through exactly one seam: a POST of
// `{ query, variables }` to `CMS_ENDPOINT`, whose `data` it returns. That makes
// a stub the honest way to cover it — the alternative is mocking `fetch`, which
// tests the mock. Here the real `cms.ts` runs, the real cache policy runs, and
// the real components render the result.
//
// It is deliberately not a GraphQL implementation. Parsing the schema would be
// a second system to get wrong; instead it answers on which root fields a query
// mentions, which is all the app distinguishes. If a query asks for `projects`
// it gets projects, filtered by `slug` when the variables carry one.

import { createServer } from "node:http";
import { PROJECTS, SITE_DATA } from "./fixtures.mjs";

const port = Number(process.env.STUB_CMS_PORT ?? 4010);

/** Root fields the app reads, resolved from the query text and variables. */
function resolve(query, variables) {
  const data = {};

  if (query.includes("siteDatas")) data.siteDatas = [SITE_DATA];

  if (query.includes("projects")) {
    const slug = variables?.slug;
    data.projects = slug
      ? PROJECTS.filter((p) => p.slug === String(slug).toLowerCase())
      : PROJECTS;
  }

  // Single-asset lookups (resume link, OG image) resolve to nothing: no
  // fixture references an asset id, and the app's contract is that a missing
  // asset degrades rather than throws.
  if (query.includes("asset(")) data.asset = null;

  return data;
}

const server = createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ errors: [{ message: "stub CMS accepts POST only" }] }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    let payload;
    try {
      payload = JSON.parse(body || "{}");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ errors: [{ message: "stub CMS got invalid JSON" }] }));
      return;
    }

    const data = resolve(String(payload.query ?? ""), payload.variables ?? {});
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data }));
  });
});

server.listen(port, () => {
  // Playwright waits on this port; the line is here so a failed start is
  // readable in the webServer output rather than silent.
  console.log(`stub CMS listening on http://127.0.0.1:${port}`);
});
