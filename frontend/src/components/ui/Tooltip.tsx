import React, { useState } from 'react';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  if (!content) return <>{children}</>;

  const getPositionStyle = (): React.CSSProperties => {
    switch (position) {
      case 'right':
        return {
          left: 'calc(100% + 8px)',
          right: 'auto',
          top: '50%',
          bottom: 'auto',
          transform: 'translateY(-50%)',
          whiteSpace: 'nowrap',
        };
      case 'left':
        return {
          right: 'calc(100% + 8px)',
          left: 'auto',
          top: '50%',
          bottom: 'auto',
          transform: 'translateY(-50%)',
          whiteSpace: 'nowrap',
        };
      case 'bottom':
        return {
          top: 'calc(100% + 6px)',
          bottom: 'auto',
          left: '50%',
          right: 'auto',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
        };
      case 'top':
      default:
        return {
          bottom: 'calc(100% + 6px)',
          top: 'auto',
          left: '50%',
          right: 'auto',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
        };
    }
  };

  return (
    <div
      className={`ui-tooltip-wrapper ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className="ui-tooltip-bubble"
          style={getPositionStyle()}
        >
          {content}
        </div>
      )}
    </div>
  );
};

