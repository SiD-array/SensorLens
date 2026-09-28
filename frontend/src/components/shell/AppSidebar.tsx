import React from 'react';
import { 
  LayoutDashboard, LineChart, ArrowLeftRight, Sparkles, 
  GitCompare, BrainCircuit, ChevronLeft, ChevronRight, 
  Info, Settings, Download, UploadCloud, Search, Activity, X
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Tooltip } from '../ui/Tooltip';
import { IconButton } from '../ui/IconButton';

export type ViewType = 'dashboard' | 'visualizer' | 'alignment' | 'baseline' | 'compare' | 'analytics';

interface NavItem {
  id: ViewType;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  count?: number;
  badgeVariant?: 'cyan' | 'blue' | 'neutral' | 'success';
}

interface AppSidebarProps {
  activeView: ViewType;
  onSelectView: (view: ViewType) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isDrawerOpen: boolean;
  onCloseDrawer: () => void;
  fileCount?: number;
  sensorCount?: number;
  similarityCount?: number;
  onOpenGuide: () => void;
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
  onExportSession: () => void;
  onImportClick: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeView,
  onSelectView,
  isCollapsed,
  onToggleCollapse,
  isDrawerOpen,
  onCloseDrawer,
  fileCount = 0,
  sensorCount = 0,
  similarityCount = 0,
  onOpenGuide,
  onOpenSettings,
  onOpenCommandPalette,
  onExportSession,
  onImportClick,
}) => {
  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      count: fileCount > 0 ? fileCount : undefined,
      badgeVariant: 'neutral'
    },
    {
      id: 'visualizer',
      label: 'Visual Report',
      icon: LineChart,
      count: sensorCount > 0 ? sensorCount : undefined,
      badgeVariant: 'cyan'
    },
    {
      id: 'alignment',
      label: 'Column Alignment',
      icon: ArrowLeftRight
    },
    {
      id: 'baseline',
      label: 'Baseline Engine',
      icon: Sparkles
    },
    {
      id: 'compare',
      label: 'Similarity Matcher',
      icon: GitCompare,
      count: similarityCount > 0 ? similarityCount : undefined,
      badgeVariant: 'blue'
    },
    {
      id: 'analytics',
      label: 'Analytics & ML Studio',
      icon: BrainCircuit
    },
  ];

  const handleNavClick = (viewId: ViewType) => {
    onSelectView(viewId);
    onCloseDrawer();
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      <div 
        className={`sidebar-drawer-backdrop ${isDrawerOpen ? 'open' : ''}`}
        onClick={onCloseDrawer}
        aria-hidden={!isDrawerOpen}
      />

      {/* Main Sidebar */}
      <aside 
        className={`app-sidebar ${isCollapsed ? 'collapsed' : ''} ${isDrawerOpen ? 'open' : ''}`}
        aria-label="Application navigation"
      >
        {/* Brand Header */}
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon" title="SensorLens">
              <Activity size={18} />
            </div>
            {!isCollapsed && (
              <div className="sidebar-logo-text-box">
                <div className="sidebar-logo-text" style={{ fontFamily: 'var(--font-brand)' }}>
                  SensorLens
                </div>
                <div className="sidebar-logo-sub">Diagnostic Engine</div>
              </div>
            )}
          </div>

          {/* Close button on mobile, collapse button on desktop */}
          <div className="sidebar-brand-actions">
            {isDrawerOpen ? (
              <IconButton 
                icon={<X size={18} />}
                ariaLabel="Close navigation drawer"
                size="sm"
                onClick={onCloseDrawer}
              />
            ) : (
              <Tooltip content={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} position="right">
                <IconButton 
                  icon={isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                  ariaLabel={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  size="sm"
                  onClick={onToggleCollapse}
                />
              </Tooltip>
            )}
          </div>
        </div>

        {/* Quick Search Button in Sidebar */}
        <div style={{ padding: 'var(--space-2) var(--space-2) 0' }}>
          <button
            type="button"
            className="sidebar-nav-item"
            onClick={onOpenCommandPalette}
            style={{ 
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px dashed var(--border-color)',
              color: 'var(--text-muted)'
            }}
            title="Search views, runs, sensors (Ctrl+K)"
          >
            <Search size={16} />
            {!isCollapsed && (
              <>
                <span className="sidebar-nav-label" style={{ fontSize: 'var(--text-xs)' }}>Search...</span>
                <span className="cmd-kbd-badge">Ctrl K</span>
              </>
            )}
          </button>
        </div>

        {/* Navigation List */}
        <nav className="sidebar-nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            const buttonEl = (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                id={`nav-link-${item.id}`}
              >
                <Icon size={18} />
                {!isCollapsed && (
                  <>
                    <span className="sidebar-nav-label">{item.label}</span>
                    {item.count !== undefined && item.count > 0 && (
                      <Badge variant={item.badgeVariant || 'neutral'} size="sm" isTabular>
                        {item.count}
                      </Badge>
                    )}
                  </>
                )}
              </button>
            );

            if (isCollapsed) {
              return (
                <Tooltip key={item.id} content={item.label} position="right">
                  {buttonEl}
                </Tooltip>
              );
            }
            return buttonEl;
          })}
        </nav>

        {/* Sidebar Footer Actions */}
        <div className="sidebar-footer">
          {/* Export Session */}
          {isCollapsed ? (
            <Tooltip content="Export Session JSON" position="right">
              <IconButton 
                icon={<Download size={16} />}
                ariaLabel="Export Session JSON"
                size="md"
                onClick={onExportSession}
              />
            </Tooltip>
          ) : (
            <button 
              type="button" 
              className="sidebar-nav-item"
              onClick={onExportSession}
              title="Download full workspace session as JSON"
            >
              <Download size={16} />
              <span className="sidebar-nav-label">Export Session</span>
            </button>
          )}

          {/* Import Session */}
          {isCollapsed ? (
            <Tooltip content="Import Session JSON" position="right">
              <IconButton 
                icon={<UploadCloud size={16} />}
                ariaLabel="Import Session JSON"
                size="md"
                onClick={onImportClick}
              />
            </Tooltip>
          ) : (
            <button 
              type="button" 
              className="sidebar-nav-item"
              onClick={onImportClick}
              title="Load saved workspace session JSON file"
            >
              <UploadCloud size={16} />
              <span className="sidebar-nav-label">Import Session</span>
            </button>
          )}

          {/* User Guide */}
          {isCollapsed ? (
            <Tooltip content="How to Use Guide" position="right">
              <IconButton 
                icon={<Info size={16} />}
                ariaLabel="How to Use Guide"
                size="md"
                onClick={onOpenGuide}
              />
            </Tooltip>
          ) : (
            <button 
              type="button" 
              className="sidebar-nav-item"
              onClick={onOpenGuide}
              title="How to Use Guide"
            >
              <Info size={16} />
              <span className="sidebar-nav-label">User Guide</span>
            </button>
          )}

          {/* Settings */}
          {isCollapsed ? (
            <Tooltip content="Settings & Thresholds" position="right">
              <IconButton 
                icon={<Settings size={16} />}
                ariaLabel="Settings & Thresholds"
                size="md"
                onClick={onOpenSettings}
              />
            </Tooltip>
          ) : (
            <button 
              type="button" 
              className="sidebar-nav-item"
              onClick={onOpenSettings}
              title="Settings & Thresholds"
            >
              <Settings size={16} />
              <span className="sidebar-nav-label">Settings</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
