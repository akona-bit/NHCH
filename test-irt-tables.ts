import { supabase } from './src/supabaseClient';

async function check() {
  const tables = ['bai_lam', 'du_lieu_bai_lam', 'item_analysis', 'dap_an'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table ${table} error:`, error.message);
    } else {
      console.log(`Table ${table} exists! Data keys:`, data.length > 0 ? Object.keys(data[0]) : 'empty array');
    }
  }
}
check();
