import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing from .env');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function checkDatabase() {
  const result = await pool.query('SELECT current_database() AS database');

  return result.rows[0].database as string;
}
