import express, { Response } from 'express';
import { query } from './db';
import { authenticateToken, AuthenticatedRequest } from './middleware';

const router = express.Router();

/**
 * GET /api/tipsters
 * List all tipsters for the authenticated user.
 */
router.get('/', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await query(
      `SELECT id, user_id as "userId", name, platform, notes, color, created_at as "createdAt"
       FROM tipsters 
       WHERE user_id = $1 
       ORDER BY name ASC`,
      [userId]
    );
    return res.json(result.rows);
  } catch (err: any) {
    console.error('Error fetching tipsters:', err);
    return res.status(500).json({ error: 'Failed to retrieve tipsters.' });
  }
});

/**
 * POST /api/tipsters
 * Create a new tipster.
 */
router.post('/', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, platform, notes, color } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Tipster name is required.' });
    }

    const result = await query(
      `INSERT INTO tipsters (user_id, name, platform, notes, color)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, name) DO UPDATE SET 
         platform = EXCLUDED.platform,
         notes = EXCLUDED.notes,
         color = EXCLUDED.color
       RETURNING id, user_id as "userId", name, platform, notes, color, created_at as "createdAt"`,
      [userId, name.trim(), platform || '', notes || '', color || '#3b82f6']
    );

    return res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error('Error creating tipster:', err);
    return res.status(500).json({ error: 'Failed to create tipster.' });
  }
});

/**
 * PUT /api/tipsters/:id
 * Update an existing tipster.
 */
router.put('/:id', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const tipsterId = req.params.id;
    const { name, platform, notes, color } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Tipster name is required.' });
    }

    const result = await query(
      `UPDATE tipsters 
       SET name = $1, platform = $2, notes = $3, color = $4
       WHERE id = $5 AND user_id = $6
       RETURNING id, user_id as "userId", name, platform, notes, color, created_at as "createdAt"`,
      [name.trim(), platform || '', notes || '', color || '#3b82f6', tipsterId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tipster not found.' });
    }

    return res.json(result.rows[0]);
  } catch (err: any) {
    console.error('Error updating tipster:', err);
    return res.status(500).json({ error: 'Failed to update tipster.' });
  }
});

/**
 * DELETE /api/tipsters/:id
 * Delete a tipster.
 */
router.delete('/:id', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const tipsterId = req.params.id;

    await query('DELETE FROM tipsters WHERE id = $1 AND user_id = $2', [tipsterId, userId]);
    return res.json({ message: 'Tipster deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting tipster:', err);
    return res.status(500).json({ error: 'Failed to delete tipster.' });
  }
});

export default router;
