"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"

import { ConversationBar } from "@/components/ui/conversation-bar"
import { Message, MessageContent } from "@/components/ui/message"
import { MicSelector } from "@/components/ui/mic-selector"
import { Response } from "@/components/ui/response"
import { cn } from "@/lib/utils"

type ConversationEvent = { source: "user" | "ai"; message: string }

type TranscriptMessage = {
  id: string
  source: "user" | "ai"
  message: string
}

type ToolLogEntry = {
  id: string
  timestamp: string
  toolName: string
  parameters: string
  resultSummary: string
}

type ErrorSeverity = "auth" | "timeout" | "connection" | "other"

type ErrorLogEntry = {
  id: string
  timestamp: string
  message: string
  severity: ErrorSeverity
}

type MobilePanelTab = "tools" | "errors"

const createMessageId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`

const createTimestamp = () =>
  new Date().toLocaleTimeString("en-GB", { hour12: false })

const cleanInline = (value: string) => value.replace(/\s+/g, " ").trim()

const truncate = (value: string, max = 120) =>
  value.length > max ? `${value.slice(0, max - 3)}...` : value

const stringifyUnknown = (value: unknown): string => {
  if (typeof value === "string") return value

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const toolKeywordPattern =
  /\b(tool|dispatch|mjrvs_|tool_call|function_call|query|result)\b/i

const extractToolNameFromText = (text: string): string | null => {
  const match =
    text.match(/\b(mjrvs_[a-z0-9_:-]+)\b/i) ??
    text.match(/\btool(?:_name)?\s*[:=]\s*["']?([a-z0-9_.:-]+)["']?/i) ??
    text.match(
      /\b(?:function|name)\s*[:=]\s*["']?([a-z0-9_.:-]*tool[a-z0-9_.:-]*)["']?/i
    )

  return match?.[1] ? match[1].trim() : null
}

const extractParametersFromText = (text: string): string => {
  const queryMatch = text.match(
    /\bquery\b[^a-z0-9]{0,3}(?:"([^"]+)"|'([^']+)'|([^,\n;]+))/i
  )
  if (queryMatch) {
    const value = queryMatch[1] || queryMatch[2] || queryMatch[3] || ""
    return `query: "${truncate(cleanInline(value), 60)}"`
  }

  const paramsMatch = text.match(
    /\b(params?|arguments?|input)\b[^a-z0-9]{0,3}(\{[\s\S]*?\}|\[[\s\S]*?\]|"[^"]+"|'[^']+'|[^,\n;]+)/i
  )
  if (paramsMatch?.[2]) {
    return `${paramsMatch[1]}: ${truncate(cleanInline(paramsMatch[2]), 90)}`
  }

  return "params: n/a"
}

const extractResultSummaryFromText = (text: string): string => {
  const resultsCountMatch = text.match(/\b(\d+\s+results?)\b/i)
  if (resultsCountMatch?.[1]) {
    return resultsCountMatch[1]
  }

  const resultMatch = text.match(
    /\b(result|output|summary|status)\b[^a-z0-9]{0,3}([^,\n;]+)/i
  )
  if (resultMatch?.[2]) {
    return truncate(cleanInline(resultMatch[2]), 90)
  }

  if (/\b(success|ok|completed)\b/i.test(text)) {
    return "success"
  }
  if (/\b(error|failed|exception)\b/i.test(text)) {
    return "error"
  }

  return truncate(cleanInline(text), 90)
}

const findFirstMatchingKeyValue = (
  input: unknown,
  keys: string[]
): unknown => {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()))
  const queue: unknown[] = [input]
  const visited = new Set<unknown>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || typeof current !== "object" || visited.has(current)) {
      continue
    }

    visited.add(current)

    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }

    const record = current as Record<string, unknown>
    for (const [key, value] of Object.entries(record)) {
      if (normalizedKeys.has(key.toLowerCase())) {
        return value
      }
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        queue.push(value)
      }
    }
  }

  return undefined
}

const createToolLogEntryFromText = (
  rawText: string
): Omit<ToolLogEntry, "id" | "timestamp"> | null => {
  const text = cleanInline(rawText)
  const toolName = extractToolNameFromText(text)

  if (!toolName && !toolKeywordPattern.test(text)) {
    return null
  }

  return {
    toolName: toolName ?? "tool-dispatch",
    parameters: extractParametersFromText(text),
    resultSummary: extractResultSummaryFromText(text),
  }
}

const createToolLogEntry = (payload: unknown): ToolLogEntry | null => {
  if (typeof payload === "string") {
    const parsed = createToolLogEntryFromText(payload)
    if (!parsed) return null

    return {
      id: createMessageId(),
      timestamp: createTimestamp(),
      ...parsed,
    }
  }

  if (!payload || typeof payload !== "object") {
    return null
  }

  const toolNameValue = findFirstMatchingKeyValue(payload, [
    "toolName",
    "tool_name",
    "tool",
    "function",
    "function_name",
    "name",
  ])
  const parametersValue = findFirstMatchingKeyValue(payload, [
    "parameters",
    "params",
    "arguments",
    "args",
    "input",
    "query",
  ])
  const resultValue = findFirstMatchingKeyValue(payload, [
    "result",
    "results",
    "output",
    "response",
    "summary",
    "status",
  ])

  const raw = cleanInline(stringifyUnknown(payload))
  const fallbackFromText = createToolLogEntryFromText(raw)

  if (!toolNameValue && !fallbackFromText) {
    return null
  }

  const toolName =
    (toolNameValue ? cleanInline(stringifyUnknown(toolNameValue)) : null) ??
    fallbackFromText?.toolName ??
    "tool-dispatch"

  const parameters = parametersValue
    ? `params: ${truncate(cleanInline(stringifyUnknown(parametersValue)), 90)}`
    : fallbackFromText?.parameters ?? "params: n/a"

  const resultSummary = resultValue
    ? truncate(cleanInline(stringifyUnknown(resultValue)), 90)
    : fallbackFromText?.resultSummary ?? "result unavailable"

  return {
    id: createMessageId(),
    timestamp: createTimestamp(),
    toolName,
    parameters,
    resultSummary,
  }
}

const mergeAssistantMessage = (previous: string, incoming: string): string => {
  if (!previous) return incoming
  if (!incoming) return previous

  if (incoming.startsWith(previous)) return incoming
  if (previous.startsWith(incoming)) return previous
  if (previous.endsWith(incoming)) return previous

  const spacer = previous.endsWith(" ") || incoming.startsWith(" ") ? "" : " "
  return `${previous}${spacer}${incoming}`
}

const classifyErrorSeverity = (message: string): ErrorSeverity => {
  const normalized = message.toLowerCase()

  if (
    /\b(401|403)\b/.test(normalized) ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("auth")
  ) {
    return "auth"
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("etimedout")
  ) {
    return "timeout"
  }

  if (
    normalized.includes("connection") ||
    normalized.includes("network") ||
    normalized.includes("websocket") ||
    normalized.includes("disconnect")
  ) {
    return "connection"
  }

  return "other"
}

const errorSeverityClassMap: Record<ErrorSeverity, string> = {
  auth: "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100",
  timeout:
    "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-950/40 dark:text-yellow-100",
  connection:
    "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
  other:
    "border-zinc-300 bg-zinc-50 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100",
}

export default function Home() {
  const [messages, setMessages] = useState<TranscriptMessage[]>([])
  const [selectedMicId, setSelectedMicId] = useState<string>("")
  const [toolLogEntries, setToolLogEntries] = useState<ToolLogEntry[]>([])
  const [errorLogEntries, setErrorLogEntries] = useState<ErrorLogEntry[]>([])
  const [isToolPanelOpen, setIsToolPanelOpen] = useState(true)
  const [mobilePanelTab, setMobilePanelTab] = useState<MobilePanelTab>("tools")
  const transcriptRef = useRef<HTMLDivElement>(null)
  const toolLogRef = useRef<HTMLDivElement>(null)
  const errorLogRef = useRef<HTMLDivElement>(null)

  const getSignedUrl = useCallback(async () => {
    const response = await fetch("/api/signed-url", {
      method: "GET",
      cache: "no-store",
    })

    if (!response.ok) {
      const details = await response.text()
      throw new Error(
        `Unable to retrieve signed URL (${response.status}): ${details || "Unknown error"}`
      )
    }

    const data = (await response.json()) as { signedUrl?: string }

    if (!data.signedUrl) {
      throw new Error("Signed URL response missing signedUrl field")
    }

    return data.signedUrl
  }, [])

  useEffect(() => {
    if (!transcriptRef.current) return
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    if (!toolLogRef.current) return
    toolLogRef.current.scrollTop = toolLogRef.current.scrollHeight
  }, [toolLogEntries, isToolPanelOpen])

  useEffect(() => {
    if (!errorLogRef.current) return
    errorLogRef.current.scrollTop = errorLogRef.current.scrollHeight
  }, [errorLogEntries])

  const appendToolLogEntry = useCallback((entry: ToolLogEntry | null) => {
    if (!entry) return

    setToolLogEntries((previous) => {
      const last = previous[previous.length - 1]
      if (
        last &&
        last.toolName === entry.toolName &&
        last.parameters === entry.parameters &&
        last.resultSummary === entry.resultSummary
      ) {
        return previous
      }

      return [...previous, entry]
    })
  }, [])

  const handleConversationDebug = useCallback(
    (event: unknown) => {
      console.log("[JRVS] onDebug", event)
      appendToolLogEntry(createToolLogEntry(event))
    },
    [appendToolLogEntry]
  )

  const handleConversationMessage = useCallback((event: ConversationEvent) => {
    console.log("[JRVS] onMessage", event)
    appendToolLogEntry(createToolLogEntry(event.message))

    const content = event.message.trim()
    if (!content) return

    setMessages((previous) => {
      const last = previous[previous.length - 1]

      if (event.source === "user") {
        if (last?.source === "user" && last.message === content) {
          return previous
        }

        return [
          ...previous,
          {
            id: createMessageId(),
            source: "user",
            message: content,
          },
        ]
      }

      if (last?.source === "ai") {
        const merged = mergeAssistantMessage(last.message, content)
        if (merged === last.message) {
          return previous
        }

        return [
          ...previous.slice(0, -1),
          {
            ...last,
            message: merged,
          },
        ]
      }

      return [
        ...previous,
        {
          id: createMessageId(),
          source: "ai",
          message: content,
        },
      ]
    })
  }, [appendToolLogEntry])

  const handleUserTextMessage = useCallback((message: string) => {
    const content = message.trim()
    if (!content) return

    setMessages((previous) => {
      const last = previous[previous.length - 1]
      if (last?.source === "user" && last.message === content) {
        return previous
      }

      return [
        ...previous,
        {
          id: createMessageId(),
          source: "user",
          message: content,
        },
      ]
    })
  }, [])

  const handleConversationError = useCallback((error: Error) => {
    console.error("[JRVS] onError", error)

    const message = error.message || "Unknown conversation error"
    setErrorLogEntries((previous) => [
      ...previous,
      {
        id: createMessageId(),
        timestamp: createTimestamp(),
        message,
        severity: classifyErrorSeverity(message),
      },
    ])
  }, [])

  const renderToolLogPanel = () => (
    <div className="bg-card flex min-h-0 h-full flex-col overflow-hidden rounded-xl border shadow-sm">
      <button
        type="button"
        onClick={() => setIsToolPanelOpen((open) => !open)}
        className="hover:bg-muted/40 flex items-center justify-between border-b px-4 py-3 text-left transition-colors"
      >
        <div>
          <h2 className="text-sm font-medium">Tool Call Log</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {toolLogEntries.length} entries
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform",
            isToolPanelOpen ? "rotate-180" : "rotate-0"
          )}
        />
      </button>

      {isToolPanelOpen && (
        <div
          ref={toolLogRef}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
        >
          {toolLogEntries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Tool calls may not be visible in the current agent configuration
            </p>
          ) : (
            toolLogEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-md border bg-muted/20 px-2 py-2 text-xs"
              >
                <p className="font-mono leading-5 break-words">
                  [{entry.timestamp}] {entry.toolName} {"->"} {entry.parameters}{" "}
                  {"->"} {entry.resultSummary}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )

  const renderErrorPanel = () => (
    <div className="bg-card flex min-h-0 h-full flex-col overflow-hidden rounded-xl border shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-medium">Error Log</h2>
      </div>

      <div
        ref={errorLogRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
      >
        {errorLogEntries.length === 0 ? (
          <p className="text-muted-foreground text-sm">No errors</p>
        ) : (
          errorLogEntries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "rounded-md border px-2 py-2 text-xs",
                errorSeverityClassMap[entry.severity]
              )}
            >
              <p className="font-mono">[{entry.timestamp}]</p>
              <p className="mt-1 break-words whitespace-pre-wrap">
                {entry.message}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-7xl flex-col gap-4 md:h-[calc(100vh-3rem)] md:flex-row md:gap-6">
        <section className="flex min-h-0 w-full flex-col md:w-[70%]">
          <h1 className="mb-4 text-3xl font-semibold">JRVS Dashboard</h1>

          <div className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-medium">Live Transcript</h2>
            </div>

            <div
              ref={transcriptRef}
              className="flex-1 space-y-1 overflow-y-auto px-4 py-2"
            >
              {messages.length === 0 ? (
                <div className="text-muted-foreground flex h-full items-center justify-center py-10 text-sm">
                  Start a conversation to see live transcript messages.
                </div>
              ) : (
                messages.map((entry) => (
                  <Message
                    key={entry.id}
                    from={entry.source === "user" ? "user" : "assistant"}
                  >
                    <MessageContent
                      variant={entry.source === "user" ? "contained" : "flat"}
                      className={entry.source === "ai" ? "max-w-[90%]" : ""}
                    >
                      {entry.source === "ai" ? (
                        <Response>{entry.message}</Response>
                      ) : (
                        <p className="whitespace-pre-wrap">{entry.message}</p>
                      )}
                    </MessageContent>
                  </Message>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <ConversationBar
              agentId={process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID}
              getSignedUrl={getSignedUrl}
              inputDeviceId={selectedMicId || undefined}
              onConnect={() => {
                console.log("[JRVS] onConnect")
              }}
              onDisconnect={() => {
                console.log("[JRVS] onDisconnect")
              }}
              onMessage={handleConversationMessage}
              onDebug={handleConversationDebug}
              onSendMessage={handleUserTextMessage}
              onError={handleConversationError}
            />

            <div className="flex justify-end">
              <MicSelector
                value={selectedMicId}
                onValueChange={(deviceId) => setSelectedMicId(deviceId)}
              />
            </div>
          </div>

          <div className="mt-4 min-h-0 md:hidden">
            <div className="bg-muted inline-flex rounded-md p-1">
              <button
                type="button"
                onClick={() => setMobilePanelTab("tools")}
                className={cn(
                  "rounded px-3 py-1.5 text-sm",
                  mobilePanelTab === "tools"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                )}
              >
                Tools
              </button>
              <button
                type="button"
                onClick={() => setMobilePanelTab("errors")}
                className={cn(
                  "rounded px-3 py-1.5 text-sm",
                  mobilePanelTab === "errors"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                )}
              >
                Errors
              </button>
            </div>

            <div className="mt-3 h-[260px] min-h-0">
              {mobilePanelTab === "tools"
                ? renderToolLogPanel()
                : renderErrorPanel()}
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 md:flex md:w-[30%] md:flex-col md:gap-4">
          <div className="min-h-0 flex-[3]">{renderToolLogPanel()}</div>
          <div className="min-h-0 flex-[2]">{renderErrorPanel()}</div>
        </aside>
      </div>
    </main>
  )
}
