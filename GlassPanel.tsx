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
    default: 'glass-panel',
    heavy: 'glass-heavy',
    light: 'glass-light',
  };

  const glowClass = glow ? 'neon-border' : '';

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
