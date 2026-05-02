/**
 * Permissions
 *
 * Role-based permission model for Vigil agent actions.
 */

export type Role = 'admin' | 'developer' | 'viewer' | 'agent';

export type PermissionKey =
    | 'files:write'
    | 'files:delete'
    | 'commands:run'
    | 'commands:destructive'
    | 'agents:start'
    | 'agents:stop'
    | 'policies:modify'
    | 'data:export';

const ROLE_PERMISSIONS: Record<Role, Set<PermissionKey>> = {
    admin: new Set([
        'files:write',
        'files:delete',
        'commands:run',
        'commands:destructive',
        'agents:start',
        'agents:stop',
        'policies:modify',
        'data:export',
    ]),
    developer: new Set([
        'files:write',
        'files:delete',
        'commands:run',
        'agents:start',
        'agents:stop',
        'data:export',
    ]),
    agent: new Set([
        'files:write',
        'commands:run',
        'agents:start',
    ]),
    viewer: new Set([
        'data:export',
    ]),
};

export function hasPermission(role: Role, permission: PermissionKey): boolean {
    return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function requirePermission(role: Role, permission: PermissionKey): void {
    if (!hasPermission(role, permission)) {
        throw new Error(`Role '${role}' does not have permission: ${permission}`);
    }
}

export function permissionsFor(role: Role): PermissionKey[] {
    return Array.from(ROLE_PERMISSIONS[role] ?? []);
}
