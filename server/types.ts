export type AuthType = 'SERVICE_ACCOUNT' | 'OIDC_BEARER' | 'CLIENT_CREDENTIALS' | 'ANONYMOUS';

export type ActionStatus = 'SUCCESS' | 'FORBIDDEN' | 'AUTH_FAILED' | 'UPSTREAM_FAILED' | 'BAD_REQUEST';

export interface CallerIdentity {
  id: string; // e.g. "sa_servicenow" or "alice@company.com"
  name: string;
  type: AuthType;
  roles: string[];
  permissions: string[];
  tenant?: string;
  metadata?: Record<string, any>;
}

export interface RbacRule {
  id: string;
  name: string;
  description: string;
  httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | '*';
  pathPattern: string; // e.g. "/api/v1/users/:id/unlock" or "/api/v1/policies/*"
  requiredPermission: string; // e.g. "sta:users:unlock"
  category: 'Users' | 'Authenticators' | 'Applications' | 'Policies' | 'Groups' | 'Audit' | 'System' | 'Accounts';
}

export interface RbacRole {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
}

export interface ServiceAccount {
  id: string;
  name: string;
  description: string;
  apiKey: string; // hashed or token string
  roles: string[];
  status: 'active' | 'revoked';
  createdAt: string;
  lastUsedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  correlationId: string;
  userId: string;
  clientName: string;
  authType: AuthType;
  authSuccess: boolean;
  authFailureReason: string | null;
  action: string; // e.g. "users.unlock"
  actionCategory: 'Users' | 'Authenticators' | 'Applications' | 'Policies' | 'Groups' | 'Audit' | 'System' | 'Accounts';
  httpMethod: string;
  endpoint: string;
  actionStatus: ActionStatus;
  rejectionReason: string | null; // e.g. "improper rights: missing permission 'sta:policies:delete'" or "action failed on identity provider side: STA returned 409 User Exists"
  upstreamStatusCode: number | null;
  latencyMs: number;
  clientIp: string;
  userAgent: string;
  requestPayloadSummary?: string;
  responseSummary?: string;
}

export interface UpstreamStaConfig {
  mode: 'mock' | 'live';
  tenantId: string;
  apiBaseUrl: string; // e.g. "https://api.safenetid.com"
  masterApiKey: string; // The sensitive Thales STA master key that has full admin rights
  simulateUpstreamFailure?: 'none' | 'maintenance_503' | 'rate_limit_429' | 'internal_error_500';
  verifyTls: boolean;
}

export interface MockStaUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'LOCKED' | 'SUSPENDED';
  createdDate: string;
  authenticators: Array<{
    id: string;
    type: 'MobilePASS+' | 'PushOTP' | 'HardwareToken' | 'FIDO2_WebAuthn' | 'SMS_OTP';
    serialNumber: string;
    status: 'ACTIVE' | 'PROVISIONED' | 'REVOKED';
  }>;
}

export interface MockStaApplication {
  id: string;
  name: string;
  protocol: 'SAML2' | 'OIDC' | 'AGENT';
  loginUrl: string;
  status: 'ACTIVE' | 'INACTIVE';
  assignedPolicy: string;
}

export interface MockStaPolicy {
  id: string;
  name: string;
  description: string;
  enforceMfa: boolean;
  allowedIpRanges: string[];
  riskThreshold: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'ENABLED' | 'DISABLED';
}
