require('dotenv').config({ quiet: true });

const { createClient } = require('@supabase/supabase-js');

let supabaseClient;

function getSupabase() {
  if (supabaseClient !== undefined) {
    return supabaseClient;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    supabaseClient = null;
    return supabaseClient;
  }

  supabaseClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}

module.exports = {
  getSupabase,
};
