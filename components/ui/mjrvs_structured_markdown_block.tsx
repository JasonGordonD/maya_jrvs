"use client"

import { useEffect, useState } from "react"
import { Check, Copy } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

type Mjrvs_structured_markdown_block_props = {
  content: string
  label?: string
  on_copy?: (raw_markdown: string) => Promise<boolean>
}

export function Mjrvs_structured_markdown_block({
  content,
  label,
  on_copy,
}: Mjrvs_structured_markdown_block_props) {
  const [copied, set_copied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout_id = window.setTimeout(() => {
      set_copied(false)
    }, 1500)

    return () => {
      window.clearTimeout(timeout_id)
    }
  }, [copied])

  const handle_copy = async () => {
    let copy_succeeded = false

    if (on_copy) {
      copy_succeeded = await on_copy(content)
    } else {
      try {
        await navigator.clipboard.writeText(content)
        copy_succeeded = true
      } catch {
        copy_succeeded = false
      }
    }

    if (copy_succeeded) {
      set_copied(true)
    }
  }

  return (
    <div className="rounded-md border border-sky-500/55 bg-sky-500/10 px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        {label ? (
          <p className="text-xs font-semibold tracking-wide text-sky-300">{label}</p>
        ) : (
          <span className="text-[11px] text-sky-200/75">Structured Output</span>
        )}

        <button
          type="button"
          onClick={() => {
            void handle_copy()
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-sky-500/60 bg-sky-950/30 px-2 py-1 text-[11px] text-sky-100 transition-colors hover:bg-sky-900/45",
            copied && "border-emerald-500/60 bg-emerald-900/35 text-emerald-100"
          )}
          title={copied ? "Copied markdown" : "Copy raw markdown"}
          aria-label={copied ? "Markdown copied" : "Copy raw markdown"}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      <div
        className={cn(
          "text-[13px] leading-6 text-sky-50",
          "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold",
          "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold",
          "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold",
          "[&_p]:my-2 [&_p]:whitespace-pre-wrap",
          "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
          "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_li]:my-1",
          "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-sky-400/60 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-sky-100/85",
          "[&_a]:text-sky-300 [&_a]:underline [&_a]:underline-offset-2",
          "[&_hr]:my-3 [&_hr]:border-sky-500/35",
          "[&_code]:rounded [&_code]:bg-zinc-950/55 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.82em]",
          "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-zinc-700/60 [&_pre]:bg-zinc-950/80 [&_pre]:p-3",
          "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:font-mono [&_pre_code]:text-xs",
          "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-xs",
          "[&_th]:border [&_th]:border-sky-500/30 [&_th]:bg-sky-950/50 [&_th]:px-2 [&_th]:py-1.5 [&_th]:font-semibold",
          "[&_td]:border [&_td]:border-sky-500/25 [&_td]:px-2 [&_td]:py-1.5"
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  )
}
