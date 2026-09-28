import React from 'react';

export type BadgeVariant = 'cyan' | 'blue' | 'success' | 'warning' | 'danger' | 'neutral' | 'ref';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  withDot?: boolean;
  mono?: boolean;
  isTabular?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'cyan',
  size = 'md',
  withDot = false,
  mono = false,
  isTabular = false,
  className = '',
  ...props
}) => {
  const isMono = mono || isTabular;
  return (
    <span
      className={`ui-badge ui-badge-${variant} ${size === 'sm' ? 'ui-badge-sm' : ''} ${isMono ? 'tabular-nums' : ''} ${className}`}
      {...props}
    >

      {withDot && <span className="ui-badge-dot" />}
      {children}
    </span>
  );
};
