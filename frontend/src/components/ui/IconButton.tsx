import React from 'react';

export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  'aria-label'?: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(({
  children,
  icon,
  size = 'md',
  className = '',
  'aria-label': ariaLabelProp,
  ariaLabel,
  ...props
}, ref) => {
  const label = ariaLabel || ariaLabelProp || 'button';
  return (
    <button
      ref={ref}
      aria-label={label}
      title={props.title || label}

      className={`ui-icon-btn ui-icon-btn-${size} ${className}`}
      {...props}
    >
      {icon || children}
    </button>
  );
});

IconButton.displayName = 'IconButton';
