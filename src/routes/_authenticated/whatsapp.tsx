import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  component: WhatsAppPage,
});

function WhatsAppPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Conecte e gerencie suas instâncias de WhatsApp.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">
          Nenhuma conexão configurada ainda. Me explica como você quer fazer a conexão (QR Code, API externa, etc) que eu monto o fluxo aqui.
        </p>
      </div>
    </div>
  );
}
