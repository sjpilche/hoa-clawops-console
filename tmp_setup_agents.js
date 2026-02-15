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
  // Token is nested: {token: {token: "jwt...", expiresAt, expiresIn}}
  let token = login.data.token;
  if (token && typeof token === 'object') token = token.token;
  if (!token) { console.log('Login failed:', login.data); return; }
  console.log('Logged in OK\n');

  // Get current agents
  const list = await req('GET', '/api/agents', token);
  const agents = list.data.agents || [];
  console.log('Current agents:', agents.map(a => a.name).join(', '));

  // Delete dummy test agents
  for (const name of ['Daily Test Agent', 'E2E Test Bot']) {
    const agent = agents.find(a => a.name === name);
    if (agent) {
      console.log(`\nDeleting "${name}" (${agent.id})...`);
      const del = await req('DELETE', `/api/agents/${agent.id}`, token);
      console.log(`  Status: ${del.status}`, del.data.message || '');
    }
  }

  // Update "AI & Tech Intelligence Brief" with proper config
  const techBrief = agents.find(a => a.name === 'AI & Tech Intelligence Brief');
  if (techBrief) {
    console.log(`\nUpdating "AI & Tech Intelligence Brief" (${techBrief.id})...`);

    const soulDoc = `# Daily Tech & AI Digest Agent

You are a tech journalist and research analyst. Each day, your job is to find the most interesting and impactful stories in technology and artificial intelligence, then compose a compelling, well-written digest that's enjoyable to read.

## Your Process

1. **Search**: Navigate to major tech news sources to find today's top stories:
   - Hacker News (news.ycombinator.com) — top stories
   - TechCrunch (techcrunch.com) — latest articles
   - The Verge (theverge.com) — tech section
   - Ars Technica (arstechnica.com) — latest
   - Any AI-specific sources you find interesting

2. **Curate**: Select the 3-5 most interesting/impactful stories

3. **Compose**: Write a digest article that:
   - Opens with a brief "What Happened Today" summary (2-3 sentences)
   - Covers each story with context and why it matters
   - Includes your analysis of trends and implications
   - Ends with a "What to Watch" section for upcoming events/launches
   - Includes links to source articles

4. **Deliver**: Save the digest as a markdown file in your workspace

## Writing Style

- Conversational but informed — like a smart friend catching you up over coffee
- Focus on "why it matters" not just "what happened"
- Include relevant links to source articles
- Keep it under 1000 words — respect the reader's time
- Use markdown formatting for readability

## Topics of Interest

- AI/ML breakthroughs, product launches, and policy changes
- Developer tools and programming language developments
- Startup funding rounds, acquisitions, and notable launches
- Open source projects and community news
- Cybersecurity incidents and privacy developments
- Cloud infrastructure and DevOps innovations`;

    const taskMessage = `Search the web for today's most interesting tech and AI news. Visit at least 3 major news sources (Hacker News, TechCrunch, The Verge, Ars Technica, or similar). Select the top 3-5 stories of the day. Then compose a well-written daily digest article in markdown format covering what happened and why it matters. Save the digest as a markdown file named "digest-YYYY-MM-DD.md" in your workspace.`;

    const update = await req('PUT', `/api/agents/${techBrief.id}`, token, {
      name: 'Daily Tech & AI Digest',
      description: 'Searches top tech news sources daily, curates the most interesting stories, and composes a well-written digest article.',
      target_system: 'Web Browser',
      permissions: 'read-only',
      instructions: soulDoc,
      config: {
        soul_enabled: true,
        task: {
          message: taskMessage,
          schedule: {
            enabled: true,
            type: 'daily',
            time: '07:00',
            timezone: 'America/New_York',
            cron: '0 7 * * *'
          }
        }
      }
    });
    console.log(`  Status: ${update.status}`, update.data.message || update.data.error || '');
  }

  // Verify
  const finalList = await req('GET', '/api/agents', token);
  const finalAgents = finalList.data.agents || [];
  console.log('\n--- Final Agent List ---');
  finalAgents.forEach(a => {
    let cfg = {};
    try { cfg = typeof a.config === 'string' ? JSON.parse(a.config) : (a.config || {}); } catch(e) {}
    console.log(`  ${a.name} | openclaw: ${cfg.openclaw_id || 'NONE'} | scheduled: ${cfg.task?.schedule?.enabled || false}`);
  });
})().catch(e => console.error(e));
