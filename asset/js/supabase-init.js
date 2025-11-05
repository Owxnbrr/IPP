// Initialisation Supabase (v2) - à inclure avant tout code qui utilise Supabase
// ⚠️ Remplacez les placeholders SUPABASE_URL et SUPABASE_ANON_KEY

export const SUPABASE_URL = 'https://awtirwzygivtfhishifr.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3dGlyd3p5Z2l2dGZoaXNoaWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzQyNzEsImV4cCI6MjA3NzkxMDI3MX0.54w2DaBGAjsMeO7F25_dY8Ws9iayPoraTlD9gsj_p9I'

export async function getSupabase() {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}