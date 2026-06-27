import { supabase } from './src/supabaseClient';

async function check() {
  const tables = ['ky_thi_cau_hoi', 'de_thi', 'de_thi_cau_hoi', 'dap_an_de_thi'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table ${table} error:`, error.message);
    } else {
      console.log(`Table ${table} exists! Data:`, data);
    }
  }
}
check();
