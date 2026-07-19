import { createClient } from 'npm:@supabase/supabase-js@2.110.2'

import { DiagnosticError } from '../wordpress-diagnostics/errors.ts'
import { createDraftAttemptDatabase } from './contentLoader.ts'
import { createWordPressDraftHandler } from './handler.ts'

const environment = { get(name: string) { return Deno.env.get(name) } }

function supabaseConfig() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key || !serviceRoleKey) throw new DiagnosticError('CONFIG_MISSING', { httpStatus: 500 })
  return { url, key, serviceRoleKey }
}

const verifyCaller = async (accessToken: string) => {
  const { url, key } = supabaseConfig()
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user) throw new Error('unauthenticated')
  return { id: data.user.id }
}

Deno.serve(createWordPressDraftHandler({
  environment,
  verifyCaller,
  createDatabase(accessToken, callerId) {
    const { url, key, serviceRoleKey } = supabaseConfig()
    const callerClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
    const transitionClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    return createDraftAttemptDatabase(callerClient, transitionClient, callerId)
  },
}))
