import React, { useRef, useCallback } from 'react';

type ButtonState = 'offline' | 'online' | 'error' | 'default';

interface TactileButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  state?: ButtonState;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

const stateStyles: Record<ButtonState, string> = {
  offline: 'border-red-500/40 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.15)] animate-[heartbeat_2s_ease-in-out_infinite]',
  online: 'border-cyan-400/50 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]',
  error: 'border-red-500/60 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.25)]',
  default: 'border-zinc-700 text-zinc-400',
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
        // Chamfered hex shape via clip-path
        '[clip-path:polygon(8px_0%,calc(100%-8px)_0%,100%_8px,100%_calc(100%-8px),calc(100%-8px)_100%,8px_100%,0%_calc(100%-8px),0%_8px)]',
        // Base styling
        'relative px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.15em]',
        'border bg-black/60 backdrop-blur-sm',
        'transition-all duration-150 ease-out',
        // Hover
        'hover:brightness-125 hover:shadow-[0_0_15px_rgba(34,211,238,0.25)]',
        // Active press
        'active:scale-95 active:brightness-150',
        // State
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
