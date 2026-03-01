"use client"

import { memo, useCallback, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Check, Clipboard } from "lucide-react"

import { cn } from "@/lib/utils"

interface MjrvsStructuredContentProps {
  content: string
  label?: string
  className?: string
}

export const MjrvsStructuredContent = memo(
  ({ content, label, className }: MjrvsStructuredContentProps) => {
    const [copied, setCopied] = useState(false)

    const handleCopyRaw = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      } catch {
        /* clipboard access denied */
      }
    }, [content])

    return (
      <div className={cn("relative", className)}>
        {label && (
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-sky-300">
            {label}
          </p>
        )}

        <div className="prose prose-invert prose-sm max-w-none break-words [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-zinc-900/80 [&_pre]:p-3 [&_code]:rounded [&_code]:bg-zinc-800/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:border-collapse [&_th]:border [&_th]:border-zinc-700 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-zinc-700 [&_td]:px-2 [&_td]:py-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>

        <button
          type="button"
          onClick={() => void handleCopyRaw()}
          className={cn(
            "absolute top-0 right-0 inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/90 px-1.5 py-1 text-[11px] text-zinc-300 opacity-0 transition-opacity",
            "group-hover:opacity-100 focus-visible:opacity-100"
          )}
          title={copied ? "Copied" : "Copy raw markdown"}
          aria-label={copied ? "Markdown copied" : "Copy raw markdown"}
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Clipboard className="h-3 w-3" />
          )}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    )
  }
)

MjrvsStructuredContent.displayName = "MjrvsStructuredContent"
