import { reserve } from './reserve.js';
import { pool } from './db.js';

try {
  const result = await reserve({
    productId: 'p1',
    quantity: 2,
    idempotencyKey: 'manual-test-001',
  });

  console.log('Reservation result:', result);

  const stock = await pool.query('SELECT stock FROM products WHERE id = $1', [
    'p1',
  ]);

  console.log('Remaining stock:', stock.rows[0].stock);
} catch (error) {
  console.error('Reservation failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
