import crypto from 'crypto';
import { ALL_PERMISSIONS, INITIAL_ROLES, INITIAL_RULES, INITIAL_SERVICE_ACCOUNTS } from './rbacData.ts';
import { CallerIdentity, RbacRole, RbacRule, ServiceAccount } from './types.ts';

class RbacEngine {
  public roles: RbacRole[] = [...INITIAL_ROLES];
  public rules: RbacRule[] = [...INITIAL_RULES];
  public serviceAccounts: ServiceAccount[] = [...INITIAL_SERVICE_ACCOUNTS];
  public permissions = ALL_PERMISSIONS;

  // OpenID Connect configuration
  public oidcConfig = {
    enabled: true,
    issuer: 'https://auth.enterprise-corp.com/oauth2/v1',
    audience: 'https://api-proxy.enterprise-corp.com/sta',
    roleClaimPath: 'roles', // or 'groups'
  };

  /**
   * Authenticate incoming request credentials.
   * Supports:
   * 1. X-API-Key: <service_account_api_key>
   * 2. Authorization: Bearer <sa_key_or_oidc_jwt>
   */
  public authenticateCaller(headers: Record<string, string | string[] | undefined>): {
    success: boolean;
    identity?: CallerIdentity;
    failureReason?: string;
  } {
    const rawApiKey = (headers['x-api-key'] || headers['x-sta-proxy-key']) as string | undefined;
    const authHeader = (headers['authorization'] || headers['Authorization']) as string | undefined;

    let token = '';
    if (rawApiKey) {
      token = rawApiKey.trim();
    } else if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.substring(7).trim();
    }

    if (!token) {
      return {
        success: false,
        failureReason: 'authentication failed: missing credentials (provide X-API-Key header or Authorization: Bearer token)',
      };
    }

    // 1. Check Service Accounts
    const sa = this.serviceAccounts.find(s => s.apiKey === token);
    if (sa) {
      if (sa.status === 'revoked') {
        return {
          success: false,
          failureReason: `authentication failed: service account '${sa.name}' (${sa.id}) has been revoked`,
        };
      }

      // Update lastUsedAt
      sa.lastUsedAt = new Date().toISOString();

      // Aggregate permissions from assigned roles
      const userPermissions = this.resolvePermissionsForRoles(sa.roles);

      return {
        success: true,
        identity: {
          id: sa.id,
          name: sa.name,
          type: 'SERVICE_ACCOUNT',
          roles: sa.roles,
          permissions: userPermissions,
          metadata: { description: sa.description },
        },
      };
    }

    // 2. Check OpenID Connect JWT Bearer token
    if (token.startsWith('eyJ') || token.includes('.')) {
      const oidcResult = this.validateOidcToken(token);
      if (oidcResult.valid && oidcResult.identity) {
        return {
          success: true,
          identity: oidcResult.identity,
        };
      } else {
        return {
          success: false,
          failureReason: oidcResult.error || 'authentication failed: invalid OpenID Connect token',
        };
      }
    }

