const http = require('http');
function apiFetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: opts.method || 'GET', headers: opts.headers || {} }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({raw: data}); } });
    });
    if (opts.body) req.write(opts.body);
    req.on('error', reject);
    req.end();
  });
}
(async () => {
  const login = await apiFetch('http://localhost:3001/api/auth/login', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({email:'admin@clawops.local',password:'changeme123'})
  });
  const jwt = typeof login.token === 'string' ? login.token : login.token?.token;
  const agents = await apiFetch('http://localhost:3001/api/agents', {headers:{'Authorization':'Bearer '+jwt}});
  const list = agents.agents || agents;
  console.log('Total agents:', list.length);
  list.forEach(a => console.log(' ', a.id, '|', a.name, '|', a.status));
})().catch(e => console.error(e.message));
