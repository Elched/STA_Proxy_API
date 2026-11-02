import { Request, Response, Router } from 'express';
import { auditLogger } from './auditLogger.ts';
import { GO_CODE_EXPORT, PYTHON_CODE_EXPORT, DOCKER_CODE_EXPORT } from './codeExport.ts';
import { generateOpenApiSpec } from './openapiGenerator.ts';
import { rbacEngine } from './rbacEngine.ts';
import { siemForwarder } from './siemForwarder.ts';
import { staStore } from './staMockStore.ts';

export const apiRouter = Router();

// Stats
apiRouter.get('/stats', (req: Request, res: Response) => {
  const stats = auditLogger.getStats();
  const tenantSummary = staStore.getTenantSummary();
  return res.json({
    ...stats,
    serviceAccountsCount: rbacEngine.serviceAccounts.filter(s => s.status === 'active').length,
    rolesCount: rbacEngine.roles.length,
    mockUsersCount: tenantSummary.userCount,
    mockLockedCount: tenantSummary.lockedCount,
    upstreamMode: staStore.config.mode,
    simulateUpstreamFailure: staStore.config.simulateUpstreamFailure,
    siemStatus: siemForwarder.getStatus(),
  });
});

// Audit Logs
apiRouter.get('/audit-logs', (req: Request, res: Response) => {
  const { status, category, userId, query, limit, offset } = req.query;
  const result = auditLogger.query({
    status: status as string,
    category: category as string,
    userId: userId as string,
    query: query as string,
    limit: limit ? parseInt(limit as string, 10) : 100,
    offset: offset ? parseInt(offset as string, 10) : 0,
  });
  return res.json(result);
});

apiRouter.get('/audit-logs/export', (req: Request, res: Response) => {
  const format = req.query.format || 'json';
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sta_proxy_audit_logs.csv"');
    return res.send(auditLogger.exportCsv());
  } else if (format === 'syslog') {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="sta_proxy_syslog.log"');
    return res.send(auditLogger.exportSyslog());
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="sta_proxy_audit_logs.json"');
    return res.send(auditLogger.exportJson());
  }
});

apiRouter.delete('/audit-logs', (req: Request, res: Response) => {
  auditLogger.clear();
  return res.json({ success: true, message: 'Audit logs cleared' });
});

// RBAC Roles & Permissions
apiRouter.get('/permissions', (req: Request, res: Response) => {
  return res.json(rbacEngine.permissions);
});

apiRouter.get('/rules', (req: Request, res: Response) => {
  return res.json(rbacEngine.rules);
});

apiRouter.get('/roles', (req: Request, res: Response) => {
  return res.json(rbacEngine.roles);
});

apiRouter.post('/roles', (req: Request, res: Response) => {
  const { id, name, description, permissions } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: 'Role id and name are required' });
  }
  const role = rbacEngine.createRole({ id, name, description: description || '', permissions: permissions || [] });
  return res.status(201).json(role);
});

apiRouter.put('/roles/:id', (req: Request, res: Response) => {
  const role = rbacEngine.updateRole(req.params.id, req.body);
  if (!role) {
    return res.status(404).json({ error: 'Role not found' });
  }
  return res.json(role);
});

// Service Accounts
apiRouter.get('/service-accounts', (req: Request, res: Response) => {
  return res.json(rbacEngine.serviceAccounts);
});

apiRouter.post('/service-accounts', (req: Request, res: Response) => {
  const { name, description, roles } = req.body;
  if (!name || !roles || !roles.length) {
    return res.status(400).json({ error: 'Name and at least one role are required' });
  }
  const sa = rbacEngine.createServiceAccount({ name, description: description || '', roles });
  return res.status(201).json(sa);
});

apiRouter.post('/service-accounts/:id/revoke', (req: Request, res: Response) => {
  const success = rbacEngine.revokeServiceAccount(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Service account not found' });
  }
  return res.json({ success: true, message: `Service account ${req.params.id} revoked` });
});

// OIDC Simulation & Helpers
apiRouter.get('/oidc/config', (req: Request, res: Response) => {
  return res.json(rbacEngine.oidcConfig);
});

apiRouter.post('/oidc/test-token', (req: Request, res: Response) => {
  const { sub, name, roles } = req.body;
  const token = rbacEngine.generateTestOidcToken(
    sub || 'alice.smith@enterprise.corp',
    name || 'Alice Smith (Helpdesk Analyst)',
    roles || ['helpdesk-operator']
  );
  return res.json({
    token,
    decoded: {
      sub: sub || 'alice.smith@enterprise.corp',
      name: name || 'Alice Smith (Helpdesk Analyst)',
      roles: roles || ['helpdesk-operator'],
      issuer: rbacEngine.oidcConfig.issuer,
      audience: rbacEngine.oidcConfig.audience,
    },
  });
});

