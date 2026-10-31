import { RbacRole, RbacRule } from './types.ts';
import { rbacEngine } from './rbacEngine.ts';
import { staStore } from './staMockStore.ts';

export function generateOpenApiSpec(roleFilter?: string, reqHost?: string) {
  const host = reqHost || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}/proxy`;

  // Get active rules and roles
  const rules = rbacEngine.rules;
  const roles = rbacEngine.roles;

  let activeRole: RbacRole | undefined;
  if (roleFilter && roleFilter !== 'all') {
    activeRole = roles.find(r => r.id === roleFilter);
  }

  // Build tags
  const tags = [
    { name: 'Users', description: 'User lifecycle, account lock/unlock, password resets and profile management' },
    { name: 'Authenticators', description: 'MobilePASS+, Push OTP, Hardware tokens and FIDO2 authenticators' },
    { name: 'Applications', description: 'SSO application integrations (SAML 2.0, OIDC, agent-based)' },
    { name: 'Policies', description: 'Contextual conditional access rules and step-up MFA requirements' },
    { name: 'Audit', description: 'Raw tenant access logs and authentication activity stream' },
  ];

  // Build paths
  const paths: Record<string, Record<string, any>> = {};

  for (const rule of rules) {
    // Convert rule pathPattern (e.g. /api/v1/users/:userId/unlock) to OpenAPI path format (/api/v1/users/{userId}/unlock)
    const openApiPath = rule.pathPattern.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
    const method = rule.httpMethod.toLowerCase();

    // Check permissions
    const permittedRoles = roles.filter(
      r => r.permissions.includes('*') || r.permissions.includes(rule.requiredPermission)
    );

    const isPermittedForActiveRole = !activeRole || (
      activeRole.permissions.includes('*') || activeRole.permissions.includes(rule.requiredPermission)
    );

    // If roleFilter is active and caller asks to hide forbidden endpoints, we can flag or filter
    // We will include it with custom extension `x-permitted-roles` and `x-is-permitted`
    if (!paths[openApiPath]) {
      paths[openApiPath] = {};
    }

    // Extract path parameters
    const pathParams = Array.from(rule.pathPattern.matchAll(/:([a-zA-Z0-9_]+)/g)).map(m => ({
      name: m[1],
      in: 'path',
      required: true,
      description: `Identifier for the ${m[1]} in SafeNet Trusted Access`,
      schema: { type: 'string', example: m[1] === 'userId' ? 'usr_4821' : m[1] === 'appId' ? 'app_m365_sso' : 'pol_mfa_all_cloud' },
    }));

    // Build operation
    const operationId = `${method}_${rule.id}`;
    const op: Record<string, any> = {
      tags: [rule.category],
      summary: rule.name,
      description: `${rule.description}\n\n**Required RBAC Permission:** \`${rule.requiredPermission}\`\n\n**Authorized Roles:** ${permittedRoles.map(r => `\`${r.name}\``).join(', ')}`,
      operationId,
      parameters: [
        ...pathParams,
        {
          name: 'X-Correlation-ID',
          in: 'header',
          required: false,
          description: 'Optional client trace correlation ID (UUID). Returned in response and security audit logs.',
          schema: { type: 'string', example: 'req_01928374-9a1b-7c2d-8e3f' },
        },
      ],
      security: [
        { ApiKeyAuth: [rule.requiredPermission] },
        { OpenIdConnectBearer: [rule.requiredPermission] },
      ],
      'x-required-permission': rule.requiredPermission,
      'x-permitted-roles': permittedRoles.map(r => r.id),
      'x-permitted-role-names': permittedRoles.map(r => r.name),
      'x-is-permitted-for-role': isPermittedForActiveRole,
      responses: {
        '200': {
          description: 'Operation successful on SafeNet Trusted Access upstream.',
          headers: {
            'X-Correlation-ID': { schema: { type: 'string' }, description: 'Unique request trace ID' },
            'X-Proxy-Gateway': { schema: { type: 'string' }, description: 'Thales-STA-Granular-RBAC-Proxy/1.0' },
          },
          content: {
            'application/json': {
              schema: getSampleResponseSchema(rule),
            },
          },
        },
        '401': {
          description: 'Authentication Failed: Missing credentials or invalid token.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: { type: 'string', example: 'Unauthorized' },
                  code: { type: 'string', example: 'AUTH_FAILED' },
                  message: { type: 'string', example: 'authentication failed: missing credentials (provide X-API-Key header or Authorization: Bearer token)' },
                  correlationId: { type: 'string', example: 'req_01928374-9a1b-7c2d-8e3f' },
                },
              },
            },
          },
        },
        '403': {
          description: `Forbidden: Improper Rights. Caller lacks '${rule.requiredPermission}'.`,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: { type: 'string', example: 'Forbidden' },
                  code: { type: 'string', example: 'IMPROPER_RIGHTS' },
                  message: { type: 'string', example: 'Access denied: caller does not possess the granular permissions required for this SafeNet Trusted Access endpoint.' },
                  details: {
                    type: 'object',
                    properties: {
                      callerId: { type: 'string', example: 'sa_servicenow_helpdesk' },
                      requiredPermission: { type: 'string', example: rule.requiredPermission },
                      reason: { type: 'string', example: `improper rights: caller lacks required permission '${rule.requiredPermission}'` },
                    },
                  },
                },
              },
            },
          },
        },
        '409': {
          description: 'Conflict on Identity Provider side (e.g. duplicate username, email or serial number in STA).',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: { type: 'string', example: 'Conflict' },
                  errorCode: { type: 'string', example: 'STA-409-USER-EXISTS' },
                  message: { type: 'string', example: "User with email 'user@corp.com' already exists in SafeNet Trusted Access." },
                },
              },
            },
          },
        },
      },
    };

    // Add request body schemas for POST/PUT
    if (['post', 'put', 'patch'].includes(method)) {
      op.requestBody = {
        required: true,
        description: `Payload for ${rule.name}`,
        content: {
          'application/json': {
            schema: getSampleRequestBodySchema(rule),
          },
        },
      };
    }

    paths[openApiPath][method] = op;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Thales SafeNet Trusted Access (STA) Granular API Proxy',
      version: '1.0.0',
      description: `
