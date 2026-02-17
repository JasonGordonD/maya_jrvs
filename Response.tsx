import React, { memo } from 'react';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';

interface ResponseProps extends Omit<React.ComponentProps<typeof Streamdown>, 'children'> {
  children: string;
  className?: string;
}

/**
 * Streaming markdown renderer for agent responses.
 * Renders markdown to HTML via Streamdown with maya-response CSS styling.
 */
export const Response: React.FC<ResponseProps> = memo(({
  children,
  className = '',
  ...props
}) => {
  return (
    <Streamdown
      className={`maya-response ${className}`}
      {...props}
    >
      {children}
    </Streamdown>
  );
});

Response.displayName = 'Response';
