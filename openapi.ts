import fs from 'fs';

async function fetchOpenApi() {
  const envFile = fs.readFileSync('d:\\nhch\\.env', 'utf8');
  let url = '', key = '';
  envFile.split('\n').forEach(line => {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
  });

  const response = await fetch(`${url}/rest/v1/?apikey=${key}`);
  const data = await response.json();
  const definitions = data.definitions;
  
  const tables = ['de_thi', 'dap_an_de_thi'];
  for (const t of tables) {
    console.log(`Schema for ${t}:`, definitions[t]);
  }
}
fetchOpenApi();
