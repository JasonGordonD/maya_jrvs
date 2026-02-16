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
        prose prose-sm max-w-none font-holo-data
        prose-headings:text-cyan-400 prose-headings:font-mono prose-headings:tracking-wide prose-headings:[text-shadow:0_0_8px_rgba(34,211,238,0.4)]
        prose-p:text-zinc-300 prose-p:leading-relaxed
        prose-a:text-cyan-500 prose-a:no-underline hover:prose-a:text-cyan-400 hover:prose-a:[text-shadow:0_0_6px_rgba(34,211,238,0.3)]
        prose-code:text-cyan-400 prose-code:bg-[rgba(5,5,5,0.6)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-none prose-code:font-mono prose-code:border prose-code:border-[rgba(34,211,238,0.1)]
        prose-pre:bg-[rgba(5,5,5,0.65)] prose-pre:border prose-pre:border-[rgba(34,211,238,0.15)] prose-pre:rounded-none prose-pre:[backdrop-filter:blur(12px)] prose-pre:shadow-[0_0_6px_rgba(34,211,238,0.05),inset_0_1px_0_rgba(34,211,238,0.05)]
        prose-strong:text-cyan-300 prose-strong:font-semibold prose-strong:[text-shadow:0_0_6px_rgba(34,211,238,0.3)]
        prose-em:text-zinc-400 prose-em:italic
        prose-ul:text-zinc-300 prose-ol:text-zinc-300
        prose-li:marker:text-cyan-500
        prose-blockquote:border-l-[rgba(34,211,238,0.5)] prose-blockquote:text-zinc-400 prose-blockquote:bg-[rgba(5,5,5,0.3)] prose-blockquote:pl-4 prose-blockquote:py-1
        prose-hr:border-[rgba(34,211,238,0.15)]
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
