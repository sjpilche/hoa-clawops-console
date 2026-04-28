#!/usr/bin/env node
/**
 * reclassify-leads.js — Fix misrouted leads across domains
 *
 * The livempaint source dumped 5,177 property management leads into Jake (construction).
 * This script reclassifies them using company name + contact title rules.
 *
 * Usage:
 *   node scripts/reclassify-leads.js --dry-run     # Preview only
 *   node scripts/reclassify-leads.js --yes          # Execute without confirmation
 *   node scripts/reclassify-leads.js                # Execute with confirmation
 */

const { initDatabase, all, run, get } = require('../server/db/connection');
const readline = require('readline');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_CONFIRM = args.includes('--yes');

// ── Workspace IDs ──
const WORKSPACE = { jake: 1, hoa: 2, owen: 3, cfo: 3, 'data-rehab': 4 };

// ── Classification rules ──
const CONSTRUCTION_PATTERNS = {
  company: [
    /construct/i, /\bbuilder/i, /contractor/i, /\belectric/i, /\bplumb/i,
    /roofing/i, /\bHVAC\b/i, /mechanical/i, /paving/i, /excavat/i,
    /drywall/i, /concrete/i, /\bsteel\b/i, /mason/i, /demolition/i,
    /framing/i, /insulation/i, /renovation/i, /remodel/i, /\bGC\b/,
    /general\s+contract/i, /carpentry/i, /welding/i, /\btile\b/i,
    /landscap/i, /fencing\s+(co|inc|llc)/i, /restoration/i,
    /fire\s+(protect|sprinkler)/i, /window.*install/i, /siding/i,
  ],
  title: [
    /\bCFO\b/i, /controller/i, /chief financial/i, /VP.*finance/i,
    /finance director/i, /accounting director/i,
  ],
};

const HOA_PM_PATTERNS = {
  company: [
    /\bHOA\b/i, /homeowner/i, /\bcondo\b/i, /\bassociation\b/i,
    /\bcommunity\b/i, /\bAssocia\b/i, /\bVesta\b/i, /RealManage/i,
    /Castle\s+Group/i, /FirstService/i, /First\s+Service/i, /management\s+group/i,
    /\bresidential\b/i, /\bSentry\b/i, /Cushman/i, /property\s+manage/i,
    /\bKW\s+Property/i, /Barkan/i, /\bCMC\b.*manage/i, /\bCAI\b/i,
    /Sterling.*manage/i, /Pinnacle.*manage/i, /tower.*manage/i,
    /\bapts?\b/i, /apartment/i, /\brealty\b/i, /real\s+estate/i,
    /\bproperty\s+services/i, /\bmanagement\s+(trust|alternative|co)/i,
  ],
  title: [
    /property\s+manager/i, /community\s+manager/i, /\bCAM\b/,
    /community\s+association/i, /board\s+(member|president|director)/i,
    /on[\s-]*site\s+(manager|contact)/i, /portfolio\s+manager/i,
    /regional\s+(manager|director)/i, /association\s+manager/i,
    /maintenance\s+(director|super)/i, /facilities/i,
  ],
};

function classify(lead) {
  const company = lead.company_name || '';
  const title = lead.contact_title || '';

  // Rule 1: Apollo-mined leads are construction (Jake)
  if (lead.source === 'apollo_miner') return 'jake';

  // Rule 2: Construction keywords → Jake
  if (CONSTRUCTION_PATTERNS.company.some(p => p.test(company))) return 'jake';
  if (CONSTRUCTION_PATTERNS.title.some(p => p.test(title))) return 'jake';

  // Rule 3: HOA/PM keywords → HOA
  if (HOA_PM_PATTERNS.company.some(p => p.test(company))) return 'hoa';
  if (HOA_PM_PATTERNS.title.some(p => p.test(title))) return 'hoa';

  // Rule 4: Default for livempaint source → HOA (95%+ are property mgmt)
  if (lead.source === 'livempaint') return 'hoa';

  // Rule 5: Data-rehab stays data-rehab
  if (lead.source_agent === 'data-rehab') return 'data-rehab';

  // Rule 6: CFO source_agent → all Jake (CFO was always construction finance)
  // Owen is for property management — no CFO-sourced leads belong there
  if (lead.source_agent === 'cfo') return 'jake';

  // Rule 7: Everything else stays where it is
  return lead.source_agent;
}

