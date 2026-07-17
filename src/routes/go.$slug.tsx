import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveShortLink } from "@/lib/ht-api.functions";

export const Route = createFileRoute("/go/$slug")({
  beforeLoad: async ({ params }) => {
    const slug = params.slug;
    try {
      const destination = await resolveShortLink({ data: slug });
      if (destination) {
        throw redirect({ href: destination, code: 302 });
      }
    } catch (err) {
      if (err && typeof err === "object" && ("href" in err || "to" in err)) {
        throw err;
      }
    }
    throw redirect({ to: "/" });
  },
  component: () => null,
});