// STA Upstream Config & Mock Management
apiRouter.get('/sta/config', (req: Request, res: Response) => {
  return res.json({
    ...staStore.config,
    masterApiKeyMasked: staStore.config.masterApiKey.slice(0, 6) + '••••••••••••••••' + staStore.config.masterApiKey.slice(-4),
  });
});

apiRouter.put('/sta/config', (req: Request, res: Response) => {
  const { mode, tenantId, apiBaseUrl, masterApiKey, simulateUpstreamFailure, verifyTls } = req.body;
  if (mode) staStore.config.mode = mode;
  if (tenantId) staStore.config.tenantId = tenantId;
  if (apiBaseUrl) staStore.config.apiBaseUrl = apiBaseUrl;
  if (masterApiKey) staStore.config.masterApiKey = masterApiKey;
  if (simulateUpstreamFailure !== undefined) staStore.config.simulateUpstreamFailure = simulateUpstreamFailure;
  if (verifyTls !== undefined) staStore.config.verifyTls = verifyTls;

  return res.json(staStore.config);
});

apiRouter.post('/sta/reset-mock', (req: Request, res: Response) => {
  staStore.seedData();
  return res.json({ success: true, message: 'Mock Thales STA tenant data reset to baseline' });
});

apiRouter.get('/sta/mock-state', (req: Request, res: Response) => {
  return res.json(staStore.getTenantSummary());
});

