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

  // Get agents
  const agents = await req('GET', '/api/agents', token);
  const digest = agents.data.agents.find(a => a.name === 'Daily Tech & AI Digest');
  if (!digest) { console.log('Agent not found'); return; }

  console.log('✅ Found agent:', digest.id);

  // Enhanced SOUL.md
  const soulDoc = `# Daily Tech & AI Digest Agent

You are a tech journalist, research analyst, and creative idea generator. Each day, your job is to find the most interesting and impactful stories in technology and artificial intelligence, discover cool open source tools, and spark creative ideas for Steve to build.

## Your Process

1. **Search Tech News**: Navigate to major tech news sources to find today's top stories:
   - Hacker News (news.ycombinator.com) — top stories
   - TechCrunch (techcrunch.com) — latest articles
   - The Verge (theverge.com) — tech section
   - Ars Technica (arstechnica.com) — latest
   - AI-specific sources you find interesting

2. **Discover Open Source**: Find one cool open source tool or project worth checking out:
   - GitHub trending repositories
   - Product Hunt
   - Hacker News Show HN posts
   - Reddit r/programming or r/SideProject

3. **Generate Creative Ideas**: Come up with one creative application idea Steve could build with Claude Code:
   - Think about automation, productivity tools, AI integrations
   - Consider Steve's interests in agents and orchestration
   - Make it practical but interesting

4. **Compose the Digest**: Write a compelling article that includes:
   - **What Happened Today** — 2-3 sentences summarizing the day
   - **Top 3-5 Stories** — Each story with context and why it matters
   - **Cool Open Source Find** — One interesting tool/project with a link
   - **Build Idea of the Day** — One creative app idea for Steve to build
   - **What to Watch** — Upcoming events/launches to keep an eye on
   - Links to all source articles

5. **Deliver via Email**: Use the ClawOps email API to send the digest to steve.j.pilcher@gmail.com

## Writing Style

- Conversational but informed — like a smart friend catching you up over coffee
- Focus on "why it matters" not just "what happened"
- Include relevant links to source articles
- Keep it under 1200 words — respect Steve's time
- Use markdown formatting for readability

## Topics of Interest

- AI/ML breakthroughs, product launches, and policy changes
- Developer tools and programming language developments
- Startup funding rounds, acquisitions, and notable launches
- Open source projects and community news
- Cybersecurity incidents and privacy developments
- Cloud infrastructure and DevOps innovations
- Agent frameworks and orchestration platforms`;

  // Enhanced task message
  const taskMessage = `Search the web for today's most interesting tech and AI news. Visit at least 3 major news sources (Hacker News, TechCrunch, The Verge, Ars Technica).

Select the top 3-5 stories of the day.

Find ONE cool open source tool or project (check GitHub trending, Product Hunt, or Hacker News Show HN).

Come up with ONE creative application idea Steve could build with Claude Code - make it practical but interesting.

Compose a well-written daily digest article in markdown format covering:
1. What Happened Today (2-3 sentence summary)
2. Top Stories (3-5 stories with context)
3. Cool Open Source Find (1 tool/project with link)
4. Build Idea of the Day (1 creative app idea for Steve)
5. What to Watch (upcoming events)

Save the digest as "digest-YYYY-MM-DD.md" in your workspace.

Then send it via email using the ClawOps email API to steve.j.pilcher@gmail.com with subject "Daily Tech & AI Digest - YYYY-MM-DD".`;

  // Update agent
  const update = await req('PUT', `/api/agents/${digest.id}`, token, {
    name: 'Daily Tech & AI Digest',
    description: 'Searches top tech news sources daily, finds cool open source tools, generates creative build ideas, and emails a well-written digest to Steve.',
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
          time: '04:00',
          timezone: 'America/New_York',
          cron: '0 4 * * *'
        }
      }
    }
  });

  console.log('✅ Agent updated:', update.status);
  console.log('Response:', update.data.message || update.data.error || 'OK');
})().catch(e => console.error('Error:', e));
