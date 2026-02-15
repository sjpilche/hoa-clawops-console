/**
 * Reset admin password to default WITH VERIFICATION
 */

require('dotenv').config({ path: '.env.local' });
const { initDatabase, run, get } = require('../server/db/connection');
const bcrypt = require('bcryptjs');

async function resetPassword() {
  console.log('\n🔑 Resetting admin password WITH VERIFICATION...\n');

  await initDatabase();

  const email = 'admin@clawops.local';
  const newPassword = 'changeme123';

  // Check if user exists
  const user = get('SELECT id, email, password FROM users WHERE email = ?', [email]);

  if (!user) {
    console.error('❌ Admin user not found!');
    console.log('   Run: npm run seed');
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.email} (ID: ${user.id})`);
  console.log(`   Old password hash: ${user.password.substring(0, 20)}...`);

  // Generate new hash
  const hashedPassword = bcrypt.hashSync(newPassword, 12);
  console.log(`   New password hash: ${hashedPassword.substring(0, 20)}...`);

  // Verify the hash works BEFORE updating database
  const testMatch = bcrypt.compareSync(newPassword, hashedPassword);
  console.log(`   Hash verification test: ${testMatch ? '✅ PASS' : '❌ FAIL'}`);

  if (!testMatch) {
    console.error('❌ ERROR: New hash does not validate! Aborting.');
    process.exit(1);
  }

  // Update the database
  run('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);
  console.log('✅ Database updated');

  // Verify database update
  const updatedUser = get('SELECT id, email, password FROM users WHERE email = ?', [email]);
  const dbMatch = bcrypt.compareSync(newPassword, updatedUser.password);
  console.log(`   Database verification: ${dbMatch ? '✅ PASS' : '❌ FAIL'}`);

  if (!dbMatch) {
    console.error('❌ ERROR: Database password does not validate!');
    process.exit(1);
  }

  console.log(`\n✅✅✅ Password reset SUCCESSFUL for: ${email}`);
  console.log(`   Password: ${newPassword}`);
  console.log('\nYou can now login with:');
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${newPassword}\n`);
}

resetPassword().catch(console.error);
