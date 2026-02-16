import React from 'react';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'heavy' | 'light';
  glow?: boolean;
}

const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  className = '',
  variant = 'default',
  glow = true,
  ...props
}) => {
  const variants = {
    default: 'maya-panel',
    heavy: 'maya-panel maya-panel-heavy',
    light: 'maya-panel maya-panel-light',
  };

  const glowClass = glow ? 'maya-panel-accent' : '';

  return (
    <div
      className={`${variants[variant]} ${glowClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default GlassPanel;
