/**
 * Approve all pending + send all approved in mgmt_outreach_queue
 */
const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ hostname: 'localhost', port: 3001, path, method, headers }, resp => {
      let raw = '';
      resp.on('data', c => raw += c);
      resp.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { resolve(raw); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  const auth = await req('POST', '/api/auth/login', { email: 'admin@clawops.local', password: 'changeme123' });
  const token = (auth.token && auth.token.token) ? auth.token.token : auth.token;
  console.log('Logged in');

  const before = await req('GET', '/api/mgmt-outreach/stats', null, token);
  console.log('\nQueue before:', JSON.stringify(before.stats));

  const approve = await req('POST', '/api/mgmt-outreach/approve-all', {}, token);
  console.log('Approved:', approve.approved, 'emails');

  console.log('Sending batch (this may take 30-60s for 50+ emails)...');
  const send = await req('POST', '/api/mgmt-outreach/send', {}, token);
  console.log('\n=== SEND RESULT ===');
  console.log('Sent:', send.sent);
  console.log('Failed:', send.failed);

  const after = await req('GET', '/api/mgmt-outreach/stats', null, token);
  console.log('\nQueue after:', JSON.stringify(after.stats));

  if (send.results) {
    const failed = (send.results || []).filter(r => r.success === false);
    if (failed.length > 0) {
      console.log('\nFailed sends:');
      failed.forEach(r => console.log(' ', r.email || r.company, '-', r.error));
    }
    const sent = (send.results || []).filter(r => r.success === true);
    if (sent.length > 0) {
      console.log('\nSuccessful sends (' + sent.length + '):');
      sent.slice(0, 10).forEach(r => console.log(' ', r.email || r.company));
      if (sent.length > 10) console.log('  ... and', sent.length - 10, 'more');
    }
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
