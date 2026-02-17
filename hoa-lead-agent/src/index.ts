/**
 * @file index.ts
 * @description Main orchestrator for HOA Management Company lead generation agent.
 * Runs all scrapers, enrichment, and notifications on a configurable cron schedule.
 */

import 'dotenv/config';
import cron from 'node-cron';
import { db, Lead } from './storage/db';
import { exportToCSV } from './storage/export';
import { syncLeadsToAzure, getAzureStats } from './storage/azureSync';
import { logger } from './utils/logger';
import { calculateSignalScore } from './utils/scorer';
import { sendSummaryEmail } from './notifications/email';

// Scrapers
import { scrapeGoogleMaps } from './scrapers/googleMaps';
import { scrapeBBB } from './scrapers/bbb';
import { scrapeLinkedIn } from './scrapers/linkedin';
import { scrapeStateLicensing } from './scrapers/stateLicensing';

// Enrichment
import { findEmailsByDomain } from './enrichment/hunter';
import { enrichWithClearbit } from './enrichment/clearbit';

// ─── Configuration ──────────────────────────────────────────────────────────
const TARGET_STATES = ['FL', 'CA', 'TX', 'GA', 'NC', 'AZ'];
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 */6 * * *'; // Every 6 hours
const ENABLE_EMAIL = process.env.ENABLE_EMAIL === 'true';
const MAX_LEADS_PER_RUN = parseInt(process.env.MAX_LEADS_PER_RUN || '100');

