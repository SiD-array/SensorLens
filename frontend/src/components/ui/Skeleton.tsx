import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height = 20,
  borderRadius,
  circle = false,
  className = '',
  style,
  ...props
}) => {
  const inlineStyles: React.CSSProperties = {
    width: circle ? height : width,
    height,
    borderRadius: circle ? '50%' : borderRadius,
    ...style
  };

  return (
    <div
      className={`ui-skeleton ${className}`}
      style={inlineStyles}
      aria-hidden="true"
      {...props}
    />
  );
};
