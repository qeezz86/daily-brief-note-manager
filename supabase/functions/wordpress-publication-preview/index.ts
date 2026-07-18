import { createClient } from 'npm:@supabase/supabase-js@2.110.2'

import { DiagnosticError } from '../wordpress-diagnostics/errors.ts'
import { createCallerDatabase } from './contentLoader.ts'
import { createPublicationPreviewHandler } from './handler.ts'

const environment = { get(name: string) { return Deno.env.get(name) } }

function supabaseConfig() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !key) throw new DiagnosticError('CONFIG_MISSING', { httpStatus: 500 })
  return { url, key }
}

const verifyCaller = async (accessToken: string) => {
  const { url, key } = supabaseConfig()
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user) throw new Error('unauthenticated')
  return { id: data.user.id }
}

Deno.serve(createPublicationPreviewHandler({
  environment,
  verifyCaller,
  createDatabase(accessToken) {
    const { url, key } = supabaseConfig()
    return createCallerDatabase(createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }))
  },
}))
