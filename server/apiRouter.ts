import { Request, Response, Router } from 'express';
import { auditLogger } from './auditLogger.ts';
import { GO_CODE_EXPORT, PYTHON_CODE_EXPORT } from './codeExport.ts';
import { rbacEngine } from './rbacEngine.ts';
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

// Code Exports
apiRouter.get('/export/python', (req: Request, res: Response) => {
  return res.json(PYTHON_CODE_EXPORT);
});

apiRouter.get('/export/go', (req: Request, res: Response) => {
  return res.json(GO_CODE_EXPORT);
});
