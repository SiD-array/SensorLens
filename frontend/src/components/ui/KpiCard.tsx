import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Tooltip } from './Tooltip';

export interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  delta?: {
    value: number | string;
    isPositiveGood?: boolean; // if true, + is green, - is red; if false, + is red, - is green
    label?: string;
  };
  status?: 'normal' | 'warning' | 'danger' | 'success' | 'info';
  icon?: React.ReactNode;
  subtitle?: string;
  tooltip?: string;
  className?: string;
  animate?: boolean;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  unit,
  delta,
  status = 'normal',
  icon,
  subtitle,
  tooltip,
  className = '',
  animate = true,
}) => {
  // Count-up animation for numeric values
  const [displayValue, setDisplayValue] = React.useState<string | number>(value);

  React.useEffect(() => {
    if (!animate) {
      setDisplayValue(value);
      return;
    }

    const rawNum = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    if (isNaN(rawNum)) {
      setDisplayValue(value);
      return;
    }

    const isFloat = String(value).includes('.');
    const decimals = isFloat ? (String(value).split('.')[1]?.length || 1) : 0;
    const duration = 650;
    const startTime = performance.now();

    let animationFrameId: number;

    const animateCount = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const current = rawNum * easedProgress;

      setDisplayValue(
        decimals > 0
          ? current.toFixed(decimals)
          : Math.round(current).toLocaleString()
      );

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animateCount);
      } else {
        setDisplayValue(value);
      }
    };

    animationFrameId = requestAnimationFrame(animateCount);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value, animate]);

  const getStatusBorder = () => {
    switch (status) {
      case 'danger': return 'rgba(244, 63, 94, 0.4)';
      case 'warning': return 'rgba(245, 158, 11, 0.4)';
      case 'success': return 'rgba(16, 185, 129, 0.4)';
      case 'info': return 'rgba(0, 242, 254, 0.4)';
      default: return 'var(--border-color)';
    }
  };

  const renderDelta = () => {
    if (!delta) return null;
    const numVal = typeof delta.value === 'number' ? delta.value : parseFloat(String(delta.value));
    const isZero = isNaN(numVal) || numVal === 0;
    const isPositive = numVal > 0;
    
    // Determine color
    let isGood = false;
    if (delta.isPositiveGood !== undefined) {
      isGood = delta.isPositiveGood ? isPositive : !isPositive;
    }

    const color = isZero ? 'var(--text-muted)' : isGood ? 'var(--color-success-text)' : 'var(--color-danger-text)';

    return (
      <span 
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: 2, 
          fontSize: 'var(--text-2xs)', 
          fontWeight: 'var(--weight-bold)',
          color,
          fontFamily: 'var(--font-mono)'
        }}
      >
        {isZero ? (
          <Minus size={12} />
        ) : isPositive ? (
          <ArrowUpRight size={13} />
        ) : (
          <ArrowDownRight size={13} />
        )}
        <span>{typeof delta.value === 'number' ? (delta.value > 0 ? `+${delta.value}%` : `${delta.value}%`) : delta.value}</span>
        {delta.label && <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: 2 }}>{delta.label}</span>}
      </span>
    );
  };

  const cardContent = (
    <div 
      className={`glass-panel ${className}`}
      style={{
        padding: 'var(--space-3-5) var(--space-4)',
        borderColor: getStatusBorder(),
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        minWidth: 160,
        position: 'relative',
        transition: 'border-color var(--duration-fast), transform var(--duration-fast)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {title}
        </span>
        {icon && <span style={{ color: 'var(--text-muted)' }}>{icon}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1-5)' }}>
        <span 
          className="tabular-nums" 
          style={{ 
            fontSize: 'var(--text-xl)', 
            fontWeight: 'var(--weight-black)', 
            color: status === 'danger' ? 'var(--color-danger-text)' : '#fff',
            lineHeight: 1.1
          }}
        >
          {displayValue}
        </span>
        {unit && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {unit}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 }}>
        {renderDelta()}
        {subtitle && (
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );

  if (tooltip) {
    return <Tooltip content={tooltip} position="top">{cardContent}</Tooltip>;
  }

  return cardContent;
};
