import { MockStaApplication, MockStaPolicy, MockStaUser, UpstreamStaConfig } from './types.ts';

class StaStore {
  public config: UpstreamStaConfig = {
    mode: 'mock',
    tenantId: 'STA-DEMO-TENANT-EU',
    apiBaseUrl: 'https://api.safenetid.com',
    masterApiKey: 'sta_master_secret_live_992184a7c134bf',
    simulateUpstreamFailure: 'none',
    verifyTls: true,
  };

  private users: MockStaUser[] = [];
  private applications: MockStaApplication[] = [];
  private policies: MockStaPolicy[] = [];
  private groups: Array<{ id: string; name: string; description: string; memberCount: number; members: string[] }> = [];

  constructor() {
    this.seedData();
  }

  public seedData() {
    this.users = [
      {
        id: 'usr_4821',
        username: 'marcus.vance',
        email: 'marcus.vance@enterprise.corp',
        firstName: 'Marcus',
        lastName: 'Vance',
        status: 'LOCKED',
        createdDate: '2026-02-14T09:12:00Z',
        authenticators: [
          {
            id: 'tok_mp_101',
            type: 'MobilePASS+',
            serialNumber: 'MP-8831-V',
            status: 'ACTIVE',
          },
        ],
      },
      {
        id: 'usr_102',
        username: 'clara.oswald',
        email: 'clara.oswald@enterprise.corp',
        firstName: 'Clara',
        lastName: 'Oswald',
        status: 'ACTIVE',
        createdDate: '2026-04-18T14:22:00Z',
        authenticators: [
          {
            id: 'tok_fido_402',
            type: 'FIDO2_WebAuthn',
            serialNumber: 'FEITIAN-ePass-FIDO2',
            status: 'ACTIVE',
          },
        ],
      },
      {
        id: 'usr_509',
        username: 'david.chen',
        email: 'david.chen@enterprise.corp',
        firstName: 'David',
        lastName: 'Chen',
        status: 'SUSPENDED',
        createdDate: '2026-06-01T11:05:00Z',
        authenticators: [
          {
            id: 'tok_push_301',
            type: 'PushOTP',
            serialNumber: 'PUSH-4491-C',
            status: 'REVOKED',
          },
        ],
      },
      {
        id: 'usr_714',
        username: 'aisha.patel',
        email: 'aisha.patel@enterprise.corp',
        firstName: 'Aisha',
        lastName: 'Patel',
        status: 'ACTIVE',
        createdDate: '2026-08-20T08:44:00Z',
        authenticators: [
          {
            id: 'tok_hw_919',
            type: 'HardwareToken',
            serialNumber: 'SN-OTP-881920',
            status: 'ACTIVE',
          },
          {
            id: 'tok_mp_920',
            type: 'MobilePASS+',
            serialNumber: 'MP-9941-K',
            status: 'ACTIVE',
          },
        ],
      },
    ];

    this.applications = [
      {
        id: 'app_m365_sso',
        name: 'Microsoft 365 Enterprise',
        protocol: 'SAML2',
        loginUrl: 'https://login.microsoftonline.com/login.srf',
        status: 'ACTIVE',
        assignedPolicy: 'pol_mfa_all_cloud',
      },
      {
        id: 'app_salesforce_crm',
        name: 'Salesforce CRM Production',
        protocol: 'SAML2',
        loginUrl: 'https://enterprise.my.salesforce.com',
        status: 'ACTIVE',
        assignedPolicy: 'pol_conditional_vpn',
      },
      {
        id: 'app_aws_console',
        name: 'AWS Management Console',
        protocol: 'OIDC',
        loginUrl: 'https://signin.aws.amazon.com/federation',
        status: 'ACTIVE',
        assignedPolicy: 'pol_mfa_strict_hardware',
      },
      {
        id: 'app_servicenow_itsm',
        name: 'ServiceNow ITSM Internal',
        protocol: 'SAML2',
        loginUrl: 'https://corp.service-now.com',
        status: 'ACTIVE',
        assignedPolicy: 'pol_mfa_all_cloud',
      },
    ];

    this.policies = [
      {
        id: 'pol_mfa_all_cloud',
        name: 'Default Cloud Apps Multi-Factor Policy',
        description: 'Requires MobilePASS+ or FIDO2 MFA for all external cloud access',
        enforceMfa: true,
        allowedIpRanges: ['0.0.0.0/0'],
        riskThreshold: 'MEDIUM',
        status: 'ENABLED',
      },
      {
        id: 'pol_mfa_strict_hardware',
        name: 'Privileged Console Hardware Token Policy',
        description: 'Strict hardware token or FIDO2 WebAuthn requirement for cloud admin consoles',
        enforceMfa: true,
        allowedIpRanges: ['10.0.0.0/8', '192.168.0.0/16'],
        riskThreshold: 'HIGH',
        status: 'ENABLED',
      },
      {
        id: 'pol_conditional_vpn',
        name: 'Internal Network Trusted Bypass',
        description: 'Step-up MFA only triggered when accessing from outside corporate SD-WAN',
        enforceMfa: false,
        allowedIpRanges: ['192.168.10.0/24', '10.200.0.0/16'],
        riskThreshold: 'LOW',
        status: 'ENABLED',
      },
    ];

    this.groups = [
      {
        id: 'grp_engineering',
        name: 'Engineering & DevOps',
        description: 'Core software engineering and infrastructure team',
        memberCount: 3,
        members: ['marcus.vance', 'clara.oswald', 'david.chen'],
      },
      {
        id: 'grp_it_helpdesk',
        name: 'IT Support & Helpdesk',
        description: 'Internal IT service desk tier 1 and tier 2 analysts',
        memberCount: 2,
        members: ['aisha.patel', 'clara.oswald'],
      },
      {
        id: 'grp_finance_execs',
        name: 'Executive & Finance Operations',
        description: 'Financial controllers and senior leadership',
        memberCount: 1,
        members: ['marcus.vance'],
      },
    ];
  }

