async function fetchOpenApi() {
  const url = "https://bmlyhxptcbcivtkssxug.supabase.co";
  const key = "sb_publishable_fRV8m8ITCqadXQHSLcUs4g_N8ufoksm";

  const response = await fetch(`${url}/rest/v1/?apikey=${key}`);
  const data = await response.json();
  
  if (data.definitions) {
      console.log('Definitions found');
  } else if (data.components && data.components.schemas) {
      console.log('OpenAPI v3 components found');
      const tables = ['bai_lam', 'du_lieu_bai_lam', 'item_analysis', 'dap_an', 'cau_hoi', 'chi_tiet_ket_qua', 'de_thi'];
      for (const t of tables) {
        console.log(`\n--- Schema for ${t} ---`);
        if (data.components.schemas[t]) {
          console.log(Object.keys(data.components.schemas[t].properties).join(', '));
        } else {
          console.log('Not found');
        }
      }
  } else {
      console.log(Object.keys(data));
  }
}
fetchOpenApi();
