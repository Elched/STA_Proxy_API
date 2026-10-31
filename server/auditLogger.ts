import crypto from 'crypto';
import { AuditLogEntry } from './types.ts';

class AuditLogger {
  private logs: AuditLogEntry[] = [];
  private maxLogs: number = 2000;

  constructor() {
    this.seedInitialLogs();
  }

  private seedInitialLogs() {
    const now = Date.now();
    const sampleEntries: Omit<AuditLogEntry, 'id'>[] = [
      {
        timestamp: new Date(now - 1000 * 60 * 18).toISOString(),
        correlationId: 'req_01928374-9a1b-7c2d-8e3f-4a5b6c7d8e9f',
        userId: 'sa_servicenow_helpdesk',
        clientName: 'ServiceNow ITSM Bot',
        authType: 'SERVICE_ACCOUNT',
        authSuccess: true,
        authFailureReason: null,
        action: 'users.unlock',
        actionCategory: 'Users',
        httpMethod: 'POST',
        endpoint: '/api/v1/users/usr_4821/unlock',
        actionStatus: 'SUCCESS',
        rejectionReason: null,
        upstreamStatusCode: 200,
        latencyMs: 42,
        clientIp: '192.168.10.45',
        userAgent: 'ServiceNow-Outbound-Integration/2.1',
        requestPayloadSummary: '{"reason": "Ticket INC-99023 unlocked by Tier 1 analyst"}',
        responseSummary: '{"status": "SUCCESS", "message": "User account usr_4821 unlocked"}',
      },
      {
        timestamp: new Date(now - 1000 * 60 * 14).toISOString(),
        correlationId: 'req_01928374-b2c3-4d5e-6f7a-8b9c0d1e2f3a',
        userId: 'sa_servicenow_helpdesk',
        clientName: 'ServiceNow ITSM Bot',
        authType: 'SERVICE_ACCOUNT',
        authSuccess: true,
        authFailureReason: null,
        action: 'policies.delete',
        actionCategory: 'Policies',
        httpMethod: 'DELETE',
        endpoint: '/api/v1/policies/pol_mfa_executives',
        actionStatus: 'FORBIDDEN',
        rejectionReason: "improper rights: caller role 'helpdesk-operator' lacks required permission 'sta:policies:delete'",
        upstreamStatusCode: null,
        latencyMs: 4,
        clientIp: '192.168.10.45',
        userAgent: 'ServiceNow-Outbound-Integration/2.1',
        requestPayloadSummary: '',
        responseSummary: '{"error": "Forbidden", "code": "IMPROPER_RIGHTS"}',
      },
      {
        timestamp: new Date(now - 1000 * 60 * 9).toISOString(),
        correlationId: 'req_01928374-c3d4-5e6f-7a8b-9c0d1e2f3a4b',
        userId: 'anonymous_caller',
        clientName: 'Unknown External Service',
        authType: 'ANONYMOUS',
        authSuccess: false,
        authFailureReason: 'authentication failed: missing or invalid credentials (expected X-API-Key or Bearer token)',
        action: 'users.read',
        actionCategory: 'Users',
        httpMethod: 'GET',
        endpoint: '/api/v1/users',
        actionStatus: 'AUTH_FAILED',
        rejectionReason: 'authentication failed: missing or invalid credentials',
        upstreamStatusCode: null,
        latencyMs: 2,
        clientIp: '203.0.113.88',
        userAgent: 'curl/8.1.2',
        requestPayloadSummary: '',
        responseSummary: '{"error": "Unauthorized", "code": "AUTH_FAILED"}',
      },
      {
        timestamp: new Date(now - 1000 * 60 * 5).toISOString(),
        correlationId: 'req_01928374-d4e5-6f7a-8b9c-0d1e2f3a4b5c',
        userId: 'sa_workday_hr',
        clientName: 'Workday HR Lifecycle Sync',
        authType: 'SERVICE_ACCOUNT',
        authSuccess: true,
        authFailureReason: null,
        action: 'users.create',
        actionCategory: 'Users',
        httpMethod: 'POST',
        endpoint: '/api/v1/users',
        actionStatus: 'UPSTREAM_FAILED',
        rejectionReason: 'the action has failed on the identity provider side: STA returned HTTP 409 Conflict: user with email "sarah.connor@corp.internal" already exists',
        upstreamStatusCode: 409,
        latencyMs: 78,
        clientIp: '10.50.0.12',
        userAgent: 'Workday-Enterprise-Connect/4.0',
        requestPayloadSummary: '{"username": "sconnor", "email": "sarah.connor@corp.internal", "firstName": "Sarah"}',
        responseSummary: '{"error": "Conflict", "message": "User with email already exists in SafeNet Trusted Access"}',
      },
      {
        timestamp: new Date(now - 1000 * 60 * 2).toISOString(),
        correlationId: 'req_01928374-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        userId: 'elena.rostova@enterprise.corp',
        clientName: 'OIDC: Elena Rostova (Helpdesk Lead)',
        authType: 'OIDC_BEARER',
        authSuccess: true,
        authFailureReason: null,
        action: 'tokens.assign',
        actionCategory: 'Authenticators',
        httpMethod: 'POST',
        endpoint: '/api/v1/users/usr_102/tokens',
        actionStatus: 'SUCCESS',
        rejectionReason: null,
        upstreamStatusCode: 201,
        latencyMs: 65,
        clientIp: '172.16.4.19',
        userAgent: 'Internal-Helpdesk-Portal/1.8 (Browser)',
        requestPayloadSummary: '{"type": "MobilePASS+", "policy": "DefaultPush"}',
        responseSummary: '{"tokenId": "tok_mp_9918", "serialNumber": "MP-9918-X", "status": "PROVISIONED"}',
      },
    ];

    this.logs = sampleEntries.map(e => ({
      id: crypto.randomUUID(),
      ...e,
    }));
  }

