import "server-only";

/** A CSV download (no caching; it's private data). */
export function csvResponse(body: string, filename: string): Response {
  return new Response("﻿" + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
