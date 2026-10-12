import { pool } from './db.js';

export type ReserveInput = {
  productId: string;
  quantity: number;
  idempotencyKey: string;
};

export type ReserveResult =
  | {
      ok: true;
      productId: string;
      quantity: number;
      remainingStock: number;
    }
  | {
      ok: false;
      code: 'OUT_OF_STOCK';
    };

export async function reserve(input: ReserveInput): Promise<ReserveResult> {
  const { productId, quantity, idempotencyKey } = input;

  if (
    !productId?.trim() ||
    !idempotencyKey?.trim() ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  ) {
    throw new Error('Invalid reservation input');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Claim the idempotency key.
    const claimed = await client.query(
      `INSERT INTO reservation_requests
         (idempotency_key, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING idempotency_key`,
      [idempotencyKey, productId, quantity],
    );

    if (claimed.rowCount === 0) {
      // This key already exists. Replay its original result.
      const existing = await client.query(
        `SELECT product_id, quantity, result
         FROM reservation_requests
         WHERE idempotency_key = $1`,
        [idempotencyKey],
      );

      const previous = existing.rows[0];

      if (!previous) {
        throw new Error('Could not resolve idempotency key');
      }

      if (previous.product_id !== productId || previous.quantity !== quantity) {
        throw new Error('Idempotency key reused with different input');
      }

      if (previous.result === null) {
        throw new Error('Reservation result is not finalized');
      }

      const result = previous.result as ReserveResult;

      await client.query('COMMIT');
      return result;
    }

    // Atomically reserve stock only when enough is available.
    const updated = await client.query(
      `UPDATE products
       SET stock = stock - $1
       WHERE id = $2 AND stock >= $1
       RETURNING stock`,
      [quantity, productId],
    );

    let result: ReserveResult;

    if (updated.rowCount === 0) {
      result = {
        ok: false,
        code: 'OUT_OF_STOCK',
      };
    } else {
      result = {
        ok: true,
        productId,
        quantity,
        remainingStock: updated.rows[0].stock,
      };
    }

    // Store the original success or failure result.
    await client.query(
      `UPDATE reservation_requests
       SET result = $1::jsonb
       WHERE idempotency_key = $2`,
      [JSON.stringify(result), idempotencyKey],
    );

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
