const http = require('http');
const fs = require('fs');

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

// Read digest via WSL
const { execSync } = require('child_process');
const digestContent = execSync('wsl.exe bash -c "cat /home/sjpilche/projects/openclaw-v1/workspaces/ai-tech-intelligence-brief/digest-2026-02-13.md"').toString();

(async () => {
  // Login
  const login = await req('POST', '/api/auth/login', null, {
    email: 'admin@clawops.local', password: 'changeme123'
  });
  let token = login.data.token;
  if (token && typeof token === 'object') token = token.token;
  if (!token) { console.log('Login failed'); return; }

  console.log('✅ Logged in');
  console.log('📄 Digest length:', digestContent.length, 'chars');

  // Send email
  const email = await req('POST', '/api/email/send', token, {
    to: 'steve.j.pilcher@gmail.com',
    subject: 'Daily Tech & AI Digest - 2026-02-13',
    body: digestContent,
    html: `<pre style="font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word;">${digestContent}</pre>`
  });

  console.log('📧 Email status:', email.status);
  console.log('📧 Response:', JSON.stringify(email.data, null, 2));
})().catch(e => console.error('Error:', e));
