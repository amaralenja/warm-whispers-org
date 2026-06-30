## Objetivo
Transformar o lembrete de call em algo acionável: cada lembrete vai com 2 botões — **Compareci (Show Up)** e **Não vou conseguir (No Show)** — com ID único por mensagem. Quando o convidado responder (na hora ou dias depois), o sistema bate o ID, marca show/no-show automaticamente e dispara o evento ShowUp pro Facebook (no caso de show).

## O que vai ser construído

### 1. Banco (migração)
- `wa_templates` ganha coluna `buttons jsonb` (array `[{id, label, type}]`).
- Atualiza seed `lembrete_call` com botões `showup` e `noshow` e novas variáveis: `{{nome}}`, `{{hora}}`, `{{convidados}}`.
- Nova tabela `wa_call_reminders`:
  - `id` (uuid) — vai dentro do payload do botão pra mapear o reply de volta.
  - `event_id` (Google Calendar event id), `channel_id`, `contact_wa` (telefone E.164).
  - `lead_email`, `lead_nome`, `lead_externalid`, `lead_fbp`, `lead_fbc` (snapshot pra disparar ShowUp depois).
  - `status` (`pending` | `showup` | `noshow`), `sent_at`, `replied_at`, `wa_message_id`.
- GRANTs + RLS authenticated only.

### 2. Templates Panel (`whatsapp.tsx`)
- Editor passa a mostrar/editar os botões do template (lista de `{label, type: reply}`).
- Preview já mostra os botões.

### 3. Server function `sendCallReminder` (`src/lib/call-reminders.functions.ts`)
- Recebe `eventId`, `to`, `nome`, `hora`, `convidados`.
- Cria registro em `wa_call_reminders` → pega o `id`.
- Renderiza template `lembrete_call` substituindo variáveis.
- Envia mensagem interactive (EvoHub) com 2 reply buttons:
  - id: `callack:<reminder_id>:showup` / `callack:<reminder_id>:noshow`
  - title: textos do template.
- Salva `wa_message_id` e `sent_at`.

### 4. Cron route `/api/public/hooks/call-reminders`
- Roda a cada 5 min via pg_cron.
- Lista eventos do Google Calendar entre +25 e +35 min.
- Pra cada evento que ainda não tem reminder enviado, chama `sendCallReminder`.

### 5. Webhook (`webhook.ts`)
- Quando `buttonId` começa com `callack:`, parseia `<reminder_id>:<action>`:
  - Atualiza `wa_call_reminders` (`status`, `replied_at`).
  - `showup` → dispara `sendMetaEvent` com snapshot salvo + chama `saveEventLink` lógica.
  - `noshow` → chama `markNoShow(event_id)`.
- Mantém o resto do fluxo intacto (assign vendedor, flow dispatch).

### 6. Painel de calendário
- Cada evento mostra status do lembrete (enviado / showup / noshow) puxado de `wa_call_reminders`.

## Detalhes técnicos

- Erro do `showup-dialog.tsx:23` é HMR stale — `createClient` no top-level não muda; o file não tem `.children` em nada. Some no F5. Vou deixar como está (escopo do request é o lembrete).
- Payload de botão WhatsApp tem limite de 256 chars no `id`; `callack:<uuid>:noshow` cabe folgado (~50 chars).
- Templates pré-aprovados pela Meta: como hoje a gente usa EvoHub estilo "session message", o interactive funciona dentro da janela 24h. Pro lembrete que sai antes do prazo, vou usar o envio de **template HSM** quando o canal Notificador for número oficial; caso contrário, cai pra interactive normal (que já é o padrão atual).
- Cron precisa da URL estável: `https://project--4860a253-8e14-4836-a639-c7fb96d53545.lovable.app/api/public/hooks/call-reminders`.

## Arquivos novos / alterados
- migração SQL (1)
- `src/lib/call-reminders.functions.ts` (novo)
- `src/lib/call-reminders.server.ts` (novo, helpers)
- `src/routes/api/public/hooks/call-reminders.ts` (novo)
- `src/routes/api/public/whatsapp/webhook.ts` (handler callack)
- `src/routes/_authenticated/whatsapp.tsx` (TemplatesPanel com botões)
- `src/routes/_authenticated/calendar.tsx` (badge de status do lembrete)
- pg_cron via `supabase--insert` depois da rota estar publicada