import { createFileRoute } from "@tanstack/react-router";

export const Route = (createFileRoute as any)("/api/public/debug-sync")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(JSON.stringify({
          envKeys: Object.keys(process.env),
        }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  }
});
