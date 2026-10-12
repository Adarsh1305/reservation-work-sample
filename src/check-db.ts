import { checkDatabase, pool } from './db.js';

try {
  const database = await checkDatabase();
  console.log('Connected to PostgreSQL:', database);
} catch (error) {
  console.error('Database connection failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
