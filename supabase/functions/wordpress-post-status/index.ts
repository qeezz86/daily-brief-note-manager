import { createClient } from 'npm:@supabase/supabase-js@2.110.2'

import { createPostStatusHandler } from './handler.ts'

const environment = { get(name: string) { return Deno.env.get(name) } }
function supabaseConfig() {
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !key) throw new Error('missing configuration')
  return { url, key }
}
Deno.serve(createPostStatusHandler({
  environment,
  async verifyCaller(accessToken) {
    const { url, key } = supabaseConfig(); const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await client.auth.getUser(accessToken)
    if (error || !data.user) throw new Error('unauthenticated')
    return { id: data.user.id }
  },
  createDatabase(accessToken) {
    const { url, key } = supabaseConfig()
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } })
  },
}))
