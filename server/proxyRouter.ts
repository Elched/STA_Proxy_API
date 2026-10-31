import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import { auditLogger } from './auditLogger.ts';
import { rbacEngine } from './rbacEngine.ts';
import { staStore } from './staMockStore.ts';

export const proxyRouter = Router();

// Handle all methods and paths under /proxy/*
proxyRouter.all('*', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const correlationId = (req.headers['x-correlation-id'] as string) || `req_${crypto.randomUUID()}`;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = (req.headers['user-agent'] as string) || 'Unknown';
  const targetPath = req.path;
  const method = req.method.toUpperCase();

  // Helper for response
  const sendProxyResponse = (statusCode: number, payload: any) => {
    res.setHeader('X-Correlation-ID', correlationId);
    res.setHeader('X-Proxy-Gateway', 'Thales-STA-Granular-RBAC-Proxy/1.0');
    return res.status(statusCode).json(payload);
  };

  // 1. Authenticate caller
  const authResult = rbacEngine.authenticateCaller(req.headers);

  if (!authResult.success || !authResult.identity) {
    const latencyMs = Date.now() - startTime;
    const failureReason = authResult.failureReason || 'authentication failed: invalid credentials';

    auditLogger.record({
      timestamp: new Date().toISOString(),
      correlationId,
      userId: 'anonymous_caller',
      clientName: 'Unauthenticated Client',
      authType: 'ANONYMOUS',
      authSuccess: false,
      authFailureReason: failureReason,
      action: 'unauthenticated.request',
      actionCategory: 'System',
      httpMethod: method,
      endpoint: targetPath,
      actionStatus: 'AUTH_FAILED',
      rejectionReason: failureReason,
      upstreamStatusCode: null,
      latencyMs,
      clientIp,
      userAgent,
      requestPayloadSummary: req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '',
      responseSummary: JSON.stringify({ error: 'Unauthorized', message: failureReason }),
    });

    return sendProxyResponse(401, {
      error: 'Unauthorized',
      code: 'AUTH_FAILED',
      correlationId,
      message: failureReason,
      timestamp: new Date().toISOString(),
    });
  }

  const identity = authResult.identity;

  // 2. Evaluate Granular RBAC
  const evalResult = rbacEngine.evaluateAuthorization(identity, method, targetPath);

  if (!evalResult.allowed) {
    const latencyMs = Date.now() - startTime;
    const rejectionReason = evalResult.reason || 'improper rights: action forbidden by policy';

    auditLogger.record({
      timestamp: new Date().toISOString(),
      correlationId,
      userId: identity.id,
      clientName: identity.name,
      authType: identity.type,
      authSuccess: true,
      authFailureReason: null,
      action: evalResult.actionName,
      actionCategory: evalResult.category,
      httpMethod: method,
      endpoint: targetPath,
      actionStatus: 'FORBIDDEN',
      rejectionReason,
      upstreamStatusCode: null,
      latencyMs,
      clientIp,
      userAgent,
      requestPayloadSummary: req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '',
      responseSummary: JSON.stringify({ error: 'Forbidden', message: rejectionReason }),
    });

    return sendProxyResponse(403, {
      error: 'Forbidden',
      code: 'IMPROPER_RIGHTS',
      correlationId,
      message: 'Access denied: caller does not possess the granular permissions required for this SafeNet Trusted Access endpoint.',
      details: {
        callerId: identity.id,
        callerRoles: identity.roles,
        requiredPermission: evalResult.rule?.requiredPermission || 'UNMAPPED_ENDPOINT',
        reason: rejectionReason,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // 3. Forward to Upstream Thales STA
  let upstreamStatus = 200;
  let upstreamBody: any = null;

  try {
    if (staStore.config.mode === 'live') {
      // Real Upstream STA Forwarding over HTTPS / TLS
      const staUrl = `${staStore.config.apiBaseUrl.replace(/\/$/, '')}${targetPath}`;
      const fetchHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${staStore.config.masterApiKey}`,
        'X-STA-Tenant-ID': staStore.config.tenantId,
        'X-Forwarded-For': clientIp,
        'X-Correlation-ID': correlationId,
      };

      const fetchOptions: RequestInit = {
        method,
        headers: fetchHeaders,
      };

      if (['POST', 'PUT', 'PATCH'].includes(method) && req.body && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const upstreamResponse = await fetch(staUrl, fetchOptions);
      upstreamStatus = upstreamResponse.status;
      const text = await upstreamResponse.text();
      try {
        upstreamBody = JSON.parse(text);
      } catch {
        upstreamBody = { raw: text };
      }
    } else {
      // Mock STA Engine (High-Fidelity simulation)
      // Add slight realistic network latency simulation (20-60ms)
      await new Promise(r => setTimeout(r, Math.floor(25 + Math.random() * 35)));
      const mockResult = staStore.handleMockRequest(method, targetPath, req.body);
      upstreamStatus = mockResult.status;
      upstreamBody = mockResult.body;
    }
  } catch (err: any) {
    upstreamStatus = 502;
    upstreamBody = {
      error: 'Bad Gateway',
      errorCode: 'STA-UPSTREAM-CONNECT-FAIL',
      message: `Failed to connect to Thales SafeNet Trusted Access upstream: ${err.message}`,
    };
  }

  const latencyMs = Date.now() - startTime;
  const isUpstreamSuccess = upstreamStatus >= 200 && upstreamStatus < 300;

  // 4. Log structured audit record
  const actionStatus = isUpstreamSuccess ? 'SUCCESS' : 'UPSTREAM_FAILED';
  const rejectionReason = isUpstreamSuccess
    ? null
    : `the action has failed on the identity provider side: STA returned HTTP ${upstreamStatus} (${upstreamBody?.errorCode || 'ERROR'}): ${upstreamBody?.message || upstreamBody?.error || 'Upstream identity provider failure'}`;

  auditLogger.record({
    timestamp: new Date().toISOString(),
    correlationId,
    userId: identity.id,
    clientName: identity.name,
    authType: identity.type,
    authSuccess: true,
    authFailureReason: null,
    action: evalResult.actionName,
    actionCategory: evalResult.category,
    httpMethod: method,
    endpoint: targetPath,
    actionStatus,
    rejectionReason,
    upstreamStatusCode: upstreamStatus,
    latencyMs,
    clientIp,
    userAgent,
    requestPayloadSummary: req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '',
    responseSummary: JSON.stringify(upstreamBody).slice(0, 500),
  });

  return sendProxyResponse(upstreamStatus, upstreamBody);
});
