# Deploy na Vercel

Esse projeto tá pronto pra rodar na Vercel. O TanStack Start usa Nitro com o preset `vercel`, que gera o output no formato `.vercel/output` (Build Output API v3) — a Vercel reconhece automaticamente.

## Passo a passo

1. Sobe o repositório no GitHub/GitLab/Bitbucket.
2. Na Vercel: **Add New → Project → Import** o repo.
3. **Framework Preset**: deixa "Other" (a Vercel detecta o output do Nitro sozinha).
4. **Build Command**: `bun run build` (ou `npm run build`).
5. **Output Directory**: deixa vazio (o Nitro escreve em `.vercel/output`).
6. **Environment Variables** — adiciona TODAS abaixo:

| Variável                           | Onde pegar                                                          |
| ---------------------------------- | ------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                | Supabase → Project Settings → API → Project URL                     |
| `VITE_SUPABASE_PUBLISHABLE_KEY`    | Supabase → Project Settings → API → `anon` / `publishable` key      |
| `VITE_SUPABASE_PROJECT_ID`         | `wvcwrozwnwdlpandwubp`                                              |
| `SUPABASE_URL`                     | Mesma URL acima (versão server)                                     |
| `SUPABASE_PUBLISHABLE_KEY`         | Mesma key publishable acima (versão server)                         |
| `SUPABASE_SERVICE_ROLE_KEY`        | Supabase → API → `service_role` key (**só server, nunca client**)   |

7. **Deploy**. Pronto.

## Depois do deploy

- Adiciona o domínio da Vercel (`*.vercel.app` ou custom) em:
  **Supabase → Authentication → URL Configuration → Site URL / Redirect URLs**.
- Senão o e-mail de confirmação de cadastro vai redirecionar errado.

## Domínio próprio

Em Vercel → Project → Settings → Domains → adiciona seu domínio.
Depois replica o domínio no Supabase (Site URL).
