import { createMiddleware } from '@tanstack/react-start'
import { supabase } from './client'
import { encodeVendorSessionHeader, getVendorSession } from '@/lib/vendor-session'


function buildAuthHeaders(existing?: HeadersInit): Headers {
  const headers = new Headers(existing)
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

  if (init && init.headers) {
    try {
      new Headers(init.headers as HeadersInit).forEach((value, key) => headers.set(key, value))
    } catch {}
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

// Client-side function middleware that attaches Supabase bearer token + vendor session
// to server-fn requests. Kept for compatibility with src/start.ts auto-injection.
export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const headers: Record<string, string> = {}
  try {
    const vendorSession = getVendorSession()
    const vendorHeader = encodeVendorSessionHeader(vendorSession)
    if (vendorHeader) headers['x-vendor-session'] = vendorHeader
  } catch {}
  try {
    const result = await supabase.auth.getSession()
    const token = result?.data?.session?.access_token
    if (token) headers['Authorization'] = `Bearer ${token}`
  } catch {}
  return next({ headers })
})
