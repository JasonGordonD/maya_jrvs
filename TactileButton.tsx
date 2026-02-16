import React, { useRef, useCallback } from 'react';

type ButtonState = 'offline' | 'online' | 'error' | 'default';

interface TactileButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  state?: ButtonState;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

const stateStyles: Record<ButtonState, string> = {
  offline: 'maya-btn-offline',
  online: 'maya-btn-online',
  error: 'maya-btn-error',
  default: 'maya-btn-default',
};

const TactileButton: React.FC<TactileButtonProps> = ({
  state = 'default',
  icon,
  children,
  className = '',
  onClick,
  ...props
}) => {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      // White flash effect
      const btn = btnRef.current;
      if (btn) {
        btn.style.boxShadow = '0 0 20px rgba(255,255,255,0.6), inset 0 0 10px rgba(255,255,255,0.3)';
        requestAnimationFrame(() => {
          setTimeout(() => {
            btn.style.boxShadow = '';
          }, 150);
        });
      }
      onClick?.(e);
    },
    [onClick]
  );

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      className={[
        'maya-btn relative px-4 py-2 text-[11px] uppercase tracking-[0.12em] transition-all duration-150 ease-out',
        stateStyles[state],
        className,
      ].join(' ')}
      {...props}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        {icon}
        {children}
      </span>
    </button>
  );
};

export default TactileButton;
