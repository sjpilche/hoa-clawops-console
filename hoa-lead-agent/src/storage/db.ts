/**
 * @file db-simple.ts
 * @description Simple JSON-based storage (no SQLite compilation needed)
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export interface Lead {
  id?: number;
  company_name: string;
  website?: string;
  phone?: string;
  primary_email?: string;
  contact_name?: string;
  contact_title?: string;
  contact_linkedin_url?: string;
  city?: string;
  state?: string;
  zip?: string;
  number_of_hoas_managed?: number;
  source: string;
  signal_score: number;
  date_found: string;
  outreach_status: string;
}

class LeadDatabase {
  private dbPath: string;
  private leads: Lead[] = [];
  private nextId: number = 1;

  constructor(dbPath: string = path.join(process.cwd(), 'leads.json')) {
    this.dbPath = dbPath;
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
        this.leads = data.leads || [];
        this.nextId = data.nextId || 1;
        logger.info(`Loaded ${this.leads.length} leads from ${this.dbPath}`);
      } else {
        logger.info('No existing database found, starting fresh');
      }
    } catch (error: any) {
      logger.error(`Failed to load database: ${error.message}`);
      this.leads = [];
      this.nextId = 1;
    }
  }

  private save() {
    try {
      fs.writeFileSync(
        this.dbPath,
        JSON.stringify({ leads: this.leads, nextId: this.nextId }, null, 2),
        'utf8'
      );
    } catch (error: any) {
      logger.error(`Failed to save database: ${error.message}`);
    }
  }

  insertLead(lead: Partial<Lead>): { inserted: boolean; id?: number } {
    // Check for duplicate (same company_name + website)
    const existing = this.leads.find(
      (l) =>
        l.company_name === lead.company_name &&
        (lead.website ? l.website === lead.website : true)
    );

    if (existing) {
      // Update existing lead
      Object.assign(existing, {
        ...lead,
        id: existing.id,
      });
      this.save();
      return { inserted: false, id: existing.id };
    }

    // Insert new lead
    const newLead: Lead = {
      ...lead,
      id: this.nextId++,
      company_name: lead.company_name || '',
      source: lead.source || 'unknown',
      signal_score: lead.signal_score || 0,
      date_found: lead.date_found || new Date().toISOString().split('T')[0],
      outreach_status: lead.outreach_status || 'new',
    } as Lead;

    this.leads.push(newLead);
    this.save();
    return { inserted: true, id: newLead.id };
  }

  getAllLeads(): Lead[] {
    return this.leads;
  }

  getStats() {
    const total = this.leads.length;
    const highValue = this.leads.filter((l) => l.signal_score >= 8).length;

    const byState: Record<string, number> = {};
    this.leads.forEach((lead) => {
      if (lead.state) {
        byState[lead.state] = (byState[lead.state] || 0) + 1;
      }
    });

    return { total, highValue, byState };
  }
}

// Singleton instance
export const db = new LeadDatabase();
