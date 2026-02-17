const http = require('http');

function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 3001, path,
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, data: { raw: d } }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  // Login
  const login = await req('POST', '/api/auth/login', null, {
    email: 'admin@clawops.local', password: 'changeme123'
  });
  let token = login.data.token;
  if (token && typeof token === 'object') token = token.token;
  if (!token) { console.log('Login failed:', login.data); return; }

  // Check agents
  const agents = await req('GET', '/api/agents', token);
  const list = agents.data.agents || [];
  console.log('Agents:', list.map(a => a.name).join(', ') || 'NONE');

  // Check email status
  const email = await req('GET', '/api/email/status', token);
  console.log('Email status:', JSON.stringify(email.data));
})().catch(e => console.error(e));
