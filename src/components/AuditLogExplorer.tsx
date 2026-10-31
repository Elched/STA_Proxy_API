import React, { useState } from 'react';
import {
  Download,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ExternalLink,
  X,
  Copy,
  Clock,
  User,
  ShieldAlert
} from 'lucide-react';
import { AuditLogEntry } from '../types.ts';

interface AuditLogExplorerProps {
  logs: AuditLogEntry[];
  onRefresh: () => void;
  onClearLogs: () => void;
}

export const AuditLogExplorer: React.FC<AuditLogExplorerProps> = ({
  logs,
  onRefresh,
  onClearLogs,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (statusFilter !== 'ALL' && log.actionStatus !== statusFilter) {
      return false;
    }
    if (categoryFilter !== 'ALL' && log.actionCategory !== categoryFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.userId.toLowerCase().includes(q) ||
        log.endpoint.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        (log.rejectionReason && log.rejectionReason.toLowerCase().includes(q)) ||
        log.correlationId.toLowerCase().includes(q) ||
        log.clientName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleExport = (format: 'json' | 'csv' | 'syslog') => {
    window.open(`/api/audit-logs/export?format=${format}`, '_blank');
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLogId(id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const getStatusBadge = (status: string, reason: string | null) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle className="w-3 h-3 text-emerald-600" />
            <span>Success</span>
          </span>
        );
      case 'FORBIDDEN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <ShieldAlert className="w-3 h-3 text-amber-600" />
            <span>Improper Rights</span>
          </span>
        );
      case 'AUTH_FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <XCircle className="w-3 h-3 text-rose-600" />
            <span>Auth Failed</span>
          </span>
        );
      case 'UPSTREAM_FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <AlertTriangle className="w-3 h-3 text-purple-600" />
            <span>Failed on STA Upstream</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Export Toolbar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Structured Security Audit Log Stream
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Every request records timestamp, user identity, action requested, auth outcome, action result, and exact rejection rationale.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleExport('json')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>JSON</span>
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
          <button
            onClick={() => handleExport('syslog')}
            title="Export in RFC-5424 Syslog format for Splunk / Datadog / SIEM ingestion"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Syslog (RFC-5424)</span>
          </button>
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            title="Refresh logs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClearLogs}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status Filters */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
              statusFilter === 'ALL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Logs ({logs.length})
          </button>
          <button
            onClick={() => setStatusFilter('SUCCESS')}
            className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
              statusFilter === 'SUCCESS'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Success ({logs.filter(l => l.actionStatus === 'SUCCESS').length})
          </button>
          <button
            onClick={() => setStatusFilter('FORBIDDEN')}
            className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
              statusFilter === 'FORBIDDEN'
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Improper Rights ({logs.filter(l => l.actionStatus === 'FORBIDDEN').length})
          </button>
          <button
            onClick={() => setStatusFilter('UPSTREAM_FAILED')}
            className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
              statusFilter === 'UPSTREAM_FAILED'
                ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            STA Upstream Failed ({logs.filter(l => l.actionStatus === 'UPSTREAM_FAILED').length})
          </button>
          <button
            onClick={() => setStatusFilter('AUTH_FAILED')}
            className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
              statusFilter === 'AUTH_FAILED'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Auth Failed ({logs.filter(l => l.actionStatus === 'AUTH_FAILED').length})
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search user, action, trace ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white pl-9 pr-3 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Caller Identity (UserID)</th>
                <th className="py-2.5 px-3">Action & Endpoint</th>
                <th className="py-2.5 px-3">Auth</th>
                <th className="py-2.5 px-3">Action Status & Reason</th>
                <th className="py-2.5 px-3 text-right">STA Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                    No security audit logs match current filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    {/* Timestamp */}
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {log.correlationId.slice(0, 14)}...
                      </span>
                    </td>

                    {/* Caller ID */}
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1">
                        <span>{log.userId}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <span className="font-mono text-[10px] text-slate-400">{log.authType}</span>
                        <span>·</span>
                        <span className="truncate max-w-[140px]">{log.clientName}</span>
                      </div>
                    </td>

                    {/* Action & Endpoint */}
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {log.action}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span className="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                          {log.httpMethod}
                        </span>
                        <span className="truncate max-w-[220px]">{log.endpoint}</span>
                      </div>
                    </td>

                    {/* Auth Status */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {log.authSuccess ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium text-[11px] flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          <span>Passed</span>
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400 font-medium text-[11px] flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          <span>Failed</span>
                        </span>
                      )}
                    </td>

                    {/* Action Result & Reason */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(log.actionStatus, log.rejectionReason)}
                        {log.upstreamStatusCode && (
                          <span className="text-[11px] font-mono text-slate-400">
                            (STA {log.upstreamStatusCode})
                          </span>
                        )}
                      </div>
                      {log.rejectionReason && (
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 line-clamp-1 max-w-sm">
                          {log.rejectionReason}
                        </div>
                      )}
                    </td>

                    {/* Latency */}
                    <td className="py-2.5 px-3 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {log.latencyMs}ms
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over Inspection Drawer for Single Log */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Security Audit Log Event</span>
                  <span className="font-mono text-xs text-slate-400">#{selectedLog.id.slice(0, 8)}</span>
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Trace ID: {selectedLog.correlationId}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Status Banner */}
              <div
                className={`p-3 rounded-lg border flex items-start gap-3 ${
                  selectedLog.actionStatus === 'SUCCESS'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : selectedLog.actionStatus === 'FORBIDDEN'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                }`}
              >
                {selectedLog.actionStatus === 'SUCCESS' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                )}
                <div>
                  <div className="font-semibold text-sm">
                    {selectedLog.actionStatus === 'SUCCESS'
                      ? 'Request Authorized & Executed Successfully'
                      : selectedLog.actionStatus === 'FORBIDDEN'
                      ? 'Blocked: Improper Rights (RBAC Denied)'
                      : selectedLog.actionStatus === 'AUTH_FAILED'
                      ? 'Blocked: Authentication Failure'
                      : 'Action Failed on Upstream Identity Provider'}
                  </div>
                  {selectedLog.rejectionReason && (
                    <div className="mt-1 text-xs opacity-90 leading-relaxed font-mono">
                      {selectedLog.rejectionReason}
                    </div>
                  )}
                </div>
              </div>

              {/* Core Audit Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Timestamp (UTC)</div>
                  <div className="font-mono text-slate-900 dark:text-slate-200 tabular-nums mt-0.5">
                    {selectedLog.timestamp}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Latency & Upstream</div>
                  <div className="font-mono text-slate-900 dark:text-slate-200 tabular-nums mt-0.5">
                    {selectedLog.latencyMs} ms · STA HTTP {selectedLog.upstreamStatusCode || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">User ID / Subject</div>
                  <div className="font-mono text-slate-900 dark:text-slate-200 truncate mt-0.5">
                    {selectedLog.userId}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Auth Mechanism</div>
                  <div className="font-mono text-slate-900 dark:text-slate-200 mt-0.5">
                    {selectedLog.authType}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Client Name</div>
                  <div className="text-slate-900 dark:text-slate-200 mt-0.5">
                    {selectedLog.clientName}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Client IP & Source</div>
                  <div className="font-mono text-slate-900 dark:text-slate-200 mt-0.5">
                    {selectedLog.clientIp}
                  </div>
                </div>
              </div>

              {/* Endpoint & Payload Summary */}
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white mb-1.5">
                  Requested STA Endpoint & Method:
                </div>
                <div className="font-mono p-2.5 rounded-lg bg-slate-950 text-emerald-400 border border-slate-800">
                  {selectedLog.httpMethod} {selectedLog.endpoint}
                </div>
              </div>

              {selectedLog.requestPayloadSummary && (
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white mb-1.5">
                    Inbound Request Payload:
                  </div>
                  <pre className="font-mono p-2.5 rounded-lg bg-slate-950 text-slate-300 border border-slate-800 text-[11px] overflow-x-auto whitespace-pre-wrap">
                    {selectedLog.requestPayloadSummary}
                  </pre>
                </div>
              )}

              {selectedLog.responseSummary && (
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white mb-1.5">
                    Proxy Response Summary:
                  </div>
                  <pre className="font-mono p-2.5 rounded-lg bg-slate-950 text-slate-300 border border-slate-800 text-[11px] overflow-x-auto whitespace-pre-wrap">
                    {selectedLog.responseSummary}
                  </pre>
                </div>
              )}

              {/* Raw JSON */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-white mb-1.5">
                  <span>Raw Structured Audit Record:</span>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(selectedLog, null, 2), selectedLog.id)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedLogId === selectedLog.id ? 'Copied' : 'Copy Record'}</span>
                  </button>
                </div>
                <pre className="font-mono p-3 rounded-lg bg-slate-950 text-indigo-300 border border-slate-800 text-[10px] overflow-x-auto max-h-48">
                  {JSON.stringify(selectedLog, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
