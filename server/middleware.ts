import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'betlogic_super_secret_session_token_key';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Express middleware to verify JSON Web Tokens (JWT) for authenticated requests.
 */
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access token is required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired access token.' });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
    };
    next();
  });
}
