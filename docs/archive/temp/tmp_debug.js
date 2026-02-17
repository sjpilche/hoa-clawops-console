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
        console.log(`${method} ${path} => ${res.statusCode}`);
        console.log('Body:', d.substring(0, 500));
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
  const login = await req('POST', '/api/auth/login', null, {
    email: 'admin@clawops.local', password: 'changeme123'
  });
  const token = login.data.token;
  if (!token) return;

  await req('GET', '/api/agents', token);
})().catch(e => console.error(e));
