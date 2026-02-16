
import React from 'react';
import { User, Bot, ArrowDown, BrainCircuit, Check, CheckCheck, Sparkles, Command, Zap, Database, Cpu, Activity, UserCircle, Mic } from 'lucide-react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';

interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  from: 'user' | 'assistant';
  children: React.ReactNode;
  timestamp?: Date;
  status?: 'sent' | 'delivered' | 'read';
  metadata?: {
    memory_hit?: boolean;
    tool_call?: string;
  };
}

export const Message: React.FC<MessageProps> = ({ 
  from, 
  children, 
  className = '', 
  timestamp,
  status = 'read',
  metadata,
  ...props 
}) => {
  const time = timestamp || new Date();
  const timeString = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}.${Math.floor(time.getMilliseconds() / 10).toString().padStart(2, '0')}`;
  const label = from === 'user' ? 'OPERATOR' : 'MAYA_JRVS';

  return (
    <div 
      className={`group relative flex w-full gap-4 mb-8 transition-all duration-300 ease-out ${from === 'user' ? 'flex-row-reverse' : 'flex-row'} ${className}`} 
      {...props}
    >
      <div className={`absolute top-0 bottom-[-32px] w-px bg-zinc-900 ${from === 'user' ? 'right-5' : 'left-5'} hidden lg:block`} />
      
      <MessageAvatar from={from} />
      
      <div className={`flex flex-col gap-2 max-w-[85%] ${from === 'user' ? 'items-end text-right' : 'items-start text-left'}`}>
        <div className={`flex items-center gap-3 px-1 ${from === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
          <div className="flex items-center gap-2">
            {from === 'user' ? <User size={10} className="text-cyan-400 phosphor-glow" /> : <Bot size={10} className="text-cyan-500 phosphor-glow" />}
            <span className={`text-[10px] font-bold tracking-[0.25em] uppercase font-mono ${from === 'user' ? 'text-cyan-400 phosphor-glow' : 'text-zinc-400'}`}>
              {label}
            </span>
            {from === 'assistant' && <Activity size={10} className="text-cyan-500/40 animate-pulse" />}
          </div>
          <div className="h-px w-4 bg-zinc-900" />
          <span className="text-[9px] text-zinc-700 font-mono tracking-widest tabular-nums">
            T+{timeString}
          </span>
        </div>

        {(metadata?.memory_hit || metadata?.tool_call) && (
          <div className={`flex gap-2 mb-1 ${from === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {metadata.memory_hit && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 glass-light neon-border">
                <Database size={8} className="text-cyan-400" />
                <span className="text-[8px] font-bold text-cyan-400 uppercase tracking-tighter font-mono">CORE_RECALL</span>
              </div>
            )}
            {metadata.tool_call && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 glass neon-border">
                <Cpu size={8} className="text-zinc-400" />
                <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-tighter font-mono">{metadata.tool_call}</span>
              </div>
            )}
          </div>
        )}

        <div className={`flex items-start gap-3 relative ${from === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
          <MessageContent from={from}>{children}</MessageContent>
          {from === 'user' && (
            <div className="flex flex-col gap-0.5 mt-2">
              <div className={`flex transition-opacity duration-300 ${status === 'read' ? 'opacity-100' : 'opacity-40'}`}>
                <CheckCheck size={10} className="text-cyan-500 phosphor-glow" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface MessageAvatarProps {
  src?: string;
  name?: string;
  from: 'user' | 'assistant';
  className?: string;
}

export const MessageAvatar: React.FC<MessageAvatarProps> = ({ src, name, from, className = '' }) => {
  return (
    <div className={`z-10 flex-shrink-0 w-10 h-10 flex items-center justify-center transition-all duration-300 ${from === 'user' ? 'glass-light neon-border text-cyan-400 neon-text-subtle' : 'glass neon-border text-cyan-400'} ${className}`}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        from === 'user' ? <User size={16} /> : <Bot size={16} />
      )}
    </div>
  );
};

interface MessageContentProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'contained' | 'flat';
  from: 'user' | 'assistant';
  children: React.ReactNode;
}

export const MessageContent: React.FC<MessageContentProps> = ({ 
  variant = 'contained', 
  from, 
  children, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "px-5 py-3 rounded-none text-[13px] leading-relaxed transition-all duration-200 break-words font-sans selection:bg-cyan-500/40 relative";

  const variants = {
    contained: from === 'user'
      ? "glass-light neon-border text-cyan-50"
      : "glass-panel text-zinc-300",
    flat: from === 'user'
      ? "text-cyan-400 glass-light px-3 py-1.5"
      : "text-zinc-500 glass px-3 py-1.5"
  };

  const accentLine = from === 'user'
    ? "absolute right-0 top-0 bottom-0 w-[2px] bg-cyan-500/60 shadow-[0_0_8px_rgba(34,211,238,0.4)]"
    : "absolute left-0 top-0 bottom-0 w-[2px] bg-cyan-500/20 shadow-[0_0_4px_rgba(34,211,238,0.15)]";

  return (
    <div 
      className={`${baseStyles} ${variants[variant]} ${className}`} 
      {...props}
    >
      <div className={accentLine} />
      <div className="relative z-10">{children}</div>
    </div>
  );
};

interface ConversationProps extends React.ComponentProps<typeof StickToBottom> {
  className?: string;
}

export const Conversation: React.FC<ConversationProps> = ({
  children,
  className = '',
  initial = "smooth",
  resize = "smooth",
  ...props
}) => (
  <StickToBottom
    className={`flex flex-col w-full h-full relative overflow-hidden glass ${className}`}
    initial={initial}
    resize={resize}
    {...props}
  >
    {children}
  </StickToBottom>
);

interface ConversationContentProps extends React.ComponentProps<typeof StickToBottom.Content> {
  className?: string;
}

export const ConversationContent: React.FC<ConversationContentProps> = ({
  children,
  className = '',
  ...props
}) => (
  <StickToBottom.Content
    className={`flex-1 overflow-y-auto p-8 scroll-smooth holo-scrollbar ${className}`}
    {...props}
  >
    <div className="flex flex-col w-full max-w-4xl mx-auto">
      {children}
    </div>
  </StickToBottom.Content>
);

export const ConversationEmptyState: React.FC<{ title?: string; description?: string; icon?: React.ReactNode; className?: string; children?: React.ReactNode; }> = ({
  title = "LINK_IDLE",
  description = "AWAITING_TRACE_INJECTION_AND_HANDSHAKE.",
  icon,
  className = '',
  children
}) => (
  <div className={`flex flex-col items-center justify-center h-full text-center space-y-6 px-12 animate-pulse ${className}`}>
    {children || (
      <>
        <div className="relative p-10 glass-panel neon-border-pulse">
          {icon || <BrainCircuit className="w-14 h-14 text-cyan-500/10" />}
        </div>
        <div className="space-y-3">
          <h4 className="font-holo-label text-zinc-600 tracking-[0.5em] neon-text-subtle" style={{ fontSize: '11px' }}>{title}</h4>
          {description && <p className="text-[10px] text-zinc-700 max-w-[280px] mx-auto leading-relaxed font-bold tracking-widest font-mono uppercase">{description}</p>}
        </div>
      </>
    )}
  </div>
);

interface ConversationScrollButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
}

export const ConversationScrollButton: React.FC<ConversationScrollButtonProps> = ({
  className = '',
  ...props
}) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;

  return (
    <button
      onClick={scrollToBottom}
      className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-50
        flex items-center gap-2 px-4 py-2
        glass-heavy neon-border-strong
        text-cyan-400 font-holo-label
        hover:brightness-125
        transition-all duration-200
        [clip-path:polygon(6px_0%,calc(100%-6px)_0%,100%_6px,100%_calc(100%-6px),calc(100%-6px)_100%,6px_100%,0%_calc(100%-6px),0%_6px)]
        ${className}`}
      {...props}
    >
      <ArrowDown size={12} />
      <span>SCROLL_TO_LATEST</span>
    </button>
  );
};
