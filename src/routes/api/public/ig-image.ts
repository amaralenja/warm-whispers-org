import { createFileRoute } from "@tanstack/react-router";

// Proxy de imagem do Instagram CDN.
// Instagram bloqueia hotlink (referer) e a URL assinada expira rápido.
// O navegador chama /api/public/ig-image?u=<encoded>, e nós buscamos no servidor.
export const Route = createFileRoute("/api/public/ig-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = url.searchParams.get("u");
        if (!target) return new Response("missing u", { status: 400 });

        // só permite cdninstagram / fbcdn
        let host = "";
        try {
          host = new URL(target).hostname;
        } catch {
          return new Response("bad url", { status: 400 });
        }
        if (!/(cdninstagram|fbcdn)\.net$/i.test(host) && !/cdninstagram\.com$/i.test(host)) {
          return new Response("forbidden host", { status: 403 });
        }

        try {
          const upstream = await fetch(target, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
              Referer: "https://www.instagram.com/",
              Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
            },
          });
          if (!upstream.ok) {
            return new Response("upstream " + upstream.status, { status: 502 });
          }
          const body = await upstream.arrayBuffer();
          return new Response(body, {
            status: 200,
            headers: {
              "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
              "Cache-Control": "public, max-age=86400, immutable",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (e) {
          return new Response("fetch error", { status: 502 });
        }
      },
    },
  },
});