async function confirm(msg) {
  if (SKIP_CONFIRM || DRY_RUN) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${msg} (y/N) `, answer => { rl.close(); resolve(answer.toLowerCase() === 'y'); });
  });
}

async function main() {
  await initDatabase();
  console.log(DRY_RUN ? '\n=== DRY RUN ===' : '\n=== LEAD RECLASSIFICATION ===');

  // ── Step 1: Classify all leads ──
  const leads = all('SELECT id, company_name, contact_title, source, source_agent FROM cfo_leads');
  console.log(`Total leads: ${leads.length}`);

  const moves = { jake: [], hoa: [], owen: [], 'data-rehab': [] };
  const stays = { jake: 0, hoa: 0, owen: 0, 'data-rehab': 0 };
  const reclassifications = [];

  for (const lead of leads) {
    const newDomain = classify(lead);
    if (newDomain !== lead.source_agent) {
      reclassifications.push({ id: lead.id, company: lead.company_name, from: lead.source_agent, to: newDomain });
      moves[newDomain].push(lead.id);
    } else {
      stays[lead.source_agent] = (stays[lead.source_agent] || 0) + 1;
    }
  }

  // ── Step 2: Also reclassify Owen construction leads → Jake ──
  const owenLeads = all("SELECT id, company_name, contact_title, source FROM cfo_leads WHERE source_agent = 'owen'");
  // Owen's construction leads were already picked up by the classifier above (they'd classify as 'jake')

  // ── Report ──
  console.log('\n=== RECLASSIFICATION SUMMARY ===');
  console.log(`Staying in place: jake=${stays.jake || 0}, hoa=${stays.hoa || 0}, owen=${stays.owen || 0}, data-rehab=${stays['data-rehab'] || 0}`);
  console.log(`Moving to jake: ${moves.jake.length}`);
  console.log(`Moving to hoa: ${moves.hoa.length}`);
  console.log(`Moving to owen: ${moves.owen.length}`);
  console.log(`Moving to data-rehab: ${moves['data-rehab'].length}`);
  console.log(`Total reclassifications: ${reclassifications.length}`);

  // Final domain counts
  const finalCounts = {
    jake: (stays.jake || 0) + moves.jake.length,
    hoa: (stays.hoa || 0) + moves.hoa.length,
    owen: (stays.owen || 0) + moves.owen.length,
    'data-rehab': (stays['data-rehab'] || 0) + moves['data-rehab'].length,
  };
  console.log('\n=== FINAL DOMAIN COUNTS ===');
  Object.entries(finalCounts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // Show sample reclassifications
  console.log('\n=== SAMPLE MOVES (first 10) ===');
  reclassifications.slice(0, 10).forEach(r =>
    console.log(`  [${r.from} → ${r.to}] ${r.company}`)
  );

  if (DRY_RUN) { console.log('\nDry run complete. No changes made.'); process.exit(0); }

  // ── Step 3: Apply reclassifications ──
  const ok = await confirm(`\nReclassify ${reclassifications.length} leads?`);
  if (!ok) { console.log('Aborted.'); process.exit(0); }

  let updated = 0;
  for (const [domain, ids] of Object.entries(moves)) {
    if (ids.length === 0) continue;
    const wsId = WORKSPACE[domain];

    // sql.js doesn't handle parameterized IN (...) well — use individual updates
    for (const id of ids) {
      run(`UPDATE cfo_leads SET source_agent = ?, workspace_id = ?, updated_at = datetime('now') WHERE id = ?`,
        [domain, wsId, id]);
    }
    updated += ids.length;
    console.log(`  Moved ${ids.length} leads to ${domain} (workspace_id=${wsId})`);
  }

  // ── Step 4: Cancel mismatched outreach sequences ──
  // Any draft/approved sequences for reclassified leads had wrong persona
  const reclassifiedIds = reclassifications.map(r => r.id);
  if (reclassifiedIds.length > 0) {
    let cancelled = 0;
    for (const id of reclassifiedIds) {
      const result = run(
        "UPDATE cfo_outreach_sequences SET status = 'cancelled' WHERE lead_id = ? AND status IN ('draft', 'approved', 'flagged')",
        [id]
      );
      cancelled += result.changes;
    }
    if (cancelled > 0) console.log(`  Cancelled ${cancelled} mismatched outreach sequences`);
  }

  // ── Step 5: Align ALL workspace_ids ──
  for (const [slug, wsId] of Object.entries(WORKSPACE)) {
    run(`UPDATE cfo_leads SET workspace_id = ? WHERE source_agent = ? AND (workspace_id IS NULL OR workspace_id != ?)`,
      [wsId, slug, wsId]);
  }
  console.log('  Aligned all workspace_ids with source_agent');

  console.log(`\nDone. ${updated} leads reclassified.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