### Overview
The **Thales SafeNet Trusted Access (STA) Granular RBAC API Proxy** mediates all API calls to the Thales STA Identity Provider.

By default, Thales STA API keys grant unrestricted tenant-wide administrator rights. This proxy enforces **least-privilege access control**, authenticating callers and verifying granular permissions before forwarding authorized calls over TLS to Thales STA with the master API credentials.

${activeRole ? `> 🎯 **Filtered View Active:** Currently showing permissions for role **${activeRole.name}** (\`${activeRole.id}\`). Endpoints requiring scopes outside this role will return \`403 Forbidden (IMPROPER_RIGHTS)\`.` : ''}

### Security & Authentication
Callers must authenticate using either:
1. **Service Account API Key**: \`X-API-Key: sta_proxy_sk_...\` (or \`Authorization: Bearer <key>\`)
2. **OpenID Connect (OIDC) JWT**: \`Authorization: Bearer <jwt>\` with role claims from your enterprise IdP.
      `,
      contact: {
        name: 'Enterprise Security Architecture',
        url: 'https://thalesdocs.com/sta/api/',
      },
      license: {
        name: 'Apache 2.0',
        url: 'https://www.apache.org/licenses/LICENSE-2.0.html',
      },
    },
    servers: [
      {
        url: baseUrl,
        description: 'Active Granular Proxy Gateway Endpoint',
      },
    ],
    tags,
    paths,
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Service Account API Key issued by proxy (e.g. sta_proxy_sk_...)',
        },
        OpenIdConnectBearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'OpenID Connect Bearer JWT token issued by corporate IdP (Okta, Keycloak, Ping, Entra ID)',
        },
      },
    },
  };
}

