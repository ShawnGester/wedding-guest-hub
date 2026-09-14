import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizeAppData } from '../storage'
import type { AppData } from '../types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

export function cloudConfigured(): boolean {
  return Boolean(url && anonKey)
}

export function getCloud(): SupabaseClient | null {
  if (!cloudConfigured()) return null
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

export function authRedirectUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return new URL(base, window.location.origin).href
}

export async function signInWithEmail(email: string): Promise<void> {
  const sb = getCloud()
  if (!sb) throw new Error('Cloud sync is not configured.')
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: authRedirectUrl() },
  })
  if (error) throw error
}

export async function signOutCloud(): Promise<void> {
  const sb = getCloud()
  if (!sb) return
  const { error } = await sb.auth.signOut()
  if (error) throw error
}

export async function fetchHubState(): Promise<AppData | null> {
  const sb = getCloud()
  if (!sb) return null
  const { data, error } = await sb.from('hub_state').select('data').eq('id', 1).maybeSingle()
  if (error) throw error
  if (!data?.data) return null
  return normalizeAppData(data.data)
}

export async function saveHubState(data: AppData, email: string): Promise<void> {
  const sb = getCloud()
  if (!sb) return
  const { error } = await sb.from('hub_state').upsert({
    id: 1,
    data,
    updated_at: new Date().toISOString(),
    updated_by: email,
  })
  if (error) throw error
}
