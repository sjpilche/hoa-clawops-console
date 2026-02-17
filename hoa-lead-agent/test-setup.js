/**
 * Quick setup test - verifies all modules can be imported
 */

console.log('🧪 Testing HOA Lead Agent Setup...\n');

const checks = [];

// Check Node version
const nodeVersion = process.version;
const major = parseInt(nodeVersion.split('.')[0].substring(1));
checks.push({
  name: 'Node.js version',
  status: major >= 18 ? '✓' : '✗',
  detail: nodeVersion + (major >= 18 ? ' (OK)' : ' (Need 18+)'),
});

// Check required dependencies
const requiredDeps = [
  'puppeteer-extra',
  'better-sqlite3',
  'axios',
  'cheerio',
  'node-cron',
  'winston',
  'nodemailer',
  'typescript',
];

const packageJson = require('./package.json');
const installedDeps = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
};

requiredDeps.forEach((dep) => {
  checks.push({
    name: `Dependency: ${dep}`,
    status: installedDeps[dep] ? '✓' : '✗',
    detail: installedDeps[dep] || 'NOT INSTALLED',
  });
});

// Check directories
const fs = require('fs');
const path = require('path');

const requiredDirs = ['src', 'logs', 'exports'];
requiredDirs.forEach((dir) => {
  const exists = fs.existsSync(path.join(__dirname, dir));
  checks.push({
    name: `Directory: ${dir}/`,
    status: exists ? '✓' : '✗',
    detail: exists ? 'exists' : 'MISSING',
  });
});

// Check .env file
const hasEnv = fs.existsSync(path.join(__dirname, '.env'));
checks.push({
  name: '.env file',
  status: hasEnv ? '✓' : '⚠',
  detail: hasEnv ? 'configured' : 'Copy .env.example to .env',
});

// Print results
const maxNameLen = Math.max(...checks.map((c) => c.name.length));
checks.forEach((check) => {
  console.log(
    `${check.status} ${check.name.padEnd(maxNameLen + 2)} → ${check.detail}`
  );
});

const failed = checks.filter((c) => c.status === '✗').length;
const warnings = checks.filter((c) => c.status === '⚠').length;

console.log('\n' + '─'.repeat(60));
if (failed > 0) {
  console.log(`❌ ${failed} checks failed`);
  console.log('\nRun: npm install');
  process.exit(1);
} else if (warnings > 0) {
  console.log(`⚠️  ${warnings} warnings (setup not complete)`);
  console.log('\nNext steps:');
  console.log('  1. cp .env.example .env');
  console.log('  2. Edit .env with your API keys');
  console.log('  3. npm run dev\n');
} else {
  console.log('✅ All checks passed! Ready to run.\n');
  console.log('Start the agent:');
  console.log('  npm run dev    (development mode)');
  console.log('  npm start      (production mode)\n');
}
