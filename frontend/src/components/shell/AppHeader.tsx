import React, { useState, useEffect } from 'react';
import { 
  Menu, Search, CheckCircle2, Circle, 
  Database, Sun, Moon
} from 'lucide-react';
import type { ViewType } from './AppSidebar';

import { IconButton } from '../ui/IconButton';
import { Tooltip } from '../ui/Tooltip';

interface AppHeaderProps {
  activeView: ViewType;
  onSelectView: (view: ViewType) => void;
  onOpenMobileDrawer: () => void;
  onOpenCommandPalette: () => void;
  activeRefName?: string;
  activeTestName?: string;
  fileCount: number;
  hasAlignment: boolean;
  hasBaseline: boolean;
  hasAnalysis: boolean;
  primaryAction?: React.ReactNode;
}

const VIEW_TITLES: Record<ViewType, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Workspace Dashboard',
    subtitle: 'Upload telemetry files, assign reference runs, and manage test datasets'
  },
  visualizer: {
    title: 'Visual Report & Multi-Axis Plotter',
    subtitle: 'Inspect raw sensor trajectories, categorize buckets, and compare traces'
  },
  alignment: {
    title: 'Column Alignment Engine',
    subtitle: 'Resolve schema discrepancies between reference and test run headers'
  },
  baseline: {
    title: 'Baseline Engine & Envelope Profiling',
    subtitle: 'Establish statistical tolerance corridors (Mean ± 3σ) across sensor signals'
  },
  compare: {
    title: 'Similarity Matcher',
    subtitle: 'Multi-metric pattern matching combining Pearson correlation and FastDTW'
  },
  analytics: {
    title: 'Analytics & ML Studio',
    subtitle: 'Sensor correlations, PCA decomposition, target drivers & degradation analytics'
  }
};

export const AppHeader: React.FC<AppHeaderProps> = ({
  activeView,
  onSelectView,
  onOpenMobileDrawer,
  onOpenCommandPalette,
  activeRefName,
  activeTestName,
  fileCount,
  hasAlignment,
  hasBaseline,
  hasAnalysis,
  primaryAction,
}) => {
  const currentMeta = VIEW_TITLES[activeView] || VIEW_TITLES.dashboard;

  // Persisted light/dark theme with prefers-color-scheme fallback
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('sensorlens_theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('sensorlens_theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const steps = [
    {
      id: 'dashboard' as ViewType,
      label: 'Upload',
      isCompleted: fileCount > 0,
      isActive: activeView === 'dashboard',
    },
    {
      id: 'alignment' as ViewType,
      label: 'Align',
      isCompleted: hasAlignment,
      isActive: activeView === 'alignment',
    },
    {
      id: 'baseline' as ViewType,
      label: 'Baseline',
      isCompleted: hasBaseline,
      isActive: activeView === 'baseline',
    },
    {
      id: 'compare' as ViewType,
      label: 'Analyze',
      isCompleted: hasAnalysis,
      isActive: activeView === 'compare' || activeView === 'analytics',
    },
  ];

  return (
    <header className="app-page-header">
      {/* Left side: Hamburger button + Page Title */}
      <div className="header-left">
        <div className="sidebar-drawer-toggle">
          <IconButton 
            icon={<Menu size={20} />}
            ariaLabel="Open navigation menu"
            onClick={onOpenMobileDrawer}
            size="md"
          />
        </div>

        <div className="header-title-box">
          <h1>{currentMeta.title}</h1>
          <p>{currentMeta.subtitle}</p>
        </div>
      </div>

      {/* Center: Context chip + Workflow Stepper */}
      <div className="header-center">
        {/* Context Chip (Active Reference / Test Run) */}
        {(activeRefName || activeTestName) ? (
          <div className="context-chip" title="Active Reference and Test runs currently selected">
            {activeRefName && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="context-chip-tag" style={{ background: 'rgba(0, 242, 254, 0.15)', color: 'var(--accent-cyan)' }}>
                  REF
                </span>
                <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeRefName}
                </span>
              </span>
            )}
            {activeRefName && activeTestName && (
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>vs</span>
            )}
            {activeTestName && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="context-chip-tag" style={{ background: 'rgba(59, 130, 246, 0.18)', color: 'var(--accent-blue)' }}>
                  TEST
                </span>
                <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeTestName}
                </span>
              </span>
            )}
          </div>
        ) : (
          <div className="context-chip">
            <Database size={13} style={{ color: 'var(--text-muted)' }} />
            <span style={{ color: 'var(--text-muted)' }}>No runs loaded</span>
          </div>
        )}

        {/* Workflow Stepper */}
        <div className="workflow-stepper" role="navigation" aria-label="Workflow progress">
          {steps.map((step, idx) => (
            <React.Fragment key={step.id}>
              {idx > 0 && <span className="step-connector">›</span>}
              <button
                type="button"
                onClick={() => onSelectView(step.id)}
                className={`step-item ${step.isActive ? 'active' : ''} ${step.isCompleted ? 'completed' : ''}`}
                title={`Jump to ${step.label} (${step.isCompleted ? 'Completed' : 'Pending'})`}
              >
                {step.isCompleted ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <Circle size={10} />
                )}
                <span>{step.label}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Right side: Theme toggle + Command palette trigger + Primary page action */}
      <div className="header-right">
        <Tooltip content={theme === 'dark' ? 'Switch to light mode (WCAG AA)' : 'Switch to dark mode'} position="bottom">
          <IconButton
            icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            ariaLabel={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
            size="md"
            id="theme-toggle-btn"
          />
        </Tooltip>

        <Tooltip content="Quick search sensors, runs, views (Ctrl+K)" position="bottom">
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-sm"
            onClick={onOpenCommandPalette}
            id="cmd-palette-trigger-btn"
            style={{ gap: 8, height: 32 }}
          >
            <Search size={14} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span>Search</span>
              <kbd className="cmd-kbd-badge" style={{ padding: '0 4px', fontSize: 10 }}>Ctrl K</kbd>
            </span>
          </button>
        </Tooltip>

        {/* View-specific Primary Action */}
        {primaryAction}
      </div>
    </header>
  );
};
