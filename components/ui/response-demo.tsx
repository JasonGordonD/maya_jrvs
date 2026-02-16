import React, { useState, useEffect, useRef } from "react";
import { Response } from "./response";

const DEMO_MARKDOWN = `# Welcome to Maya JRVS

Here's a quick overview of the **Response** component capabilities.

## Features

- **Streaming** character-by-character rendering
- Full *markdown* support with syntax highlighting
- Smooth animations powered by Streamdown

## Code Example

\`\`\`javascript
const greeting = "Hello from Maya JRVS!"
console.log(greeting)
\`\`\`

> Built for real-time AI conversations with elegant typography.

That's a brief tour — the component handles **headings**, lists, \`inline code\`, blockquotes, and much more.`;

export const ResponseDemo: React.FC = () => {
  const [text, setText] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = 0;
    setText("");

    const interval = setInterval(() => {
      if (indexRef.current < DEMO_MARKDOWN.length) {
        const chunk = DEMO_MARKDOWN.slice(0, indexRef.current + 2);
        setText(chunk);
        indexRef.current += 2;
      } else {
        clearInterval(interval);
      }
    }, 18);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        padding: 24,
        maxHeight: 400,
        overflow: "auto",
        background: "var(--bg-surface)",
        borderRadius: 8,
        border: "1px solid var(--border-medium)",
      }}
    >
      <Response>{text}</Response>
    </div>
  );
};

export default ResponseDemo;
