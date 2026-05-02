import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';

/**
 * JWT Authentication Middleware para Hono
 * 
 * Verifica token JWT no header Authorization: Bearer <token>
 * Extrai userId, workspaceId e role para uso nos handlers
 */

export interface AuthenticatedRequest {
  userId?: string;
  workspaceId?: string;
  role?: string;
  email?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Middleware de autenticação opcional
 * Tenta validar token mas continua mesmo se falhar
 */
export async function optionalAuth(c: Context, next: Next): Promise<void> {
  const authHeader = c.req.header('Authorization');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      c.set('userId', decoded.userId);
      c.set('workspaceId', decoded.workspaceId);
      c.set('role', decoded.role);
      c.set('email', decoded.email);
      c.set('authenticated', true);
    } catch (error) {
      c.set('authenticated', false);
    }
  } else {
    c.set('authenticated', false);
  }

  await next();
}

/**
 * Middleware de autenticação obrigatória
 * Retorna 401 se token for inválido ou ausente
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    if (!decoded.userId) {
      return c.json({ error: 'UNAUTHORIZED', message: 'Invalid token payload' }, 401);
    }

    c.set('userId', decoded.userId);
    c.set('workspaceId', decoded.workspaceId);
    c.set('role', decoded.role);
    c.set('email', decoded.email);
    c.set('authenticated', true);

    await next();
  } catch (error) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' }, 401);
  }
}

/**
 * Helper para extrair contexto de autenticação do Context
 */
export function getAuthContext(c: Context): AuthenticatedRequest {
  return {
    userId: c.get('userId'),
    workspaceId: c.get('workspaceId'),
    role: c.get('role'),
    email: c.get('email'),
  };
}

/**
 * Helper para verificar se tem permissão (role-based)
 */
export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const userRole = c.get('role');

    if (!userRole || !roles.includes(userRole)) {
      return c.json(
        { error: 'FORBIDDEN', message: 'Insufficient permissions' },
        403
      );
    }

    await next();
  };
}

/**
 * Helper para gerar token JWT
 */
export function generateToken(payload: {
  userId: string;
  workspaceId: string;
  role?: string;
  email?: string;
}): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

/**
 * Helper para validar token manualmente
 */
export function validateToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}
