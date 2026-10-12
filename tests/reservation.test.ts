import { describe, it, expect, beforeEach, afterAll } from 'vitest';

import { pool } from '../src/db.js';
import { reserve } from '../src/reserve.js';

describe('reserve()', () => {
  beforeEach(async () => {
    // Clear previous test results and reset stock.
    await pool.query('DELETE FROM reservation_requests');

    await pool.query(
      `INSERT INTO products (id, stock)
       VALUES ('p1', 5)
       ON CONFLICT (id)
       DO UPDATE SET stock = EXCLUDED.stock`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('reserves stock successfully', async () => {
    const result = await reserve({
      productId: 'p1',
      quantity: 2,
      idempotencyKey: 'success-001',
    });

    expect(result).toEqual({
      ok: true,
      productId: 'p1',
      quantity: 2,
      remainingStock: 3,
    });
  });

  it('returns the original result on retry', async () => {
    const input = {
      productId: 'p1',
      quantity: 2,
      idempotencyKey: 'retry-001',
    };

    const first = await reserve(input);
    const second = await reserve(input);

    expect(second).toEqual(first);

    const stock = await pool.query(
      "SELECT stock FROM products WHERE id = 'p1'",
    );

    expect(stock.rows[0].stock).toBe(3);
  });

  it('never oversells during concurrent reservations', async () => {
    await pool.query("UPDATE products SET stock = 1 WHERE id = 'p1'");

    const results = await Promise.all([
      reserve({
        productId: 'p1',
        quantity: 1,
        idempotencyKey: 'concurrent-a',
      }),
      reserve({
        productId: 'p1',
        quantity: 1,
        idempotencyKey: 'concurrent-b',
      }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);

    const stock = await pool.query(
      "SELECT stock FROM products WHERE id = 'p1'",
    );

    expect(stock.rows[0].stock).toBe(0);
  });

  it('remembers an out-of-stock result on retry', async () => {
    await pool.query("UPDATE products SET stock = 1 WHERE id = 'p1'");

    const input = {
      productId: 'p1',
      quantity: 2,
      idempotencyKey: 'failure-001',
    };

    const first = await reserve(input);

    expect(first).toEqual({
      ok: false,
      code: 'OUT_OF_STOCK',
    });

    // Stock becomes available, but the same key must replay
    // its original result.
    await pool.query("UPDATE products SET stock = 5 WHERE id = 'p1'");

    const retry = await reserve(input);

    expect(retry).toEqual(first);

    const stock = await pool.query(
      "SELECT stock FROM products WHERE id = 'p1'",
    );

    expect(stock.rows[0].stock).toBe(5);
  });

  it('rejects reuse of a key with different input', async () => {
    await reserve({
      productId: 'p1',
      quantity: 1,
      idempotencyKey: 'mismatch-001',
    });

    await expect(
      reserve({
        productId: 'p1',
        quantity: 2,
        idempotencyKey: 'mismatch-001',
      }),
    ).rejects.toThrow('Idempotency key reused with different input');

    const stock = await pool.query(
      "SELECT stock FROM products WHERE id = 'p1'",
    );

    expect(stock.rows[0].stock).toBe(4);
  });
});
