import { supabase } from './client'
import { encodeVendorSessionHeader, getVendorSession } from '@/lib/vendor-session'

// Custom fetch used by TanStack Start server functions.
// Keeping auth/header attachment here avoids the fragile global functionMiddleware path
// that can be evaluated by React during HMR and crash with "undefined.map".
export async function fetchWithSupabaseAuth(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(
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

  const vendorHeader = encodeVendorSessionHeader(getVendorSession())
  if (vendorHeader) headers.set('x-vendor-session', vendorHeader)

  return fetch(input, { ...init, headers })
}