  // STA Mock Operations
  public handleMockRequest(method: string, path: string, body?: any, query?: any): { status: number; body: any } {
    // Check if simulate upstream failure is active
    if (this.config.simulateUpstreamFailure === 'maintenance_503') {
      return {
        status: 503,
        body: {
          error: 'Service Unavailable',
          errorCode: 'STA-503-MAINTENANCE',
          message: 'SafeNet Trusted Access Cloud is undergoing scheduled maintenance.',
          timestamp: new Date().toISOString(),
        },
      };
    }
    if (this.config.simulateUpstreamFailure === 'rate_limit_429') {
      return {
        status: 429,
        body: {
          error: 'Too Many Requests',
          errorCode: 'STA-429-RATE-LIMIT',
          message: 'Tenant API rate limit exceeded (120 req/min). Please back off.',
          retryAfterSeconds: 30,
        },
      };
    }
    if (this.config.simulateUpstreamFailure === 'internal_error_500') {
      return {
        status: 500,
        body: {
          error: 'Internal Server Error',
          errorCode: 'STA-500-DATABASE-TIMEOUT',
          message: 'Upstream identity store communication timeout.',
        },
      };
    }

    // Clean path (remove /api/v1 or /proxy/api/v1 prefixes)
    const normalized = path.replace(/^\/proxy/, '');

    // 1. GET /api/v1/users (with query filters: status, search, limit, offset)
    if (method === 'GET' && normalized === '/api/v1/users') {
      let filtered = [...this.users];
      if (query?.status) {
        filtered = filtered.filter(u => u.status.toLowerCase() === String(query.status).toLowerCase());
      }
      if (query?.search) {
        const s = String(query.search).toLowerCase();
        filtered = filtered.filter(u =>
          u.username.toLowerCase().includes(s) ||
          u.email.toLowerCase().includes(s) ||
          u.firstName.toLowerCase().includes(s) ||
          u.lastName.toLowerCase().includes(s)
        );
      }
      const limit = query?.limit ? parseInt(String(query.limit), 10) : filtered.length;
      const offset = query?.offset ? parseInt(String(query.offset), 10) : 0;
      const paged = filtered.slice(offset, offset + limit);

      return {
        status: 200,
        body: {
          totalCount: filtered.length,
          users: paged.map(u => ({
            id: u.id,
            username: u.username,
            email: u.email,
            firstName: u.firstName,
            lastName: u.lastName,
            status: u.status,
            authenticatorCount: u.authenticators.length,
            createdDate: u.createdDate,
          })),
        },
      };
    }

    // 2. POST /api/v1/users (create user)
    if (method === 'POST' && normalized === '/api/v1/users') {
      const email = body?.email || '';
      const username = body?.username || email.split('@')[0];
      if (!email) {
        return {
          status: 400,
          body: {
            error: 'Bad Request',
            errorCode: 'STA-USER-VALIDATION',
            message: 'Email and username are required fields.',
          },
        };
      }
      // Check duplicate
      const exists = this.users.find(u => u.email.toLowerCase() === email.toLowerCase() || u.username.toLowerCase() === username.toLowerCase());
      if (exists) {
        return {
          status: 409,
          body: {
            error: 'Conflict',
            errorCode: 'STA-409-USER-EXISTS',
            message: `User with email '${email}' or username '${username}' already exists in SafeNet Trusted Access.`,
          },
        };
      }
      const newUser: MockStaUser = {
        id: `usr_${Math.floor(1000 + Math.random() * 9000)}`,
        username,
        email,
        firstName: body.firstName || 'New',
        lastName: body.lastName || 'User',
        status: 'ACTIVE',
        createdDate: new Date().toISOString(),
        authenticators: [],
      };
      this.users.push(newUser);
      return {
        status: 201,
        body: {
          message: 'User created successfully in Thales STA',
          user: newUser,
        },
      };
    }

    // 3. User sub-routes: /api/v1/users/:userId/*
    const unlockMatch = normalized.match(/^\/api\/v1\/users\/([^/]+)\/unlock$/);
    if (unlockMatch && method === 'POST') {
      const userId = unlockMatch[1];
      const user = this.users.find(u => u.id === userId || u.username === userId);
      if (!user) {
        return {
          status: 404,
          body: {
            error: 'Not Found',
            errorCode: 'STA-USER-NOT-FOUND',
            message: `User with ID '${userId}' not found in SafeNet Trusted Access.`,
          },
        };
      }
      user.status = 'ACTIVE';
      return {
        status: 200,
        body: {
          status: 'SUCCESS',
          message: `User account '${user.username}' (${user.id}) has been unlocked. Lockout counters cleared.`,
          user: {
            id: user.id,
            username: user.username,
            status: user.status,
          },
        },
      };
    }

    const resetPwdMatch = normalized.match(/^\/api\/v1\/users\/([^/]+)\/reset-password$/);
    if (resetPwdMatch && method === 'POST') {
      const userId = resetPwdMatch[1];
      const user = this.users.find(u => u.id === userId || u.username === userId);
      if (!user) {
        return {
          status: 404,
          body: {
            error: 'Not Found',
            errorCode: 'STA-USER-NOT-FOUND',
            message: `User '${userId}' not found.`,
          },
        };
      }
      return {
        status: 200,
        body: {
          status: 'SUCCESS',
          message: `Password reset instructions and self-service token dispatched to '${user.email}'.`,
          expiryMinutes: 15,
        },
      };
    }

    // Tokens sub-routes: GET/POST /api/v1/users/:userId/tokens
    const tokensMatch = normalized.match(/^\/api\/v1\/users\/([^/]+)\/tokens$/);
    if (tokensMatch) {
      const userId = tokensMatch[1];
      const user = this.users.find(u => u.id === userId || u.username === userId);
      if (!user) {
        return {
          status: 404,
          body: { error: 'Not Found', errorCode: 'STA-USER-NOT-FOUND', message: `User '${userId}' not found.` },
        };
      }
      if (method === 'GET') {
        return {
          status: 200,
          body: {
            userId: user.id,
            tokens: user.authenticators,
          },
        };
      }
      if (method === 'POST') {
        const type = body?.type || 'MobilePASS+';
        const newTok = {
          id: `tok_${Math.floor(1000 + Math.random() * 9000)}`,
          type: type as any,
          serialNumber: `MP-${Math.floor(1000 + Math.random() * 9000)}-${type.slice(0, 2).toUpperCase()}`,
          status: 'ACTIVE' as const,
        };
        user.authenticators.push(newTok);
        return {
          status: 201,
          body: {
            status: 'PROVISIONED',
            message: `New ${type} authenticator successfully assigned to '${user.username}'.`,
            authenticator: newTok,
            activationUrl: `https://sta.safenetid.com/enroll/act_${Math.random().toString(36).substring(7)}`,
          },
        };
      }
    }

    // Revoke token: DELETE /api/v1/users/:userId/tokens/:tokenId
    const revokeTokenMatch = normalized.match(/^\/api\/v1\/users\/([^/]+)\/tokens\/([^/]+)$/);
    if (revokeTokenMatch && method === 'DELETE') {
      const [, userId, tokenId] = revokeTokenMatch;
      const user = this.users.find(u => u.id === userId || u.username === userId);
      if (!user) {
        return { status: 404, body: { error: 'Not Found', message: `User '${userId}' not found.` } };
      }
      const tokIdx = user.authenticators.findIndex(t => t.id === tokenId);
      if (tokIdx === -1) {
        return { status: 404, body: { error: 'Not Found', message: `Token '${tokenId}' not assigned to user.` } };
      }
      user.authenticators.splice(tokIdx, 1);
      return {
        status: 200,
        body: {
          status: 'REVOKED',
          message: `Token '${tokenId}' successfully revoked from user '${user.username}'.`,
        },
      };
    }

    // Unlock token: POST /api/v1/users/:userId/tokens/:tokenId/unlock
    const unlockTokenMatch = normalized.match(/^\/api\/v1\/users\/([^/]+)\/tokens\/([^/]+)\/unlock$/);
    if (unlockTokenMatch && method === 'POST') {
      const [, userId, tokenId] = unlockTokenMatch;
      const user = this.users.find(u => u.id === userId || u.username === userId);
      if (!user) {
        return { status: 404, body: { error: 'Not Found', message: `User '${userId}' not found.` } };
      }
      const tok = user.authenticators.find(t => t.id === tokenId);
      if (!tok) {
        return { status: 404, body: { error: 'Not Found', message: `Token '${tokenId}' not assigned to user.` } };
      }
      tok.status = 'ACTIVE';
      return {
        status: 200,
        body: {
          status: 'SUCCESS',
          message: `Token '${tokenId}' (${tok.type}) unlocked successfully. PIN lockout counter reset to zero.`,
          token: tok,
        },
      };
    }

    // Single user: GET /api/v1/users/:userId
    const singleUserMatch = normalized.match(/^\/api\/v1\/users\/([^/]+)$/);
    if (singleUserMatch) {
      const userId = singleUserMatch[1];
      const user = this.users.find(u => u.id === userId || u.username === userId);
      if (!user) {
        return { status: 404, body: { error: 'Not Found', message: `User '${userId}' not found.` } };
      }
      if (method === 'GET') {
        return { status: 200, body: user };
      }
      if (method === 'PUT') {
        if (body?.firstName) user.firstName = body.firstName;
        if (body?.lastName) user.lastName = body.lastName;
        if (body?.status) user.status = body.status;
        return { status: 200, body: { message: 'User updated', user } };
      }
      if (method === 'DELETE') {
        this.users = this.users.filter(u => u.id !== user.id);
        return { status: 200, body: { message: `User '${user.username}' deleted permanently from STA.` } };
      }
    }

    // 4. Applications: /api/v1/applications
    if (normalized === '/api/v1/applications') {
      if (method === 'GET') {
        return {
          status: 200,
          body: { totalCount: this.applications.length, applications: this.applications },
        };
      }
      if (method === 'POST') {
        const newApp: MockStaApplication = {
          id: `app_${Math.random().toString(36).substring(2, 8)}`,
          name: body?.name || 'New Enterprise App',
          protocol: body?.protocol || 'SAML2',
          loginUrl: body?.loginUrl || 'https://sso.corp.com',
          status: 'ACTIVE',
          assignedPolicy: body?.assignedPolicy || 'pol_mfa_all_cloud',
        };
        this.applications.push(newApp);
        return { status: 201, body: { message: 'Application registered', application: newApp } };
      }
    }

    const singleAppMatch = normalized.match(/^\/api\/v1\/applications\/([^/]+)$/);
    if (singleAppMatch) {
      const appId = singleAppMatch[1];
      const app = this.applications.find(a => a.id === appId);
      if (!app) {
        return { status: 404, body: { error: 'Not Found', message: `Application '${appId}' not found.` } };
      }
      if (method === 'GET') return { status: 200, body: app };
      if (method === 'DELETE') {
        this.applications = this.applications.filter(a => a.id !== appId);
        return { status: 200, body: { message: `Application '${app.name}' removed.` } };
      }
    }

    // 5. Policies: /api/v1/policies
    if (normalized === '/api/v1/policies') {
      if (method === 'GET') {
        return { status: 200, body: { totalCount: this.policies.length, policies: this.policies } };
      }
      if (method === 'POST') {
        const newPol: MockStaPolicy = {
          id: `pol_${Math.random().toString(36).substring(2, 8)}`,
          name: body?.name || 'Custom Access Policy',
          description: body?.description || 'Custom conditional policy',
          enforceMfa: body?.enforceMfa ?? true,
          allowedIpRanges: body?.allowedIpRanges || ['0.0.0.0/0'],
          riskThreshold: body?.riskThreshold || 'MEDIUM',
          status: 'ENABLED',
        };
        this.policies.push(newPol);
        return { status: 201, body: { message: 'Policy created', policy: newPol } };
      }
    }

    const singlePolMatch = normalized.match(/^\/api\/v1\/policies\/([^/]+)$/);
    if (singlePolMatch) {
      const polId = singlePolMatch[1];
      const pol = this.policies.find(p => p.id === polId);
      if (!pol) {
        return { status: 404, body: { error: 'Not Found', message: `Policy '${polId}' not found.` } };
      }
      if (method === 'DELETE') {
        this.policies = this.policies.filter(p => p.id !== polId);
        return { status: 200, body: { message: `Policy '${pol.name}' deleted.` } };
      }
    }

    // 6. Groups: /api/v1/groups
    if (normalized === '/api/v1/groups') {
      if (method === 'GET') {
        return {
          status: 200,
          body: {
            totalCount: this.groups.length,
            groups: this.groups.map(g => ({
              id: g.id,
              name: g.name,
              description: g.description,
              memberCount: g.members.length,
            })),
          },
        };
      }
    }

    const singleGroupMatch = normalized.match(/^\/api\/v1\/groups\/([^/]+)$/);
    if (singleGroupMatch) {
      const groupId = singleGroupMatch[1];
      const group = this.groups.find(g => g.id === groupId);
      if (!group) {
        return { status: 404, body: { error: 'Not Found', message: `Group '${groupId}' not found.` } };
      }
      if (method === 'GET') {
        return { status: 200, body: group };
      }
    }

    const groupMembersMatch = normalized.match(/^\/api\/v1\/groups\/([^/]+)\/members$/);
    if (groupMembersMatch && method === 'POST') {
      const groupId = groupMembersMatch[1];
      const group = this.groups.find(g => g.id === groupId);
      if (!group) {
        return { status: 404, body: { error: 'Not Found', message: `Group '${groupId}' not found.` } };
      }
      const username = body?.username;
      if (!username) {
        return { status: 400, body: { error: 'Bad Request', message: 'Username is required.' } };
      }
      if (!group.members.includes(username)) {
        group.members.push(username);
        group.memberCount = group.members.length;
      }
      return {
        status: 200,
        body: {
          status: 'SUCCESS',
          message: `User '${username}' added to group '${group.name}'.`,
          group,
        },
      };
    }

    // 7. Logs: /api/v1/logs
    if (normalized === '/api/v1/logs' && method === 'GET') {
      return {
        status: 200,
        body: {
          tenantId: this.config.tenantId,
          source: 'Thales SafeNet Trusted Access Activity Stream',
          events: [
            { id: 'evt_991', timestamp: new Date(Date.now() - 3600000).toISOString(), event: 'AUTH_SUCCESS', user: 'clara.oswald', app: 'Microsoft 365', method: 'FIDO2_WebAuthn' },
            { id: 'evt_990', timestamp: new Date(Date.now() - 7200000).toISOString(), event: 'ACCOUNT_LOCKED', user: 'marcus.vance', app: 'Salesforce CRM', reason: 'Consecutive wrong PINs' },
          ],
        },
      };
    }

    // Default 404
    return {
      status: 404,
      body: {
        error: 'Not Found',
        message: `Endpoint '${normalized}' not implemented on SafeNet Trusted Access API.`,
      },
    };
  }

  public getTenantSummary() {
    return {
      config: this.config,
      userCount: this.users.length,
      lockedCount: this.users.filter(u => u.status === 'LOCKED').length,
      appCount: this.applications.length,
      policyCount: this.policies.length,
      groupCount: this.groups.length,
      rawUsers: this.users,
      rawApps: this.applications,
      rawPolicies: this.policies,
      rawGroups: this.groups,
    };
  }
}

export const staStore = new StaStore();
