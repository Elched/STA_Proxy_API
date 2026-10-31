import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { ProxyGatewayTester } from './components/ProxyGatewayTester.tsx';
import { OpenApiDocViewer } from './components/OpenApiDocViewer.tsx';
import { AuditLogExplorer } from './components/AuditLogExplorer.tsx';
import { RbacMatrix } from './components/RbacMatrix.tsx';
import { ServiceAccountsManager } from './components/ServiceAccountsManager.tsx';
import { UpstreamStaConfigView } from './components/UpstreamStaConfig.tsx';
import { CodeExportDeploy } from './components/CodeExportDeploy.tsx';
import { AuditLogEntry, PermissionItem, ProxyStats, RbacRole, RbacRule, ServiceAccount } from './types.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('tester');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [stats, setStats] = useState<ProxyStats | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [rules, setRules] = useState<RbacRule[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [serviceAccounts, setServiceAccounts] = useState<ServiceAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Sync dark mode class on document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const loadData = async () => {
    try {
      const [statsRes, logsRes, rolesRes, rulesRes, permsRes, saRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/audit-logs?limit=200'),
        fetch('/api/roles'),
        fetch('/api/rules'),
        fetch('/api/permissions'),
        fetch('/api/service-accounts'),
      ]);

      const [statsData, logsData, rolesData, rulesData, permsData, saData] = await Promise.all([
        statsRes.json(),
        logsRes.json(),
        rolesRes.json(),
        rulesRes.json(),
        permsRes.json(),
        saRes.json(),
      ]);

      setStats(statsData);
      setLogs(logsData.items || []);
      setRoles(rolesData);
      setRules(rulesData);
      setPermissions(permsData);
      setServiceAccounts(saData);
    } catch (err) {
      console.error('Failed to load proxy dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Poll stats every 10 seconds for real-time awareness
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleClearLogs = async () => {
    await fetch('/api/audit-logs', { method: 'DELETE' });
    loadData();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        stats={stats}
      />

      {/* Main Workspace Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center min-h-[400px] text-xs text-slate-500">
            Initializing Thales STA Granular Proxy Environment...
          </div>
        ) : (
          <>
            {activeTab === 'tester' && (
              <ProxyGatewayTester
                serviceAccounts={serviceAccounts}
                onLogGenerated={loadData}
                onNavigateTab={setActiveTab}
              />
            )}

            {activeTab === 'docs' && (
              <OpenApiDocViewer
                roles={roles}
                serviceAccounts={serviceAccounts}
                onNavigateTab={setActiveTab}
              />
            )}

            {activeTab === 'audit' && (
              <AuditLogExplorer
                logs={logs}
                onRefresh={loadData}
                onClearLogs={handleClearLogs}
              />
            )}

            {activeTab === 'rbac' && (
              <RbacMatrix
                roles={roles}
                rules={rules}
                permissions={permissions}
                onRoleCreated={loadData}
              />
            )}

            {activeTab === 'service-accounts' && (
              <ServiceAccountsManager
                serviceAccounts={serviceAccounts}
                roles={roles}
                onAccountCreated={loadData}
                onNavigateTab={setActiveTab}
              />
            )}

            {activeTab === 'upstream' && (
              <UpstreamStaConfigView
                onConfigUpdated={loadData}
              />
            )}

            {activeTab === 'code-export' && (
              <CodeExportDeploy />
            )}
          </>
        )}
      </main>

      {/* Quiet, anti-slop footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 py-4 px-4 sm:px-6 text-xs text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-900/40">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>Thales SafeNet Trusted Access Granular API Reverse Proxy</span>
            <span aria-hidden="true">·</span>
            <span>Zero-Trust Authorization & Audit Architecture</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://thalesdocs.com/sta/api/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              STA API Reference
            </a>
            <span aria-hidden="true">·</span>
            <span>TLS 1.3 Strict</span>
            <span aria-hidden="true">·</span>
            <span>OpenID Connect Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
