import fs from 'fs';

async function fetchSchema() {
  try {
    const url = 'https://wybecyucsxyscihboxwp.supabase.co/rest/v1/?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5YmVjeXVjc3h5c2NpaGJveHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTUyMjc4ODMsImV4cCI6MjAyODgyMzg4M30.YOUR_ANON_KEY';
    // Let me parse .env.local to get the real anon key
    const env = fs.readFileSync('c:/Users/esenb/Desktop/MGMSRS-main/.env.local', 'utf-8');
    const anonKeyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
    const apiUrlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    
    if (anonKeyMatch && apiUrlMatch) {
      const anonKey = anonKeyMatch[1].trim();
      const apiUrl = apiUrlMatch[1].trim();
      
      const res = await fetch(`${apiUrl}/rest/v1/?apikey=${anonKey}`);
      const data = await res.json();
      
      const profilesDef = data.definitions.profiles;
      console.log('Profiles Schema:');
      console.log(JSON.stringify(profilesDef, null, 2));
    } else {
      console.log('Could not find env vars');
    }
  } catch (err) {
    console.error(err);
  }
}

fetchSchema();
