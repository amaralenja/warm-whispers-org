import { supabase } from './client'
import { encodeVendorSessionHeader, getVendorSession } from '@/lib/vendor-session'

function buildAuthHeaders(existing?: HeadersInit): Headers {
  const headers = new Headers(existing)
  const vendorHeader = encodeVendorSessionHeader(getVendorSession())
  if (vendorHeader) headers.set('x-vendor-session', vendorHeader)
  return headers
}

// Custom fetch used by TanStack Start server functions.
// Keeping auth/header attachment here avoids the fragile global functionMiddleware path
// that can be evaluated by React during HMR and crash with "undefined.map".
export async function fetchWithSupabaseAuth(input: RequestInfo | URL, init?: RequestInit) {
  const headers = buildAuthHeaders(
    typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
  )

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  }

  try {
    const result = await supabase.auth.getSession()
    const token = result?.data?.session?.access_token
    if (token) headers.set('Authorization', `Bearer ${token}`)
  } catch (err) {
    console.error('[fetchWithSupabaseAuth] getSession failed', err)
  }

  return fetch(input, { ...init, headers })
}

// Backwards-compat stub: legacy code / tooling occasionally re-imports
// `attachSupabaseAuth` as a client functionMiddleware. Auth is now attached
// via `fetchWithSupabaseAuth` above, so this middleware is a passthrough —
// exported to keep the import path resolvable and avoid HMR crashes.
import { createMiddleware } from '@tanstack/react-start'
export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => next(),
)



