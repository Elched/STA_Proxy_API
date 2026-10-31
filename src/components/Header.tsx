import React from 'react';
import { Shield, Lock, Moon, Sun, Server, Activity } from 'lucide-react';
import { ProxyStats } from '../types.ts';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  stats: ProxyStats | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  darkMode,
  setDarkMode,
  stats,
}) => {
  const tabs = [
    { id: 'tester', label: 'Gateway & Sandbox' },
    { id: 'docs', label: 'Swagger / OpenAPI Docs' },
    { id: 'audit', label: 'Security Audit Logs' },
    { id: 'siem', label: 'SIEM & Syslog' },
    { id: 'rbac', label: 'RBAC Policy Matrix' },
    { id: 'service-accounts', label: 'Service Accounts & OIDC' },
    { id: 'upstream', label: 'Upstream Thales STA' },
    { id: 'code-export', label: 'Code Export & Deploy' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-8 h-16">
        
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-slate-900 dark:bg-slate-800 border border-slate-700 flex items-center justify-center text-white shadow-xs">
            <Shield className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
              Thales STA Granular Proxy
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 -mt-0.5 whitespace-nowrap">
              Zero-Trust RBAC & Audit Gateway
            </span>
          </div>
        </div>

        {/* Zone 2: Single-line Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1 overflow-x-auto py-1 text-sm font-medium">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Actions (Mode Badge & Theme Toggle) */}
        <div className="flex items-center gap-3 shrink-0">
          {stats && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 font-mono">
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${stats.upstreamMode === 'mock' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <span className="font-sans font-medium text-slate-800 dark:text-slate-200">
                  {stats.upstreamMode === 'mock' ? 'Mock Tenant' : 'Live STA'}
                </span>
              </span>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <span className="tabular-nums">{stats.total} reqs</span>
            </div>
          )}

          <button
            onClick={() => setDarkMode(!darkMode)}
            aria-label="Toggle theme"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav Tabs Bar */}
      <div className="lg:hidden flex items-center gap-1 px-4 py-2 border-t border-slate-200 dark:border-slate-800 overflow-x-auto bg-slate-50 dark:bg-slate-950">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap shrink-0 ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </header>
  );
};
