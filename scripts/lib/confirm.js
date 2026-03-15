/**
 * Shared confirmation prompt for destructive scripts.
 * Usage: const { confirmOrDryRun } = require('./lib/confirm');
 *        const dryRun = await confirmOrDryRun('DELETE 50 leads', process.argv);
 *        if (dryRun) { console.log('DRY RUN — no changes made'); return; }
 *
 * Supports: --dry-run flag (shows what would happen, no changes)
 *           --yes flag (skip confirmation prompt)
 */
const readline = require('readline');

async function confirmOrDryRun(description, argv = []) {
  const isDryRun = argv.includes('--dry-run');
  const isYes = argv.includes('--yes') || argv.includes('-y');

  if (isDryRun) {
    console.log(`\n[DRY RUN] ${description}`);
    console.log('No changes will be made. Remove --dry-run to execute.\n');
    return true;
  }

  if (isYes) {
    console.log(`\n[AUTO-CONFIRMED] ${description}\n`);
    return false;
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\n⚠️  ${description}\nType YES to confirm: `, (answer) => {
      rl.close();
      if (answer.trim() !== 'YES') {
        console.log('Cancelled.');
        process.exit(0);
      }
      resolve(false);
    });
  });
}

module.exports = { confirmOrDryRun };
