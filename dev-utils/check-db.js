require('dotenv').config({ path: '.env.local' });

const { initDatabase, get, all } = require('./server/db/connection');

async function checkDB() {
  await initDatabase();

  console.log('Users in database:');
  const users = all('SELECT id, email, name, role FROM users');
  console.log(users);

  console.log('\nAgents in database:');
  const agents = all('SELECT id, name, description FROM agents');
  console.log(agents);

  process.exit(0);
}

checkDB();
