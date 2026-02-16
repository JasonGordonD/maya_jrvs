
import React from 'react';
import { ArrowDown } from 'lucide-react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';

interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  from: 'user' | 'assistant';
  children: React.ReactNode;
  timestamp?: Date;
  status?: 'sent' | 'delivered' | 'read';
  metadata?: {
    memory_hit?: boolean;
    tool_call?: string;
    token_count?: number;
    model?: string;
    provider?: 'google' | 'anthropic' | 'xai' | 'mistral';
    latency_ms?: number;
  };
}

export const Message: React.FC<MessageProps> = ({
  from,
  children,
  className = '',
  timestamp,
  metadata,
  ...props
}) => {
  const time = timestamp || new Date();
  const timeString = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time
    .getSeconds()
    .toString()
    .padStart(2, '0')}`;
  const label = from === 'user' ? 'USER' : 'MAYA';
  const providerBadge = metadata?.provider ? metadata.provider.toUpperCase() : null;
  const modelBadge = metadata?.model || null;
  const tokenBadge = typeof metadata?.token_count === 'number' ? `${metadata.token_count} TOKENS` : null;
  const latencyBadge = typeof metadata?.latency_ms === 'number' ? `${metadata.latency_ms}MS` : null;

  return (
    <div
      className={`maya-message ${from === 'user' ? 'maya-message-user' : 'maya-message-model'} ${className}`}
      {...props}
    >
      <div className={`maya-message-header ${from === 'user' ? 'justify-end' : 'justify-start'}`}>
        <span className="maya-message-label">{label}</span>
        <span className="maya-message-time">{timeString}</span>
      </div>

      <MessageContent from={from}>{children}</MessageContent>

      {from === 'assistant' && (providerBadge || modelBadge || tokenBadge || latencyBadge) && (
        <div className="maya-message-meta">
          {providerBadge && <span>{providerBadge}</span>}
          {modelBadge && <span>{modelBadge}</span>}
          {tokenBadge && <span>{tokenBadge}</span>}
          {latencyBadge && <span>{latencyBadge}</span>}
        </div>
      )}
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
    <div className={`maya-avatar ${className}`}>
      {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : from === 'user' ? 'U' : 'M'}
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
  const isUser = from === 'user';
  const variantClass = variant === 'flat' ? 'maya-message-flat' : '';

  return (
    <div
      className={`maya-message-content ${isUser ? 'maya-user-bubble' : 'maya-model-raw'} ${variantClass} ${className}`}
      {...props}
    >
      {children}
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
    className={`flex flex-col w-full h-full relative overflow-hidden ${className}`}
    initial={initial}
    resize={resize}
    {...props}
  >
    {children}
  </StickToBottom>
);

interface ConversationContentProps {
  children?: React.ReactNode;
  className?: string;
}

export const ConversationContent: React.FC<ConversationContentProps> = ({
  children,
  className = ''
}) => (
  <StickToBottom.Content
    className={`flex-1 overflow-y-auto p-6 scroll-smooth maya-scrollbar ${className}`}
  >
    <div className="flex flex-col w-full max-w-3xl mx-auto">
      {children}
    </div>
  </StickToBottom.Content>
);

export const ConversationEmptyState: React.FC<{ title?: string; description?: string; icon?: React.ReactNode; className?: string; children?: React.ReactNode; }> = ({
  title = "Session idle",
  description = "Start a conversation to bring Maya online.",
  icon,
  className = '',
  children
}) => (
  <div className={`flex flex-col items-center justify-center h-full text-center space-y-5 px-12 ${className}`}>
    {children || (
      <>
        <div className="maya-empty-icon">
          {icon || <span>M</span>}
        </div>
        <div className="space-y-2">
          <h4 className="maya-empty-title">{title}</h4>
          {description && <p className="maya-empty-description">{description}</p>}
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
  onClick,
  ...props
}) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;

  return (
    <button
      onClick={(event) => {
        scrollToBottom();
        onClick?.(event);
      }}
      className={`maya-scroll-button ${className}`}
      {...props}
    >
      <ArrowDown size={12} />
      <span>Latest</span>
    </button>
  );
};
