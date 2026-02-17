import fs from 'fs';
import path from 'path';
import { db, Lead } from './db';
import { logger } from '../utils/logger';

export function exportToCSV(): string {
  const leads = db.getAllLeads();
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `leads_export_${timestamp}.csv`;
  const filepath = path.join(process.cwd(), filename);

  const headers = [
    'id', 'company_name', 'website', 'phone', 'primary_email',
    'contact_name', 'contact_title', 'contact_linkedin_url',
    'city', 'state', 'zip', 'number_of_hoas_managed',
    'source', 'signal_score', 'date_found', 'outreach_status'
  ];

  const csvContent = [
    headers.join(','),
    ...leads.map(lead =>
      headers.map(h => {
        const val = (lead as any)[h];
        if (val === null || val === undefined) return '';
        // Escape commas and quotes
        const str = String(val);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',')
    )
  ].join('\n');

  fs.writeFileSync(filepath, csvContent, 'utf8');
  logger.info(`Exported ${leads.length} leads to ${filename}`);
  return filepath;
}