function getSampleRequestBodySchema(rule: RbacRule) {
  if (rule.id === 'rule_users_create') {
    return {
      type: 'object',
      required: ['username', 'email'],
      properties: {
        username: { type: 'string', example: 'elena.rostova' },
        email: { type: 'string', example: 'elena.rostova@enterprise.corp' },
        firstName: { type: 'string', example: 'Elena' },
        lastName: { type: 'string', example: 'Rostova' },
      },
    };
  }
  if (rule.id === 'rule_users_unlock') {
    return {
      type: 'object',
      properties: {
        reason: { type: 'string', example: 'Ticket INC-99023: User verified via security challenge' },
      },
    };
  }
  if (rule.id === 'rule_users_reset_pwd') {
    return {
      type: 'object',
      properties: {
        deliveryMethod: { type: 'string', enum: ['EMAIL', 'SMS'], example: 'EMAIL' },
      },
    };
  }
  if (rule.id === 'rule_tokens_assign') {
    return {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['MobilePASS+', 'PushOTP', 'HardwareToken', 'FIDO2_WebAuthn'], example: 'MobilePASS+' },
        policy: { type: 'string', example: 'DefaultPush' },
      },
    };
  }
  if (rule.id === 'rule_apps_create') {
    return {
      type: 'object',
      required: ['name', 'protocol'],
      properties: {
        name: { type: 'string', example: 'GitLab Enterprise' },
        protocol: { type: 'string', enum: ['SAML2', 'OIDC', 'AGENT'], example: 'SAML2' },
        loginUrl: { type: 'string', example: 'https://gitlab.enterprise.corp/users/auth/saml/callback' },
        assignedPolicy: { type: 'string', example: 'pol_mfa_all_cloud' },
      },
    };
  }
  if (rule.id === 'rule_policies_create') {
    return {
      type: 'object',
      required: ['name', 'riskThreshold'],
      properties: {
        name: { type: 'string', example: 'Strict Executive MFA' },
        description: { type: 'string', example: 'Require hardware token for all sensitive administrative apps' },
        enforceMfa: { type: 'boolean', example: true },
        allowedIpRanges: { type: 'array', items: { type: 'string' }, example: ['192.168.1.0/24', '10.0.0.0/8'] },
        riskThreshold: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], example: 'HIGH' },
      },
    };
  }
  return {
    type: 'object',
    properties: {
      metadata: { type: 'object' },
    },
  };
}

function getSampleResponseSchema(rule: RbacRule) {
  if (rule.category === 'Users') {
    if (rule.id === 'rule_users_list') {
      return {
        type: 'object',
        properties: {
          totalCount: { type: 'integer', example: 4 },
          users: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'usr_4821' },
                username: { type: 'string', example: 'marcus.vance' },
                email: { type: 'string', example: 'marcus.vance@enterprise.corp' },
                status: { type: 'string', example: 'ACTIVE' },
                authenticatorCount: { type: 'integer', example: 1 },
              },
            },
          },
        },
      };
    }
    if (rule.id === 'rule_users_unlock') {
      return {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'SUCCESS' },
          message: { type: 'string', example: "User account 'marcus.vance' (usr_4821) has been unlocked." },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'usr_4821' },
              username: { type: 'string', example: 'marcus.vance' },
              status: { type: 'string', example: 'ACTIVE' },
            },
          },
        },
      };
    }
  }
  if (rule.category === 'Authenticators') {
    return {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'PROVISIONED' },
        message: { type: 'string', example: 'New MobilePASS+ authenticator successfully assigned' },
        authenticator: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'tok_9821' },
            type: { type: 'string', example: 'MobilePASS+' },
            serialNumber: { type: 'string', example: 'MP-9941-K' },
            status: { type: 'string', example: 'ACTIVE' },
          },
        },
        activationUrl: { type: 'string', example: 'https://sta.safenetid.com/enroll/act_991823' },
      },
    };
  }
  return {
    type: 'object',
    properties: {
      message: { type: 'string', example: 'Operation completed successfully on Thales SafeNet Trusted Access' },
    },
  };
}