apiRouter.get('/sta/health', async (req: Request, res: Response) => {
  const startTime = Date.now();
  if (staStore.config.mode === 'mock') {
    return res.json({
      status: 'healthy',
      mode: 'mock',
      upstream: 'simulated',
      tenantId: staStore.config.tenantId,
      latencyMs: 2,
      timestamp: new Date().toISOString(),
    });
  }

  // Live upstream probe
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const probeUrl = `${staStore.config.apiBaseUrl.replace(/\/$/, '')}/api/v1/users?limit=1`;
    const resp = await fetch(probeUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${staStore.config.masterApiKey}`,
        'X-STA-Tenant-ID': staStore.config.tenantId,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - startTime;
    return res.json({
      status: resp.ok ? 'healthy' : 'degraded',
      mode: 'live',
      upstream: resp.ok ? 'connected' : `HTTP ${resp.status}`,
      statusCode: resp.status,
      latencyMs,
      tenantId: staStore.config.tenantId,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(502).json({
      status: 'unhealthy',
      mode: 'live',
      upstream: 'unreachable',
      error: err.message,
      tenantId: staStore.config.tenantId,
      timestamp: new Date().toISOString(),
    });
  }
});

// Code Exports
apiRouter.get('/export/python', (req: Request, res: Response) => {
  return res.json(PYTHON_CODE_EXPORT);
});

apiRouter.get('/export/go', (req: Request, res: Response) => {
  return res.json(GO_CODE_EXPORT);
});

apiRouter.get('/export/docker', (req: Request, res: Response) => {
  return res.json(DOCKER_CODE_EXPORT);
});

// SIEM Real-Time Forwarding Config & Testing
apiRouter.get('/siem/config', (req: Request, res: Response) => {
  return res.json({
    config: siemForwarder.getConfig(),
    status: siemForwarder.getStatus(),
  });
});

apiRouter.put('/siem/config', (req: Request, res: Response) => {
  const updated = siemForwarder.updateConfig(req.body);
  return res.json({
    config: updated,
    status: siemForwarder.getStatus(),
  });
});

apiRouter.post('/siem/test', async (req: Request, res: Response) => {
  const scenario = req.body.actionStatus || 'FORBIDDEN';
  const testFormat = (req.body.format || siemForwarder.getConfig().format) as any;

  let sampleEntry: any;
  if (scenario === 'AUTH_FAILED') {
    sampleEntry = {
      id: 'test_evt_' + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      correlationId: 'req_siem_test_' + Math.random().toString(36).substring(2, 8),
      userId: 'anonymous',
      clientName: 'Unknown External Client',
      authType: 'SERVICE_ACCOUNT' as const,
      authSuccess: false,
      authFailureReason: 'Invalid or revoked API key',
      action: 'users.read',
      actionCategory: 'Users' as const,
      httpMethod: 'GET',
      endpoint: '/api/v1/users',
      actionStatus: 'AUTH_FAILED' as const,
      rejectionReason: 'Authentication failed: Invalid credentials provided to Thales STA Proxy',
      upstreamStatusCode: null,
      latencyMs: 14,
      clientIp: req.ip || '192.168.1.105',
      userAgent: 'SIEM-Test-Probe/1.0',
      requestPayloadSummary: null,
      responseSummary: '{"error": "Unauthorized", "message": "Invalid API key"}',
    };
  } else if (scenario === 'FORBIDDEN') {
    sampleEntry = {
      id: 'test_evt_' + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      correlationId: 'req_siem_test_' + Math.random().toString(36).substring(2, 8),
      userId: req.body.userId || 'sa_servicenow_helpdesk',
      clientName: 'ServiceNow ITSM Helpdesk Bot',
      authType: 'SERVICE_ACCOUNT' as const,
      authSuccess: true,
      authFailureReason: null,
      action: 'policies.delete',
      actionCategory: 'Policies' as const,
      httpMethod: 'DELETE',
      endpoint: '/api/v1/policies/pol_mfa_all_cloud',
      actionStatus: 'FORBIDDEN' as const,
      rejectionReason: "improper rights: caller role 'helpdesk-operator' lacks required permission 'sta:policies:delete'",
      upstreamStatusCode: null,
      latencyMs: 22,
      clientIp: req.ip || '10.0.4.15',
      userAgent: 'ServiceNow-Integration/4.2',
      requestPayloadSummary: null,
      responseSummary: '{"error": "Forbidden", "code": "IMPROPER_RIGHTS"}',
    };
  } else {
    sampleEntry = {
      id: 'test_evt_' + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      correlationId: 'req_siem_test_' + Math.random().toString(36).substring(2, 8),
      userId: req.body.userId || 'sa_servicenow_helpdesk',
      clientName: 'ServiceNow ITSM Helpdesk Bot',
      authType: 'SERVICE_ACCOUNT' as const,
      authSuccess: true,
      authFailureReason: null,
      action: 'users.unlock',
      actionCategory: 'Users' as const,
      httpMethod: 'POST',
      endpoint: '/api/v1/users/usr_4821/unlock',
      actionStatus: 'SUCCESS' as const,
      rejectionReason: null,
      upstreamStatusCode: 200,
      latencyMs: 38,
      clientIp: req.ip || '10.0.4.15',
      userAgent: 'ServiceNow-Integration/4.2',
      requestPayloadSummary: '{"reason": "Identity verified via telephone challenge"}',
      responseSummary: '{"status": "SUCCESS", "message": "User unlocked"}',
    };
  }

  const wirePayload = siemForwarder.formatMessage(sampleEntry, testFormat);

  // If enabled, attempt real dispatch
  let dispatchResult = { success: true, message: 'Message formatted successfully (SIEM disabled)' };
  if (siemForwarder.getConfig().enabled) {
    const outcome = await siemForwarder.forward(sampleEntry);
    if (!outcome.success) {
      dispatchResult = { success: false, message: outcome.error || 'Failed to dispatch to SIEM' };
    } else {
      dispatchResult = { success: true, message: `Successfully transmitted event over ${siemForwarder.getConfig().protocol} to ${siemForwarder.getConfig().host}:${siemForwarder.getConfig().port}` };
    }
  }

  return res.json({
    ...dispatchResult,
    wirePayload,
    sampleEntry,
    siemStatus: siemForwarder.getStatus(),
  });
});

// OpenAPI 3.0.3 Specification (Dynamic based on current RBAC config)
apiRouter.get('/openapi.json', (req: Request, res: Response) => {
  const role = req.query.role as string | undefined;
  const spec = generateOpenApiSpec(role, req.get('host'));
  return res.json(spec);
});

apiRouter.get('/openapi.yaml', (req: Request, res: Response) => {
  const role = req.query.role as string | undefined;
  const spec = generateOpenApiSpec(role, req.get('host'));
  
  // Clean JSON to YAML serialization
  const yamlContent = jsonToYaml(spec);
  res.setHeader('Content-Type', 'text/yaml');
  res.setHeader('Content-Disposition', 'attachment; filename="thales_sta_proxy_openapi.yaml"');
  return res.send(yamlContent);
});

function jsonToYaml(obj: any, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (obj === null || obj === undefined) return 'null\n';
  if (typeof obj === 'boolean' || typeof obj === 'number') return `${obj}\n`;
  if (typeof obj === 'string') {
    if (obj.includes('\n')) {
      const lines = obj.split('\n').map(l => `${pad}  ${l}`).join('\n');
      return `|\n${lines}\n`;
    }
    if (/[:#\[\]{},&*!|>'\"%@`]/.test(obj) || obj === '' || !isNaN(Number(obj))) {
      return `"${obj.replace(/"/g, '\\"')}"\n`;
    }
    return `${obj}\n`;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]\n';
    let res = '\n';
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        const itemYaml = jsonToYaml(item, indent + 1);
        const trimmed = itemYaml.trimStart();
        res += `${pad}- ${trimmed}`;
      } else {
        res += `${pad}- ${jsonToYaml(item, 0)}`;
      }
    }
    return res;
  }
  if (typeof obj === 'object') {
    if (Object.keys(obj).length === 0) return '{}\n';
    let res = indent === 0 ? '' : '\n';
    for (const [key, val] of Object.entries(obj)) {
      const keyStr = /^[a-zA-Z0-9_\-\.]+$/.test(key) ? key : `"${key}"`;
      if (typeof val === 'object' && val !== null) {
        res += `${pad}${keyStr}:${jsonToYaml(val, indent + 1)}`;
      } else {
        res += `${pad}${keyStr}: ${jsonToYaml(val, 0)}`;
      }
    }
    return res;
  }
  return String(obj) + '\n';
}

