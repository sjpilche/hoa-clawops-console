const http = require('http');
function apiFetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: opts.method || 'GET', headers: opts.headers || {} }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); } });
    });
    if (opts.body) req.write(opts.body);
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const login = await apiFetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@clawops.local', password: 'changeme123' }),
  });
  const jwt = (typeof login.token === 'string') ? login.token : login.token?.token;
  const headers = { 'Authorization': 'Bearer ' + jwt };

  const dashboard = await apiFetch('http://localhost:3001/api/mgmt-research/dashboard', { headers });
  console.log('Stats:', JSON.stringify(dashboard.stats));
  console.log('Companies count:', dashboard.companies?.length);
  if (dashboard.companies?.length > 0) {
    const c = dashboard.companies[0];
    console.log('\nFirst company fields:', Object.keys(c).join(', '));
    console.log('First company:', JSON.stringify(c, null, 2));
  } else {
    console.log('No companies returned!');
    console.log('Full response:', JSON.stringify(dashboard).substring(0, 500));
  }
})().catch(e => console.error(e.message));
