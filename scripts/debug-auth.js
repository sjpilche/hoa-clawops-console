require('dotenv').config({ path: '.env.local' });

async function go() {
  const r1 = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@clawops.local', password: 'changeme123' }),
  });
  const j1 = await r1.json();
  const token = j1.token;
  console.log('Token length:', token ? token.length : 'null');
  console.log('Token prefix:', token ? token.substring(0, 20) : 'null');

  const authHeader = `Bearer ${token}`;
  console.log('Auth header length:', authHeader.length);
  console.log('Auth header prefix:', authHeader.substring(0, 30));
  console.log('Spaces in header:', authHeader.split(' ').length, 'parts');

  // Test with a simple authenticated endpoint
  const r2 = await fetch('http://localhost:3001/api/agents', {
    headers: { Authorization: authHeader },
  });
  const j2 = await r2.json();
  console.log('Agents response:', r2.status, JSON.stringify(j2).substring(0, 100));
}
go().catch(e => console.error(e.message));
