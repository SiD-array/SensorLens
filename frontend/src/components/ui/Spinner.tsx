import React from 'react';

export interface SpinnerProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 18,
  color = 'currentColor',
  label = 'Loading...',
  className = '',
  ...props
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`ui-spinner ${className}`}
      role="status"
      aria-label={label}
      {...props}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
};
