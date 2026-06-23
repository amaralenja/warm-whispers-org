import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MULTIUM" },
      { name: "description", content: "MULTIUM" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <h1 className="text-6xl font-bold tracking-tight text-black">MULTIUM</h1>
    </div>
  );
}
