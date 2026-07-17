import { createClient } from 'npm:@supabase/supabase-js@2.110.2'

import { DiagnosticError } from './errors.ts'
import { createHandler } from './handler.ts'

const environment = {
  get(name: string) {
    return Deno.env.get(name)
  },
}

const verifyCaller = async (accessToken: string) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) throw new DiagnosticError('CONFIG_MISSING', { httpStatus: 500 })

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user) throw new DiagnosticError('CALLER_UNAUTHENTICATED', { httpStatus: 401 })
  return { id: data.user.id }
}

Deno.serve(createHandler({ environment, verifyCaller }))
