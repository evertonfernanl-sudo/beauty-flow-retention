import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://beauty-flow-retention.lovable.app";

const ENTRIES = [
  { path: "/", priority: "1.0", changefreq: "weekly" as const },
  { path: "/funcionalidades", priority: "0.9", changefreq: "monthly" as const },
  { path: "/planos", priority: "0.9", changefreq: "monthly" as const },
  { path: "/blog", priority: "0.7", changefreq: "weekly" as const },
  { path: "/contato", priority: "0.6", changefreq: "monthly" as const },
  { path: "/auth", priority: "0.5", changefreq: "monthly" as const },
  { path: "/privacidade", priority: "0.3", changefreq: "yearly" as const },
  { path: "/termos", priority: "0.3", changefreq: "yearly" as const },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls = ENTRIES.map(
          (e) =>
            `  <url>\n    <loc>${BASE_URL}${e.path}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
        );
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