// ─── Main Orchestration ─────────────────────────────────────────────────────
async function runLeadGeneration() {
  const startTime = Date.now();
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('🚀 Starting HOA Lead Generation Run');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const stats = {
    totalFound: 0,
    newLeads: 0,
    updatedLeads: 0,
    enriched: 0,
    errors: 0,
  };

  try {
    // ─── Phase 1: Data Collection ───────────────────────────────────────────
    logger.info('📡 Phase 1: Data Collection');

    const allLeads: Partial<Lead>[] = [];

    // 1. Google Maps
    logger.info('  → Scraping Google Maps...');
    try {
      const gmLeads = await scrapeGoogleMaps(TARGET_STATES, MAX_LEADS_PER_RUN);
      allLeads.push(...gmLeads);
      logger.info(`    ✓ Google Maps: ${gmLeads.length} leads`);
    } catch (error: any) {
      logger.error(`    ✗ Google Maps error: ${error.message}`);
      stats.errors++;
    }

    // 2. BBB.org
    logger.info('  → Scraping BBB.org...');
    try {
      const bbbLeads = await scrapeBBB(TARGET_STATES, MAX_LEADS_PER_RUN);
      allLeads.push(...bbbLeads);
      logger.info(`    ✓ BBB: ${bbbLeads.length} leads`);
    } catch (error: any) {
      logger.error(`    ✗ BBB error: ${error.message}`);
      stats.errors++;
    }

    // 3. LinkedIn (optional - requires auth)
    if (process.env.LINKEDIN_EMAIL && process.env.LINKEDIN_PASSWORD) {
      logger.info('  → Scraping LinkedIn...');
      try {
        const liLeads = await scrapeLinkedIn(TARGET_STATES, MAX_LEADS_PER_RUN);
        allLeads.push(...liLeads);
        logger.info(`    ✓ LinkedIn: ${liLeads.length} leads`);
      } catch (error: any) {
        logger.error(`    ✗ LinkedIn error: ${error.message}`);
        stats.errors++;
      }
    } else {
      logger.warn('  ⚠ LinkedIn scraper skipped (no credentials)');
    }

    // 4. State Licensing
    logger.info('  → Scraping State Licensing databases...');
    try {
      const licenseLeads = await scrapeStateLicensing(TARGET_STATES, MAX_LEADS_PER_RUN);
      allLeads.push(...licenseLeads);
      logger.info(`    ✓ State Licensing: ${licenseLeads.length} leads`);
    } catch (error: any) {
      logger.error(`    ✗ State Licensing error: ${error.message}`);
      stats.errors++;
    }

    stats.totalFound = allLeads.length;
    logger.info(`\n📊 Total leads collected: ${stats.totalFound}`);

    if (allLeads.length === 0) {
      logger.warn('⚠ No leads collected - ending run');
      return stats;
    }

    // ─── Phase 2: Enrichment ────────────────────────────────────────────────
    logger.info('\n🔍 Phase 2: Enrichment');

    for (const lead of allLeads) {
      try {
        // Extract domain from website if available
        let domain = lead.website;
        if (domain) {
          domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        }

        // Hunter.io email enrichment
        if (domain && process.env.HUNTER_API_KEY) {
          try {
            const hunterData = await findEmailsByDomain(domain);
            if (hunterData.emails.length > 0) {
              lead.primary_email = hunterData.emails[0];
              logger.debug(`  ✓ Hunter enrichment: ${lead.company_name} → ${lead.primary_email}`);
            }
            if (hunterData.contacts.length > 0) {
              const contact = hunterData.contacts[0];
              lead.contact_name = contact.name;
              lead.contact_title = contact.title;
            }
            stats.enriched++;
          } catch (error: any) {
            logger.debug(`  ✗ Hunter error for ${domain}: ${error.message}`);
          }
        }

        // Clearbit enrichment
        if (domain && process.env.CLEARBIT_API_KEY) {
          try {
            const clearbitData = await enrichWithClearbit(domain);
            if (clearbitData.phone) lead.phone = clearbitData.phone;
            if (clearbitData.employeeCount) {
              // Estimate HOAs managed (1 per 10 employees)
              lead.number_of_hoas_managed = Math.floor(clearbitData.employeeCount / 10);
            }
            logger.debug(`  ✓ Clearbit enrichment: ${lead.company_name}`);
            stats.enriched++;
          } catch (error: any) {
            logger.debug(`  ✗ Clearbit error for ${domain}: ${error.message}`);
          }
        }

        // Calculate signal score
        lead.signal_score = calculateSignalScore(lead);

      } catch (error: any) {
        logger.error(`  ✗ Enrichment error for ${lead.company_name}: ${error.message}`);
        stats.errors++;
      }
    }

    logger.info(`  ✓ Enriched ${stats.enriched} leads`);

    // ─── Phase 3: Storage ───────────────────────────────────────────────────
    logger.info('\n💾 Phase 3: Storage');

    for (const lead of allLeads) {
      try {
        const result = db.insertLead(lead);
        if (result.inserted) {
          stats.newLeads++;
          logger.debug(`  + New lead: ${lead.company_name} (score: ${lead.signal_score})`);
        } else {
          stats.updatedLeads++;
          logger.debug(`  ~ Updated lead: ${lead.company_name}`);
        }
      } catch (error: any) {
        logger.error(`  ✗ DB error for ${lead.company_name}: ${error.message}`);
        stats.errors++;
      }
    }

    logger.info(`  ✓ Stored ${stats.newLeads} new + ${stats.updatedLeads} updated leads`);

    // ─── Phase 3.5: Azure SQL Sync ──────────────────────────────────────────
    logger.info('\n☁️  Phase 3.5: Azure SQL Sync');

    try {
      const azureStats = await syncLeadsToAzure(allLeads);
      logger.info(`  ✅ Azure: ${azureStats.synced} new | ${azureStats.updated} updated | ${azureStats.failed} failed`);

      // Get updated Azure stats
      const azureTotals = await getAzureStats();
      logger.info(`  📊 Azure DB: ${azureTotals.total} total | ${azureTotals.withEmail} with email | ${azureTotals.highValue} high-value`);
    } catch (error: any) {
      logger.error(`  ❌ Azure sync failed: ${error.message}`);
      logger.warn(`  ⚠️  Continuing without Azure sync...`);
    }

    // ─── Phase 4: Export ────────────────────────────────────────────────────
    logger.info('\n📤 Phase 4: Export');

    const exportPath = await exportToCSV();
    logger.info(`  ✓ CSV exported to: ${exportPath}`);

    // ─── Phase 5: Notification ──────────────────────────────────────────────
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const dbStats = db.getStats();

    logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`✅ Lead Generation Complete (${duration}s)`);
    logger.info(`   New: ${stats.newLeads} | Updated: ${stats.updatedLeads} | Errors: ${stats.errors}`);
    logger.info(`   Total DB: ${dbStats.total} leads | High-value: ${dbStats.highValue}`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (ENABLE_EMAIL) {
      try {
        await sendSummaryEmail({
          stats,
          dbStats,
          duration,
          exportPath,
        });
        logger.info('📧 Summary email sent');
      } catch (error: any) {
        logger.error(`📧 Email error: ${error.message}`);
      }
    }

  } catch (error: any) {
    logger.error(`💥 Fatal error: ${error.message}`);
    logger.error(error.stack);
    stats.errors++;
  }

  return stats;
}

// ─── Startup ────────────────────────────────────────────────────────────────
async function main() {
  logger.info('HOA Lead Generation Agent starting...');
  logger.info(`Cron schedule: ${CRON_SCHEDULE}`);
  logger.info(`Target states: ${TARGET_STATES.join(', ')}`);
  logger.info(`Email notifications: ${ENABLE_EMAIL ? 'enabled' : 'disabled'}\n`);

  // Run immediately on startup
  if (process.env.RUN_ON_STARTUP !== 'false') {
    await runLeadGeneration();
  }

  // Schedule cron
  cron.schedule(CRON_SCHEDULE, async () => {
    await runLeadGeneration();
  });

  logger.info(`\n⏰ Scheduled to run: ${CRON_SCHEDULE}`);
  logger.info('Agent is now running. Press Ctrl+C to stop.\n');
}

// ─── Error Handling ─────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// ─── Start ──────────────────────────────────────────────────────────────────
main().catch((error) => {
  logger.error('Fatal startup error:', error);
  process.exit(1);
});
