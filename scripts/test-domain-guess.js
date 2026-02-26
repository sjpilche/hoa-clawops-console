/**
 * Quick test: verify findWebsiteDirect() doesn't return false-match domains.
 */
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Inline the updated function for quick testing
async function findWebsiteDirect(companyName) {
  const coreSlug = companyName
    .toLowerCase()
    .replace(/\b(corporation|incorporated|limited|company|llc|inc|corp|ltd|co\.?|&|and|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^[^a-z]+|[^a-z0-9]+$/g, '');

  const shortSlug = companyName
    .toLowerCase()
    .replace(/\b(corporation|incorporated|limited|company|llc|inc|corp|ltd|co\.?|&|and|the|construction|contractors|contracting|builder|builders|building|services|service|group|associates|enterprises|general|gc)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^[^a-z]+|[^a-z0-9]+$/g, '');

  console.log(`  coreSlug: "${coreSlug}"  shortSlug: "${shortSlug}"`);
  if (!coreSlug || coreSlug.length < 4) return null;

  const candidates = [
    coreSlug.length >= 5 ? `${coreSlug}.com` : null,
    shortSlug.length >= 4 && shortSlug !== coreSlug ? `${shortSlug}construction.com` : null,
    shortSlug.length >= 4 && shortSlug !== coreSlug ? `${shortSlug}contractors.com` : null,
    shortSlug.length >= 4 ? `${shortSlug}inc.com` : null,
    shortSlug.length >= 4 ? `${shortSlug}llc.com` : null,
  ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

  const boilerplate = new Set(['construction', 'contractors', 'contracting', 'building', 'builders',
    'builder', 'services', 'service', 'group', 'associates', 'enterprises', 'general',
    'company', 'corporation', 'incorporated', 'limited', 'llc', 'inc', 'corp', 'ltd', 'and', 'the']);
  const verifyWords = companyName.toLowerCase().split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length >= 4 && !boilerplate.has(w))
    .slice(0, 3);

  console.log(`  candidates: ${candidates.join(', ')}`);
  console.log(`  verifyWords: ${verifyWords.join(', ')}`);

  for (const domain of candidates) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://${domain}`, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
      clearTimeout(tid);
      if (res.ok || res.status === 405) {
        if (verifyWords.length > 0) {
          const textRes = await fetch(`https://${domain}`, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(6000) });
          const html = (await textRes.text()).toLowerCase();
          const isMatch = verifyWords.some(w => html.includes(w));
          console.log(`  HEAD ok: ${domain} | match: ${isMatch} | words found: ${verifyWords.filter(w => html.includes(w)).join(', ')}`);
          if (isMatch) return `https://${domain}`;
        } else {
          return `https://${domain}`;
        }
      }
    } catch (e) {
      console.log(`  ${domain}: ${e.message.slice(0, 50)}`);
    }
  }
  return null;
}

const testCases = [
  'Tampa Bay General Contractors',      // should NOT → tampabay.com
  'Best Construction Company, LLC',     // should NOT → best.com
  'Coelum Construction LLC',            // should NOT → coelum.com (Italian)
  'Kalin Construction Corp',            // SHOULD → kalinconstruction.com
  'Faros Construction Services',        // should try frosconstructionservices.com or foros.com?
  'Snyder Building Construction LLC',   // should try snyderbuildingconstruction.com
  'Colorado Construction & Restoration',// should try coloradoconstruction.com?
  'Lawrence Construction Co',           // should try lawrenceconstruction.com?
];

(async () => {
  for (const name of testCases) {
    console.log(`\n${name}:`);
    const result = await findWebsiteDirect(name);
    console.log(`  → ${result || 'NOT FOUND'}`);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\nDone.');
})();