    return {
      success: false,
      failureReason: 'authentication failed: unrecognized service account key or malformed Bearer token',
    };
  }

  /**
   * Validate and decode OIDC JWT
   */
  private validateOidcToken(jwtString: string): { valid: boolean; identity?: CallerIdentity; error?: string } {
    try {
      const parts = jwtString.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'authentication failed: malformed JWT (expected 3 parts)' };
      }

      const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson);

      // Check Expiration
      if (payload.exp) {
        const nowSec = Math.floor(Date.now() / 1000);
        if (payload.exp < nowSec) {
          return { valid: false, error: `authentication failed: OIDC token expired at ${new Date(payload.exp * 1000).toISOString()}` };
        }
      }

      // Extract identity & roles
      const sub = payload.sub || payload.email || 'oidc_user';
      const name = payload.name || payload.preferred_username || sub;
      let assignedRoles: string[] = [];

      if (Array.isArray(payload.roles)) {
        assignedRoles = payload.roles;
      } else if (Array.isArray(payload.groups)) {
        assignedRoles = payload.groups;
      } else if (payload.realm_access?.roles && Array.isArray(payload.realm_access.roles)) {
        assignedRoles = payload.realm_access.roles;
      } else if (payload.role) {
        assignedRoles = [payload.role];
      }

      // If no valid roles found, default to user-self-service
      if (assignedRoles.length === 0) {
        assignedRoles = ['user-self-service'];
      }

      const userPermissions = this.resolvePermissionsForRoles(assignedRoles);

      return {
        valid: true,
        identity: {
          id: sub,
          name: `OIDC: ${name}`,
          type: 'OIDC_BEARER',
          roles: assignedRoles,
          permissions: userPermissions,
          metadata: {
            issuer: payload.iss,
            email: payload.email,
            clientId: payload.aud,
          },
        },
      };
    } catch (e: any) {
      return { valid: false, error: `authentication failed: failed to parse OIDC JWT payload: ${e.message}` };
    }
  }

  /**
   * Resolve all granular permissions from a list of role IDs
   */
  public resolvePermissionsForRoles(roleIds: string[]): string[] {
    const permSet = new Set<string>();
    for (const rId of roleIds) {
      const role = this.roles.find(r => r.id === rId);
      if (role) {
        role.permissions.forEach(p => permSet.add(p));
      }
    }
    return Array.from(permSet);
  }

  /**
   * Match HTTP method and path to configured RBAC Rules
   */
  public matchRule(method: string, path: string): RbacRule | null {
    // Normalize path (strip /proxy)
    const normalized = path.replace(/^\/proxy/, '');

    for (const rule of this.rules) {
      // Check HTTP method
      if (rule.httpMethod !== '*' && rule.httpMethod.toUpperCase() !== method.toUpperCase()) {
        continue;
      }

      // Convert rule pathPattern (e.g. /api/v1/users/:userId/unlock) to regex
      const regexPattern = rule.pathPattern
        .replace(/:[a-zA-Z0-9_]+/g, '[^/]+')
        .replace(/\*/g, '.*');

      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(normalized)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Evaluate whether a caller identity has rights to execute a request
   */
  public evaluateAuthorization(identity: CallerIdentity, method: string, path: string): {
    allowed: boolean;
    rule: RbacRule | null;
    reason: string | null;
    actionName: string;
    category: RbacRule['category'];
  } {
    const rule = this.matchRule(method, path);

    // If no rule matches this endpoint in the zero-trust catalog
    if (!rule) {
      return {
        allowed: false,
        rule: null,
        reason: `improper rights: endpoint '${method} ${path}' is not permitted by zero-trust gateway policy`,
        actionName: 'unknown.action',
        category: 'System',
      };
    }

    const requiredPerm = rule.requiredPermission;

    // Check if caller has wildcard permission or the exact required permission
    const hasPermission = identity.permissions.includes('*') || identity.permissions.includes(requiredPerm);

    if (hasPermission) {
      return {
        allowed: true,
        rule,
        reason: null,
        actionName: rule.name.toLowerCase().replace(/\s+/g, '.'),
        category: rule.category,
      };
    }

    // Build clear human-readable rejection explanation
    const rolesStr = identity.roles.join(', ');
    return {
      allowed: false,
      rule,
      reason: `improper rights: caller has role(s) [${rolesStr}] which lacks required permission '${requiredPerm}' for ${rule.name}`,
      actionName: rule.name.toLowerCase().replace(/\s+/g, '.'),
      category: rule.category,
    };
  }

  /**
   * Generate a signed sample OIDC JWT for testing
   */
  public generateTestOidcToken(sub: string, name: string, roles: string[], expHours = 24): string {
    const header = { alg: 'RS256', typ: 'JWT', kid: 'sta-corp-key-2026' };
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.oidcConfig.issuer,
      aud: this.oidcConfig.audience,
      sub,
      name,
      email: sub.includes('@') ? sub : `${sub}@enterprise.corp`,
      roles,
      iat: nowSec,
      exp: nowSec + (expHours * 3600),
    };

    const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mockSig = crypto.createHmac('sha256', 'proxy_demo_secret').update(`${b64Header}.${b64Payload}`).digest('base64url');

    return `${b64Header}.${b64Payload}.${mockSig}`;
  }

  // Management methods for roles & service accounts
  public createServiceAccount(data: { name: string; description: string; roles: string[] }): ServiceAccount {
    const sa: ServiceAccount = {
      id: `sa_${data.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Math.random().toString(36).substring(2, 6)}`,
      name: data.name,
      description: data.description,
      apiKey: `sta_proxy_sk_${crypto.randomBytes(16).toString('hex')}`,
      roles: data.roles,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    this.serviceAccounts.push(sa);
    return sa;
  }

  public revokeServiceAccount(id: string): boolean {
    const sa = this.serviceAccounts.find(s => s.id === id);
    if (sa) {
      sa.status = 'revoked';
      return true;
    }
    return false;
  }

  public createRole(data: { id: string; name: string; description: string; permissions: string[] }): RbacRole {
    const role: RbacRole = {
      id: data.id,
      name: data.name,
      description: data.description,
      isSystem: false,
      permissions: data.permissions,
    };
    this.roles.push(role);
    return role;
  }

  public updateRole(id: string, data: { name?: string; description?: string; permissions?: string[] }): RbacRole | null {
    const role = this.roles.find(r => r.id === id);
    if (!role) return null;
    if (data.name) role.name = data.name;
    if (data.description) role.description = data.description;
    if (data.permissions) role.permissions = data.permissions;
    return role;
  }
}

export const rbacEngine = new RbacEngine();
