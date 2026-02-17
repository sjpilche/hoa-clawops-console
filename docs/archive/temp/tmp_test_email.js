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
  if (!token) { console.log('Login failed'); return; }

  console.log('✅ Logged in');

  // Send test email
  const email = await req('POST', '/api/email/send', token, {
    to: 'augustwest154@gmail.com',
    subject: 'ClawOps Test Email - System Online',
    body: 'This is a test email from your ClawOps Daily Tech Digest agent.\n\nIf you received this, email delivery is working!\n\n— ClawOps',
    html: '<h2>ClawOps Test Email</h2><p>This is a test email from your <strong>ClawOps Daily Tech Digest</strong> agent.</p><p>If you received this, email delivery is working! ✅</p><p>— ClawOps</p>'
  });

  console.log('Status:', email.status);
  console.log('Response:', JSON.stringify(email.data, null, 2));
})().catch(e => console.error('Error:', e.message));
