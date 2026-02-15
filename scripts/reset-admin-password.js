/**
 * Reset admin password to default
 */

require('dotenv').config({ path: '.env.local' });
const { initDatabase, run, get } = require('../server/db/connection');
const bcrypt = require('bcryptjs');

async function resetPassword() {
  console.log('\n🔑 Resetting admin password...\n');

  await initDatabase();

  const email = 'admin@clawops.local';
  const newPassword = 'changeme123';

  const user = get('SELECT id, email FROM users WHERE email = ?', [email]);

  if (!user) {
    console.error('❌ Admin user not found!');
    console.log('   Run: npm run seed');
    process.exit(1);
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 12);
  run('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

  console.log(`✅ Password reset for: ${email}`);
  console.log(`   New password: ${newPassword}`);
  console.log('\nYou can now login with:');
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${newPassword}\n`);
}

resetPassword().catch(console.error);