  public record(entry: Omit<AuditLogEntry, 'id'>): AuditLogEntry {
    const fullEntry: AuditLogEntry = {
      id: crypto.randomUUID(),
      ...entry,
    };
    this.logs.unshift(fullEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    return fullEntry;
  }

  public getAll(): AuditLogEntry[] {
    return this.logs;
  }

  public query(filters: {
    status?: string;
    userId?: string;
    category?: string;
    query?: string;
    limit?: number;
    offset?: number;
  }): { items: AuditLogEntry[]; total: number } {
    let result = [...this.logs];

    if (filters.status && filters.status !== 'ALL') {
      result = result.filter(log => log.actionStatus === filters.status);
    }

    if (filters.category && filters.category !== 'ALL') {
      result = result.filter(log => log.actionCategory === filters.category);
    }

    if (filters.userId) {
      const q = filters.userId.toLowerCase();
      result = result.filter(log => log.userId.toLowerCase().includes(q));
    }

    if (filters.query) {
      const q = filters.query.toLowerCase();
      result = result.filter(log =>
        log.endpoint.toLowerCase().includes(q) ||
        log.userId.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        (log.rejectionReason && log.rejectionReason.toLowerCase().includes(q)) ||
        log.correlationId.toLowerCase().includes(q)
      );
    }

    const total = result.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    const items = result.slice(offset, offset + limit);

    return { items, total };
  }

  public getStats() {
    const total = this.logs.length;
    const success = this.logs.filter(l => l.actionStatus === 'SUCCESS').length;
    const deniedRbac = this.logs.filter(l => l.actionStatus === 'FORBIDDEN').length;
    const authFailed = this.logs.filter(l => l.actionStatus === 'AUTH_FAILED').length;
    const upstreamFailed = this.logs.filter(l => l.actionStatus === 'UPSTREAM_FAILED').length;
    const avgLatency = total > 0 ? Math.round(this.logs.reduce((acc, l) => acc + l.latencyMs, 0) / total) : 0;

    return {
      total,
      success,
      deniedRbac,
      authFailed,
      upstreamFailed,
      avgLatency,
    };
  }

  public exportJson(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  public exportCsv(): string {
    const headers = [
      'Timestamp',
      'Correlation ID',
      'User ID',
      'Client Name',
      'Auth Type',
      'Auth Success',
      'Action',
      'HTTP Method',
      'Endpoint',
      'Action Status',
      'Rejection Reason',
      'STA Upstream Status',
      'Latency (ms)',
      'Client IP',
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = this.logs.map(log => [
      escapeCsv(log.timestamp),
      escapeCsv(log.correlationId),
      escapeCsv(log.userId),
      escapeCsv(log.clientName),
      escapeCsv(log.authType),
      escapeCsv(log.authSuccess),
      escapeCsv(log.action),
      escapeCsv(log.httpMethod),
      escapeCsv(log.endpoint),
      escapeCsv(log.actionStatus),
      escapeCsv(log.rejectionReason),
      escapeCsv(log.upstreamStatusCode),
      escapeCsv(log.latencyMs),
      escapeCsv(log.clientIp),
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  public exportSyslog(): string {
    // RFC-5424 structured syslog format
    return this.logs.map(log => {
      const pri = log.actionStatus === 'FORBIDDEN' || log.actionStatus === 'AUTH_FAILED' ? 131 : 134; // authpriv.err vs authpriv.info
      return `<${pri}>1 ${log.timestamp} sta-api-proxy sta-proxy-gateway ${process.pid} ${log.correlationId} [audit@44917 userId="${log.userId}" action="${log.action}" status="${log.actionStatus}" reason="${(log.rejectionReason || '').replace(/"/g, "'")}"] HTTP ${log.httpMethod} ${log.endpoint} -> ${log.actionStatus}`;
    }).join('\n');
  }

  public clear() {
    this.logs = [];
  }
}

export const auditLogger = new AuditLogger();
