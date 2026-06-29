## Aba Fluxos (estilo N8N) pra WhatsApp

Editor visual de fluxos com nós conectáveis. Cada fluxo tem um gatilho e uma sequência de blocos de conteúdo. Quando uma mensagem chega no `/api/public/whatsapp/webhook`, o engine avalia gatilhos ativos e executa o fluxo correspondente, enviando mensagens via EvoHub (mesmo path que o Chat ao Vivo já usa).

Sobre o erro do `context-menu.tsx`: é sourcemap stale (componente sem alterações). Some no próximo reload.

### Estrutura

**Banco (migração nova):**
- `wa_flows` — `id`, `nome`, `operacao_id`, `ativo`, `nodes jsonb`, `edges jsonb`, `entry_node_id`
- `wa_flow_triggers` — `id`, `flow_id`, `tipo` (`keyword` / `any_message` / `manual` / `new_conversation`), `valor` (palavra-chave/regex), `channel_id` (null = todos)
- `wa_flow_runs` — `id`, `flow_id`, `conversation_id`, `current_node_id`, `status`, `context jsonb`, `waiting_for` (`message` / `button` / `null`), `expires_at`
- `wa_flow_executions` — log de cada nó executado pra debug

**Tipos de nó:**
- `trigger` — começo do fluxo
- `send_text` — mensagem texto
- `send_image` / `send_video` / `send_audio` / `send_document` — mídia (upload pro bucket `wa-media`, manda via link assinado, igual o chat)
- `send_buttons` — texto + até 3 botões de resposta (WhatsApp interactive `button`)
- `send_list` — lista de opções (interactive `list`, até 10)
- `wait_message` — pausa até próxima mensagem do contato
- `wait_button` — pausa até clique em botão; ramifica por `button_id`
- `delay` — espera N segundos
- `condition` — if/else sobre texto recebido (contém / igual / regex)
- `set_variable` — salva valor no contexto da execução
- `assign_operator` — entrega pra humano (marca conv com flag, pausa fluxo)
- `end` — encerra

### UI (`/_authenticated/flows`)

- Lista de fluxos (cards com toggle ativo/inativo, operação, gatilhos)
- Botão "Novo fluxo" → editor
- Editor full-screen com **React Flow** (`@xyflow/react`):
  - Canvas com pan/zoom/minimap
  - Sidebar esquerda: paleta de nós arrastáveis agrupados (Conteúdo / Interativo / Espera / Lógica / Ação)
  - Painel direito: inspector do nó selecionado (campos dinâmicos por tipo)
  - Topbar: nome, salvar, ativar, "Testar com meu número" (dispara o fluxo pra um WhatsApp informado)
- Upload de mídia direto no inspector via bucket `wa-media` (signed URL salva no node)
- Validação visual: nó sem conexão de saída = aviso amarelo

### Engine (server-side)

**`src/lib/flow-engine.functions.ts`** — server functions:
- `runFlow({flowId, conversationId, contactWaId, channelId, triggerContext})` — cria run, executa nó inicial
- `advanceFlow({runId, input})` — avança a partir de input recebido (mensagem / botão)
- `cancelFlow({runId})`

**`stepNode(node, ctx)`** — executor por tipo:
- `send_*` → chama `sendWhatsappMessage` (reusa lógica existente)
- `wait_message` / `wait_button` → grava `waiting_for`, retorna
- `delay` → `setTimeout` curto OU agenda via `expires_at` + cron (pra MVP: setTimeout até 30s, acima vira pendente — cron processa)
- `condition` → escolhe edge por handle `true` / `false`
- substituição de variáveis: `{{contato.nome}}`, `{{contato.telefone}}`, `{{var.minha_var}}`

**Webhook integration:**
- No `webhook.ts` atual, após inserir mensagem incoming:
  1. Se houver `wa_flow_runs` com `waiting_for='message'` ou `'button'` pra essa conversa → `advanceFlow`
  2. Senão, avaliar `wa_flow_triggers` ativos pro `channel_id`:
     - `keyword` → casa contém/regex
     - `new_conversation` → primeira msg da conv
     - `any_message` → sempre
  3. Disparar `runFlow` do primeiro match

**Cron (opcional MVP+):** `/api/public/cron/flow-tick` chamado por pg_cron a cada minuto → processa runs com `expires_at <= now()` pra delays longos.

### Arquivos a criar

- `supabase/migrations/...` — tabelas acima + GRANTs + RLS + realtime
- `src/lib/flow-engine.functions.ts` — engine + CRUD de fluxos
- `src/routes/_authenticated/flows.tsx` — lista
- `src/routes/_authenticated/flows.$flowId.tsx` — editor React Flow
- `src/components/flows/node-palette.tsx`
- `src/components/flows/node-inspector.tsx`
- `src/components/flows/custom-nodes.tsx` — render visual de cada tipo
- Atualizar `src/routes/api/public/whatsapp/webhook.ts` pra invocar engine
- Atualizar `src/components/app-sidebar.tsx` — adicionar "Fluxos" (ícone `Workflow`)

### Dependência

- `bun add @xyflow/react` (React Flow v12, mantido, leve, MIT)

### Escopo do MVP (essa entrega)

Implementar: schema + CRUD + editor visual com paleta/inspector + nós `send_text`, `send_image`, `send_video`, `send_audio`, `send_document`, `send_buttons`, `wait_message`, `wait_button`, `delay` (até 30s), `condition`, `end` + integração no webhook + gatilho por keyword e new_conversation + botão testar.

Fora do MVP (incremental depois): `send_list`, `assign_operator`, cron pra delays longos, agendamento por horário, A/B, métricas por nó.
