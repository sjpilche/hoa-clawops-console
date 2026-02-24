const { getPipelineStats } = require('../server/services/googleMapsDiscovery');
getPipelineStats().then(s => {
  console.log('totalCommunities:', s.totalCommunities);
  s.geoTargets.forEach(g => {
    const swept = g.last_sweep_at ? g.last_sweep_at.substring(0,10) : 'pending';
    if (g.community_count > 0 || swept !== 'pending') {
      console.log(' ', g.name.padEnd(24), '| HOAs:', String(g.community_count).padStart(4), '|', swept);
    }
  });
  const pending = s.geoTargets.filter(g => !g.last_sweep_at).length;
  console.log('  ...and', pending, 'markets pending');
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
