import { createMiddleware } from '@tanstack/react-start'
import { supabase } from './client'
import { encodeVendorSessionHeader, getVendorSession } from '@/lib/vendor-session'


function appendHeaders(headers: Headers, existing?: HeadersInit | null) {
  if (!existing) return
  try {
    new Headers(existing).forEach((value, key) => headers.set(key, value))
  } catch (err) {
    console.warn('[fetchWithSupabaseAuth] ignored invalid headers', err)
  }
}

function buildAuthHeaders(existing?: HeadersInit | null): Headers {
  const headers = new Headers()
  appendHeaders(headers, existing)
  const vendorSession = getVendorSession()
  const vendorHeader = encodeVendorSessionHeader(vendorSession)
  if (vendorHeader) headers.set('x-vendor-session', vendorHeader)
  return headers
}

// Custom fetch used by TanStack Start server functions.
export async function fetchWithSupabaseAuth(input: RequestInfo | URL, init?: RequestInit) {
  const headers = buildAuthHeaders(
    typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
  )

  appendHeaders(headers, init?.headers as HeadersInit | undefined)


  try {
    const result = await supabase.auth.getSession()
    const token = result?.data?.session?.access_token
    if (token) headers.set('Authorization', `Bearer ${token}`)
  } catch (err) {
    console.error('[fetchWithSupabaseAuth] getSession failed', err)
  }

  return fetch(input, { ...init, headers })
}

// Client-side function middleware that attaches Supabase bearer token + vendor session
// to server-fn requests. Kept for compatibility with src/start.ts auto-injection.
export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const headers = new Headers()
  try {
    const vendorSession = getVendorSession()
    const vendorHeader = encodeVendorSessionHeader(vendorSession)
    if (vendorHeader) headers.set('x-vendor-session', vendorHeader)
  } catch {}
  try {
    const result = await supabase.auth.getSession()
    const token = result?.data?.session?.access_token
    if (token) headers.set('Authorization', `Bearer ${token}`)
  } catch {}
  return next({ headers })
})
