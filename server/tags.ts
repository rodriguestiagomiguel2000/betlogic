import express, { Response } from 'express';
import { query } from './db';
import { authenticateToken, AuthenticatedRequest } from './middleware';

const router = express.Router();

/**
 * GET /api/tags
 * List all custom tag definitions for the authenticated user.
 */
router.get('/', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await query(
      `SELECT id, user_id as "userId", name, color, created_at as "createdAt"
       FROM tag_definitions 
       WHERE user_id = $1 
       ORDER BY name ASC`,
      [userId]
    );
    return res.json(result.rows);
  } catch (err: any) {
    console.error('Error fetching tags:', err);
    return res.status(500).json({ error: 'Failed to retrieve tags.' });
  }
});

/**
 * POST /api/tags
 * Create or ensure a tag definition.
 */
router.post('/', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, color } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Tag name is required.' });
    }

    const result = await query(
      `INSERT INTO tag_definitions (user_id, name, color)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, name) DO UPDATE SET color = EXCLUDED.color
       RETURNING id, user_id as "userId", name, color`,
      [userId, name, color || '#3b82f6']
    );

    return res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error('Error creating tag:', err);
    return res.status(500).json({ error: 'Failed to create tag.' });
  }
});

/**
 * DELETE /api/tags/:id
 * Delete a tag definition.
 */
router.delete('/:id', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const tagId = req.params.id;

    await query('DELETE FROM tag_definitions WHERE id = $1 AND user_id = $2', [tagId, userId]);
    return res.json({ message: 'Tag deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting tag:', err);
    return res.status(500).json({ error: 'Failed to delete tag.' });
  }
});

export default router;
