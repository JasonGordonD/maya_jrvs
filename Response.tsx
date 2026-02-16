import React, { memo } from 'react';
import { Streamdown } from 'streamdown';

interface ResponseProps extends Omit<React.ComponentProps<typeof Streamdown>, 'children'> {
  children: string;
  className?: string;
}

/**
 * Streaming markdown renderer with smooth character-by-character animations.
 * Built on Streamdown for AI response streaming.
 */
export const Response: React.FC<ResponseProps> = memo(({
  children,
  className = '',
  ...props
}) => {
  return (
    <Streamdown
      className={`
        prose prose-sm max-w-none maya-text
        prose-headings:text-[var(--text-primary)] prose-headings:font-semibold prose-headings:tracking-wide
        prose-p:text-[var(--text-primary)] prose-p:leading-relaxed
        prose-a:text-[var(--accent-warm)] prose-a:no-underline hover:prose-a:text-[var(--text-primary)]
        prose-code:text-[var(--accent-warm)] prose-code:bg-[var(--glass)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-none prose-code:font-mono prose-code:border prose-code:border-[var(--border-subtle)]
        prose-pre:bg-[var(--bg-panel)] prose-pre:border prose-pre:border-[var(--border-medium)] prose-pre:rounded-none prose-pre:[backdrop-filter:blur(12px)]
        prose-strong:text-[var(--text-primary)] prose-strong:font-semibold
        prose-em:text-[var(--text-secondary)] prose-em:italic
        prose-ul:text-[var(--text-primary)] prose-ol:text-[var(--text-primary)]
        prose-li:marker:text-[var(--accent-warm)]
        prose-blockquote:border-l-[var(--accent-warm)] prose-blockquote:text-[var(--text-secondary)] prose-blockquote:bg-[var(--glass)] prose-blockquote:pl-4 prose-blockquote:py-1
        prose-hr:border-[var(--border-medium)]
        [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
        ${className}
      `}
      {...props}
    >
      {children}
    </Streamdown>
  );
});

Response.displayName = 'Response';
