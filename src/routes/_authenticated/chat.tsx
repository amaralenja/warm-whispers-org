import { createFileRoute } from "@tanstack/react-router";
import { ChatRoute } from "@/components/chat-page";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    phone: typeof search.phone === "string" ? search.phone : undefined,
    conversationId: typeof search.conversationId === "string" ? search.conversationId : undefined,
    embed: search.embed === "1" || search.embed === 1 || search.embed === true ? true : undefined,
  }),
});
