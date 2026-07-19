const { createClient } = require('@supabase/supabase-js');
const { env } = require('./env');

let client;

function getSupabase() {
  if (client !== undefined) {
    return client;
  }

  if (!env.supabase.url || !env.supabase.key) {
    client = null;
    return client;
  }

  client = createClient(env.supabase.url, env.supabase.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return client;
}

module.exports = { getSupabase };
