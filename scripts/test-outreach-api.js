/**
 * Quick test: verify mgmt-outreach API is working + SendGrid configured
 */
const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(
      { hostname: 'localhost', port: 3001, path, method, headers },
      resp => {
        let raw = '';
        resp.on('data', c => raw += c);
        resp.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { resolve(raw); } });
      }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  // 1. Login
  const auth = await req('POST', '/api/auth/login', { email: 'admin@clawops.local', password: 'changeme123' });
  const token = (auth.token && auth.token.token) ? auth.token.token : auth.token;
  console.log('Login:', token ? 'OK' : 'FAILED');
  if (!token) { console.error('Auth response:', auth); process.exit(1); }

  // 2. Outreach stats
  const stats = await req('GET', '/api/mgmt-outreach/stats', null, token);
  console.log('\nOutreach Stats:');
  console.log('  SendGrid configured:', stats.sendgrid && stats.sendgrid.configured ? 'YES' : 'NO');
  console.log('  From:', stats.sendgrid && stats.sendgrid.from || 'n/a');
  console.log('  Contacts with email:', stats.stats && stats.stats.total_with_email || 0);
  console.log('  Queue status:', JSON.stringify(stats.stats || {}));

  // 3. Management pipeline stats
  const dash = await req('GET', '/api/mgmt-research/dashboard?limit=5', null, token);
  console.log('\nManagement Pipeline:');
  console.log('  Total companies:', dash.stats && dash.stats.total || 0);
  console.log('  Contacts pulled:', dash.stats && dash.stats.contacts || 0);
  console.log('  Reviews scanned:', dash.stats && dash.stats.scanned || 0);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
