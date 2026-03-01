"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Download,
  RotateCcw,
  Search,
} from "lucide-react"

import {
  ConversationBar,
  type AudioInputMode,
  type ConversationClientTools,
} from "@/components/ui/conversation-bar"
import { Message, MessageContent } from "@/components/ui/message"
import { MicSelector } from "@/components/ui/mic-selector"
import { Response } from "@/components/ui/response"
import { cn } from "@/lib/utils"

type ConversationEvent = { source: "user" | "ai"; message: string }

type TranscriptMessage = {
  id: string
  timestamp: string
  source: "user" | "ai" | "structured"
  message: string
  label?: string
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
type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"

type DisplayStructuredContentParams = {
  content: string
  label?: string
}

type ReportToolDispatchParams = {
  tool_name: string
  action?: string
  params?: string
  result_summary?: string
}

type ReportActiveNodeParams = {
  node_name: string
  node_type?: string
}

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

const truncateConversationId = (id: string): string => {
  if (id.length <= 18) return id
  return `${id.slice(0, 8)}...${id.slice(-6)}`
}

const getSpeakerLabel = (entry: TranscriptMessage): string => {
  if (entry.source === "user") return "User"
  if (entry.source === "ai") return "Maya"
  return entry.label ? `Structured (${entry.label})` : "Structured"
}

const formatTranscriptLine = (entry: TranscriptMessage): string =>
  `[${entry.timestamp}] ${getSpeakerLabel(entry)}: ${entry.message}`

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const formatTranscriptExportDate = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")

const formatTranscriptExportFilename = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const year = String(date.getFullYear()).slice(-2)
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `mjrvs_trans_${month}${day}${year}_${hours}${minutes}.md`
}

const formatTranscriptExportMarkdown = ({
  generatedAt,
  conversationId,
  durationSeconds,
  messages,
}: {
  generatedAt: Date
  conversationId: string
  durationSeconds: number
  messages: TranscriptMessage[]
}): string => {
  const hasDuration = durationSeconds > 0 || messages.length > 0
  const transcriptBody =
    messages.length === 0
      ? "_No transcript messages._"
      : messages
          .map((entry) => {
            const content = entry.message.trim() || "_(empty message)_"
            return `**[${entry.timestamp}] ${getSpeakerLabel(entry)}:**\n${content}`
          })
          .join("\n\n")

  return `# JRVS Transcript
**Date:** ${formatTranscriptExportDate(generatedAt)}
**Session:** ${conversationId || "Not available"}
**Duration:** ${hasDuration ? formatSessionDuration(durationSeconds) : "Not available"}

---

${transcriptBody}
`
}

const transcriptMatchClassName =
  "rounded-sm bg-amber-300/75 px-0.5 text-zinc-900 dark:bg-amber-300/85 dark:text-zinc-950"

const activeTranscriptMatchClassName =
  "rounded-sm bg-emerald-300/80 px-0.5 text-zinc-900 dark:bg-emerald-300/90 dark:text-zinc-950"

const setTranscriptMatchActiveState = (
  element: HTMLElement,
  isActive: boolean
) => {
  element.className = isActive
    ? activeTranscriptMatchClassName
    : transcriptMatchClassName
}

const countMatchesInText = (text: string, query: string): number => {
  if (!query) return 0
  const matcher = new RegExp(escapeRegExp(query), "gi")
  let count = 0
  while (matcher.exec(text)) {
    count += 1
  }
  return count
}

const countTranscriptMatches = (
  transcriptEntries: TranscriptMessage[],
  query: string
): number => {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return 0

  return transcriptEntries.reduce(
    (total, entry) => total + countMatchesInText(formatTranscriptLine(entry), normalizedQuery),
    0
  )
}

const copyButtonClassName =
  "inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 font-mono text-xs transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"

const formatSessionDuration = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

const normalizeNodeLabel = (value: string): string =>
  value
    .replace(/^["'`[\s]+|["'`\].,;:\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()

const extractNodeFromMessage = (message: string): string | null => {
  const patterns = [
    /\bnode\s*[:=-]\s*([A-Za-z0-9 .()'/-]{2,80})/i,
    /\bactive\s+node\s*[:=-]\s*([A-Za-z0-9 .()'/-]{2,80})/i,
    /\bswitch(?:ing)?\s+to\s+([A-Za-z0-9 .()'/-]{2,80})/i,
    /\brout(?:e|ed)\s+to\s+([A-Za-z0-9 .()'/-]{2,80})/i,
    /"node"\s*:\s*"([^"]{2,80})"/i,
    /"activeNode"\s*:\s*"([^"]{2,80})"/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (!match?.[1]) continue

    const normalized = normalizeNodeLabel(match[1])
    if (normalized && normalized.length <= 80) {
      return normalized
    }
  }

  return null
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

const statusDotClassMap: Record<ConnectionStatus, string> = {
  connected: "bg-emerald-500",
  disconnected: "bg-zinc-400 dark:bg-zinc-500",
  connecting: "bg-amber-400 animate-pulse",
  disconnecting: "bg-amber-400 animate-pulse",
}

const audioModeLabelMap: Record<AudioInputMode, string> = {
  mic: "Mic Only",
  device: "Device Audio",
  mixed: "Mic + Device Audio",
}

export default function Home() {
  const [messages, setMessages] = useState<TranscriptMessage[]>([])
  const [selectedMicId, setSelectedMicId] = useState<string>("")
  const [audioInputMode, setAudioInputMode] = useState<AudioInputMode>("mic")
  const [systemAudioCaptureSupported, setSystemAudioCaptureSupported] =
    useState(false)
  const [systemAudioCaptureLive, setSystemAudioCaptureLive] = useState(false)
  const [audioModeRestartSignal, setAudioModeRestartSignal] = useState(0)
  const [newSessionSignal, setNewSessionSignal] = useState(0)
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState(0)
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
  const [useStructuredToolDispatch, setUseStructuredToolDispatch] =
    useState(false)
  const [useAuthoritativeNodeUpdates, setUseAuthoritativeNodeUpdates] =
    useState(false)
  const [activeNode, setActiveNode] = useState<string>("—")
  const [conversationId, setConversationId] = useState<string>("")
  const [copiedConversationId, setCopiedConversationId] = useState(false)
  const [copiedTranscript, setCopiedTranscript] = useState(false)
  const [isTranscriptSearchOpen, setIsTranscriptSearchOpen] = useState(false)
  const [transcriptSearchQuery, setTranscriptSearchQuery] = useState("")
  const [activeTranscriptMatchIndex, setActiveTranscriptMatchIndex] =
    useState(-1)
  const [copiedToolLog, setCopiedToolLog] = useState(false)
  const [copiedErrorLog, setCopiedErrorLog] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected")
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [toolLogEntries, setToolLogEntries] = useState<ToolLogEntry[]>([])
  const [errorLogEntries, setErrorLogEntries] = useState<ErrorLogEntry[]>([])
  const [isToolPanelOpen, setIsToolPanelOpen] = useState(true)
  const [mobilePanelTab, setMobilePanelTab] = useState<MobilePanelTab>("tools")
  const transcriptRef = useRef<HTMLDivElement>(null)
  const transcriptSearchInputRef = useRef<HTMLInputElement>(null)
  const transcriptMatchElementsRef = useRef<HTMLElement[]>([])
  const toolLogRef = useRef<HTMLDivElement>(null)
  const errorLogRef = useRef<HTMLDivElement>(null)

  const transcriptMatchCount = useMemo(() => {
    if (!isTranscriptSearchOpen) return 0
    return countTranscriptMatches(messages, transcriptSearchQuery)
  }, [isTranscriptSearchOpen, messages, transcriptSearchQuery])

  const activeTranscriptMatchDisplayIndex = useMemo(() => {
    if (transcriptMatchCount === 0) return 0
    return Math.min(
      Math.max(activeTranscriptMatchIndex + 1, 1),
      transcriptMatchCount
    )
  }, [activeTranscriptMatchIndex, transcriptMatchCount])

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

  useEffect(() => {
    setSystemAudioCaptureSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getDisplayMedia
    )
  }, [])

  useEffect(() => {
    if (connectionStatus !== "connected" || sessionStartedAt === null) return

    const updateDuration = () => {
      setSessionDurationSeconds(
        Math.floor((Date.now() - sessionStartedAt) / 1000)
      )
    }

    updateDuration()
    const intervalId = window.setInterval(updateDuration, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [connectionStatus, sessionStartedAt])

  useEffect(() => {
    if (!copiedConversationId) return

    const timeoutId = window.setTimeout(() => {
      setCopiedConversationId(false)
    }, 1500)

    return () => window.clearTimeout(timeoutId)
  }, [copiedConversationId])

  useEffect(() => {
    if (!copiedTranscript) return

    const timeoutId = window.setTimeout(() => {
      setCopiedTranscript(false)
    }, 1500)

    return () => window.clearTimeout(timeoutId)
  }, [copiedTranscript])

  useEffect(() => {
    if (!copiedToolLog) return

    const timeoutId = window.setTimeout(() => {
      setCopiedToolLog(false)
    }, 1500)

    return () => window.clearTimeout(timeoutId)
  }, [copiedToolLog])

  useEffect(() => {
    if (!copiedErrorLog) return

    const timeoutId = window.setTimeout(() => {
      setCopiedErrorLog(false)
    }, 1500)

    return () => window.clearTimeout(timeoutId)
  }, [copiedErrorLog])

  useEffect(() => {
    if (!copiedMessageId) return

    const timeoutId = window.setTimeout(() => {
      setCopiedMessageId(null)
    }, 1200)

    return () => window.clearTimeout(timeoutId)
  }, [copiedMessageId])

  const clearTranscriptHighlights = useCallback(() => {
    const container = transcriptRef.current
    transcriptMatchElementsRef.current = []
    if (!container) return

    const highlights = container.querySelectorAll<HTMLElement>(
      'mark[data-transcript-match="true"]'
    )
    highlights.forEach((highlight) => {
      const parent = highlight.parentNode
      if (!parent) return
      parent.replaceChild(
        document.createTextNode(highlight.textContent ?? ""),
        highlight
      )
      parent.normalize()
    })
  }, [])

  const closeTranscriptSearch = useCallback(() => {
    setIsTranscriptSearchOpen(false)
    setTranscriptSearchQuery("")
    setActiveTranscriptMatchIndex(-1)
    clearTranscriptHighlights()
  }, [clearTranscriptHighlights])

  const navigateTranscriptMatches = useCallback((direction: -1 | 1) => {
    setActiveTranscriptMatchIndex((previous) => {
      const totalMatches = transcriptMatchElementsRef.current.length
      if (totalMatches === 0) return -1
      if (previous < 0 || previous >= totalMatches) {
        return direction === 1 ? 0 : totalMatches - 1
      }

      return (previous + direction + totalMatches) % totalMatches
    })
  }, [])

  useEffect(() => {
    if (!isTranscriptSearchOpen) return
    const frameId = window.requestAnimationFrame(() => {
      transcriptSearchInputRef.current?.focus()
      transcriptSearchInputRef.current?.select()
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [isTranscriptSearchOpen])

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      const isFindShortcut =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f"

      if (isFindShortcut) {
        event.preventDefault()
        setIsTranscriptSearchOpen(true)
        return
      }

      if (event.key === "Escape" && isTranscriptSearchOpen) {
        event.preventDefault()
        closeTranscriptSearch()
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown, true)
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown, true)
    }
  }, [closeTranscriptSearch, isTranscriptSearchOpen])

  useEffect(() => {
    clearTranscriptHighlights()

    const query = transcriptSearchQuery.trim()
    if (!isTranscriptSearchOpen || !query) {
      return
    }

    const container = transcriptRef.current
    if (!container) return

    const matcher = new RegExp(escapeRegExp(query), "gi")
    const entryNodes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-transcript-entry='true']")
    )
    const nextMatches: HTMLElement[] = []

    entryNodes.forEach((entryNode) => {
      const walker = document.createTreeWalker(entryNode, NodeFilter.SHOW_TEXT, {
        acceptNode: (candidate) => {
          if (!(candidate instanceof Text)) {
            return NodeFilter.FILTER_REJECT
          }

          if (!candidate.textContent?.trim()) {
            return NodeFilter.FILTER_REJECT
          }

          const parentElement = candidate.parentElement
          if (!parentElement) {
            return NodeFilter.FILTER_REJECT
          }

          if (parentElement.closest("button")) {
            return NodeFilter.FILTER_REJECT
          }

          return NodeFilter.FILTER_ACCEPT
        },
      })

      const textNodes: Text[] = []
      while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text)
      }

      textNodes.forEach((textNode) => {
        const text = textNode.textContent ?? ""
        matcher.lastIndex = 0
        if (!matcher.test(text)) {
          return
        }
        matcher.lastIndex = 0

        const fragment = document.createDocumentFragment()
        let cursor = 0

        for (const match of text.matchAll(matcher)) {
          const matchStart = match.index ?? 0
          const matchText = match[0]

          if (matchStart > cursor) {
            fragment.appendChild(
              document.createTextNode(text.slice(cursor, matchStart))
            )
          }

          const highlight = document.createElement("mark")
          highlight.dataset.transcriptMatch = "true"
          highlight.textContent = matchText
          setTranscriptMatchActiveState(highlight, false)
          nextMatches.push(highlight)
          fragment.appendChild(highlight)
          cursor = matchStart + matchText.length
        }

        if (cursor < text.length) {
          fragment.appendChild(document.createTextNode(text.slice(cursor)))
        }

        textNode.parentNode?.replaceChild(fragment, textNode)
      })
    })

    transcriptMatchElementsRef.current = nextMatches
  }, [clearTranscriptHighlights, isTranscriptSearchOpen, messages, transcriptSearchQuery])

  useEffect(() => {
    const matches = transcriptMatchElementsRef.current
    if (matches.length === 0) return

    matches.forEach((matchElement, index) => {
      setTranscriptMatchActiveState(
        matchElement,
        index === activeTranscriptMatchIndex
      )
    })

    if (
      activeTranscriptMatchIndex >= 0 &&
      activeTranscriptMatchIndex < matches.length
    ) {
      matches[activeTranscriptMatchIndex].scrollIntoView({
        block: "center",
        behavior: "smooth",
      })
    }
  }, [
    activeTranscriptMatchIndex,
    isTranscriptSearchOpen,
    messages,
    transcriptMatchCount,
    transcriptSearchQuery,
  ])

  useEffect(() => {
    return () => {
      clearTranscriptHighlights()
    }
  }, [clearTranscriptHighlights])

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (error) {
      console.error("[JRVS] clipboard copy failed", error)
      return false
    }
  }, [])

  const handleCopyConversationId = useCallback(async () => {
    if (!conversationId) return

    const copied = await copyToClipboard(conversationId)
    if (copied) {
      setCopiedConversationId(true)
    }
  }, [conversationId, copyToClipboard])

  const handleCopyTranscript = useCallback(async () => {
    if (messages.length === 0) return
    const payload = messages.map((entry) => formatTranscriptLine(entry)).join("\n")
    const copied = await copyToClipboard(payload)
    if (copied) {
      setCopiedTranscript(true)
    }
  }, [messages, copyToClipboard])

  const handleDownloadTranscript = useCallback(() => {
    if (messages.length === 0) return

    const generatedAt = new Date()
    const filename = formatTranscriptExportFilename(generatedAt)
    const markdown = formatTranscriptExportMarkdown({
      generatedAt,
      conversationId,
      durationSeconds: sessionDurationSeconds,
      messages,
    })

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }, [conversationId, messages, sessionDurationSeconds])

  const handleToggleTranscriptSearch = useCallback(() => {
    if (isTranscriptSearchOpen) {
      closeTranscriptSearch()
      return
    }

    setIsTranscriptSearchOpen(true)
  }, [closeTranscriptSearch, isTranscriptSearchOpen])

  const handleCopyToolLog = useCallback(async () => {
    if (toolLogEntries.length === 0) return
    const payload = toolLogEntries
      .map(
        (entry) =>
          `[${entry.timestamp}] ${entry.toolName} -> ${entry.parameters} -> ${entry.resultSummary}`
      )
      .join("\n")
    const copied = await copyToClipboard(payload)
    if (copied) {
      setCopiedToolLog(true)
    }
  }, [toolLogEntries, copyToClipboard])

  const handleCopyErrorLog = useCallback(async () => {
    if (errorLogEntries.length === 0) return
    const payload = errorLogEntries
      .map((entry) => `[${entry.timestamp}] ${entry.message}`)
      .join("\n")
    const copied = await copyToClipboard(payload)
    if (copied) {
      setCopiedErrorLog(true)
    }
  }, [errorLogEntries, copyToClipboard])

  const handleCopyMessage = useCallback(
    async (entry: TranscriptMessage) => {
      const copied = await copyToClipboard(formatTranscriptLine(entry))
      if (copied) {
        setCopiedMessageId(entry.id)
      }
    },
    [copyToClipboard]
  )

  const handleAudioInputModeChange = useCallback(
    (nextMode: AudioInputMode) => {
      if (nextMode === audioInputMode) return
      if (nextMode !== "mic" && !systemAudioCaptureSupported) return

      if (
        connectionStatus === "connected" ||
        connectionStatus === "connecting"
      ) {
        const shouldRestart = window.confirm(
          "Changing audio mode will restart the session"
        )
        if (!shouldRestart) return
        setAudioModeRestartSignal((prev) => prev + 1)
      }

      setAudioInputMode(nextMode)
      if (nextMode === "mic") {
        setSystemAudioCaptureLive(false)
      }
    },
    [audioInputMode, connectionStatus, systemAudioCaptureSupported]
  )

  const handleConnectionStatusChange = useCallback(
    (status: ConnectionStatus) => {
      setConnectionStatus(status)

      if (status === "connected") {
        setSessionStartedAt(Date.now())
        setSessionDurationSeconds(0)
        return
      }

      if (status === "disconnected" || status === "disconnecting") {
        setSessionStartedAt(null)
      }
    },
    []
  )

  const handleNewSession = useCallback(() => {
    setMessages([])
    setToolLogEntries([])
    setErrorLogEntries([])
    setUseStructuredToolDispatch(false)
    setUseAuthoritativeNodeUpdates(false)
    setActiveNode("—")
    setConversationId("")
    setSystemAudioCaptureLive(false)
    setSessionDurationSeconds(0)
    setSessionStartedAt(null)
    setCopiedTranscript(false)
    setCopiedToolLog(false)
    setCopiedErrorLog(false)
    setCopiedMessageId(null)
    setIsTranscriptSearchOpen(false)
    setTranscriptSearchQuery("")
    setActiveTranscriptMatchIndex(-1)
    clearTranscriptHighlights()
    setNewSessionSignal((prev) => prev + 1)
  }, [clearTranscriptHighlights])

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

  const handleDisplayStructuredContent = useCallback(
    (parameters: DisplayStructuredContentParams) => {
      const content =
        typeof parameters?.content === "string" ? parameters.content.trim() : ""

      if (!content) {
        return "No content to display"
      }

      const label =
        typeof parameters?.label === "string" && parameters.label.trim()
          ? parameters.label.trim()
          : undefined

      setMessages((previous) => [
        ...previous,
        {
          id: createMessageId(),
          timestamp: createTimestamp(),
          source: "structured",
          message: content,
          label,
        },
      ])

      return "Content displayed successfully"
    },
    []
  )

  const handleReportToolDispatch = useCallback(
    (parameters: ReportToolDispatchParams) => {
      const rawToolName =
        typeof parameters?.tool_name === "string"
          ? parameters.tool_name.trim()
          : ""
      if (!rawToolName) {
        return "Missing tool_name"
      }

      const rawAction =
        typeof parameters?.action === "string" ? parameters.action.trim() : ""
      const paramsText =
        typeof parameters?.params === "string" && parameters.params.trim()
          ? parameters.params.trim()
          : "params: n/a"
      const resultSummary =
        typeof parameters?.result_summary === "string" &&
        parameters.result_summary.trim()
          ? parameters.result_summary.trim()
          : "result unavailable"

      setUseStructuredToolDispatch(true)

      appendToolLogEntry({
        id: createMessageId(),
        timestamp: createTimestamp(),
        toolName: rawAction ? `${rawToolName}.${rawAction}` : rawToolName,
        parameters: paramsText,
        resultSummary,
      })

      return "Logged"
    },
    [appendToolLogEntry]
  )

  const handleReportActiveNode = useCallback(
    (parameters: ReportActiveNodeParams) => {
      const nodeName =
        typeof parameters?.node_name === "string"
          ? parameters.node_name.trim()
          : ""

      if (!nodeName) {
        return "Missing node_name"
      }

      const nodeType =
        typeof parameters?.node_type === "string"
          ? parameters.node_type.trim()
          : ""

      setUseAuthoritativeNodeUpdates(true)
      setActiveNode(nodeType ? `${nodeName} (${nodeType})` : nodeName)

      return "Node updated"
    },
    []
  )

  // AGENT-SIDE: These client tools must also be registered in the ElevenLabs
  // agent configuration with matching names and parameter schemas.
  // See CC work order for agent-side setup.
  const clientTools: ConversationClientTools = useMemo(
    () => ({
      display_structured_content: handleDisplayStructuredContent,
      report_tool_dispatch: handleReportToolDispatch,
      report_active_node: handleReportActiveNode,
    }),
    [
      handleDisplayStructuredContent,
      handleReportActiveNode,
      handleReportToolDispatch,
    ]
  )

  const handleConversationDebug = useCallback(
    (event: unknown) => {
      console.log("[JRVS] onDebug", event)
      if (!useStructuredToolDispatch) {
        appendToolLogEntry(createToolLogEntry(event))
      }

      if (!useAuthoritativeNodeUpdates) {
        const nodeFromDebug = extractNodeFromMessage(stringifyUnknown(event))
        if (nodeFromDebug) {
          setActiveNode(nodeFromDebug)
        }
      }
    },
    [appendToolLogEntry, useAuthoritativeNodeUpdates, useStructuredToolDispatch]
  )

  const handleConversationMessage = useCallback((event: ConversationEvent) => {
    console.log("[JRVS] onMessage", event)
    if (!useStructuredToolDispatch) {
      appendToolLogEntry(createToolLogEntry(event.message))
    }

    if (event.source === "ai" && !useAuthoritativeNodeUpdates) {
      const detectedNode = extractNodeFromMessage(event.message)
      if (detectedNode) {
        setActiveNode(detectedNode)
      }
    }

    const content = event.message.trim()
    if (!content) return
    const eventTimestamp = createTimestamp()

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
            timestamp: eventTimestamp,
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
          timestamp: eventTimestamp,
          source: "ai",
          message: content,
        },
      ]
    })
  }, [appendToolLogEntry, useAuthoritativeNodeUpdates, useStructuredToolDispatch])

  const handleUserTextMessage = useCallback((message: string) => {
    const content = message.trim()
    if (!content) return
    const sentTimestamp = createTimestamp()

    setMessages((previous) => {
      const last = previous[previous.length - 1]
      if (last?.source === "user" && last.message === content) {
        return previous
      }

      return [
        ...previous,
        {
          id: createMessageId(),
          timestamp: sentTimestamp,
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
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <button
          type="button"
          onClick={() => setIsToolPanelOpen((open) => !open)}
          className="hover:text-foreground flex min-w-0 flex-1 items-center justify-between text-left transition-colors"
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

        <button
          type="button"
          onClick={handleCopyToolLog}
          disabled={toolLogEntries.length === 0}
          className={copyButtonClassName}
          title={
            toolLogEntries.length > 0
              ? "Copy tool call log"
              : "No tool log entries to copy"
          }
        >
          {copiedToolLog ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-zinc-400" />
          )}
          <span>{copiedToolLog ? "Copied" : "Copy"}</span>
        </button>
      </div>

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
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-medium">Error Log</h2>
        <button
          type="button"
          onClick={handleCopyErrorLog}
          disabled={errorLogEntries.length === 0}
          className={copyButtonClassName}
          title={
            errorLogEntries.length > 0
              ? "Copy error log"
              : "No errors to copy"
          }
        >
          {copiedErrorLog ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-zinc-400" />
          )}
          <span>{copiedErrorLog ? "Copied" : "Copy"}</span>
        </button>
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
      <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-7xl flex-col gap-4 md:h-[calc(100vh-3rem)]">
        <header className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 shadow-sm">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs sm:text-sm">
            <div className="min-w-0 truncate">
              <span className="text-zinc-400">Node:</span>{" "}
              <span className="font-medium">{activeNode}</span>
            </div>

            <button
              type="button"
              onClick={handleCopyConversationId}
              disabled={!conversationId}
              className={cn(
                copyButtonClassName,
                conversationId ? "" : "cursor-not-allowed opacity-60"
              )}
              title={
                conversationId
                  ? "Click to copy conversation ID"
                  : "Conversation ID not available yet"
              }
            >
              {copiedConversationId ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-zinc-400" />
              )}
              <span>
                {conversationId ? truncateConversationId(conversationId) : "—"}
              </span>
            </button>

            <div className="flex items-center justify-end gap-2">
              <span className="font-mono text-xs text-zinc-300">
                {formatSessionDuration(sessionDurationSeconds)}
              </span>
              <button
                type="button"
                onClick={handleNewSession}
                className={copyButtonClassName}
                title="Start a brand-new conversation session"
              >
                <RotateCcw className="h-3.5 w-3.5 text-zinc-300" />
                <span className="hidden sm:inline">New Session</span>
              </button>
              <span
                className={cn(
                  "inline-block h-2.5 w-2.5 rounded-full",
                  statusDotClassMap[connectionStatus]
                )}
              />
              <span className="capitalize">{connectionStatus}</span>
              {isAgentSpeaking && (
                <span className="animate-pulse rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-emerald-300">
                  Speaking...
                </span>
              )}
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:gap-6">
          <section className="flex min-h-0 w-full flex-col md:w-[70%]">

          <div className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
            <div className="border-b px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-medium">Live Transcript</h2>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {messages.length} messages
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleTranscriptSearch}
                    className={copyButtonClassName}
                    title={
                      isTranscriptSearchOpen
                        ? "Close transcript search (Esc)"
                        : "Search transcript (Ctrl/Cmd+F)"
                    }
                    aria-label={
                      isTranscriptSearchOpen
                        ? "Close transcript search"
                        : "Search transcript"
                    }
                  >
                    <Search className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="hidden sm:inline">Search</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadTranscript}
                    disabled={messages.length === 0}
                    className={copyButtonClassName}
                    title={
                      messages.length > 0
                        ? "Download full transcript as Markdown"
                        : "No transcript messages to download"
                    }
                  >
                    <Download className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyTranscript}
                    disabled={messages.length === 0}
                    className={copyButtonClassName}
                    title={
                      messages.length > 0
                        ? "Copy full transcript"
                        : "No transcript messages to copy"
                    }
                  >
                    {copiedTranscript ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-zinc-400" />
                    )}
                    <span>{copiedTranscript ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              {isTranscriptSearchOpen && (
                <div
                  className="mt-3 flex flex-wrap items-center gap-2"
                  data-transcript-search="true"
                >
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                    <input
                      ref={transcriptSearchInputRef}
                      type="text"
                      value={transcriptSearchQuery}
                      onChange={(event) => {
                        const nextQuery = event.target.value
                        setTranscriptSearchQuery(nextQuery)
                        setActiveTranscriptMatchIndex(
                          countTranscriptMatches(messages, nextQuery) > 0 ? 0 : -1
                        )
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          navigateTranscriptMatches(event.shiftKey ? -1 : 1)
                        }
                      }}
                      placeholder="Search transcript..."
                      className="bg-background h-8 w-full rounded-md border border-zinc-700 pr-2 pl-8 text-xs outline-none transition-colors focus:border-zinc-500"
                    />
                  </div>

                  <span className="text-muted-foreground min-w-[120px] text-xs">
                    {transcriptSearchQuery.trim().length === 0
                      ? "Type to search"
                      : transcriptMatchCount === 0
                        ? "No matches"
                        : `${activeTranscriptMatchDisplayIndex} of ${transcriptMatchCount} matches`}
                  </span>

                  <button
                    type="button"
                    onClick={() => navigateTranscriptMatches(-1)}
                    disabled={
                      transcriptSearchQuery.trim().length === 0 ||
                      transcriptMatchCount === 0
                    }
                    className={copyButtonClassName}
                    title="Previous match (Shift+Enter)"
                  >
                    <ArrowUp className="h-3.5 w-3.5 text-zinc-300" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTranscriptMatches(1)}
                    disabled={
                      transcriptSearchQuery.trim().length === 0 ||
                      transcriptMatchCount === 0
                    }
                    className={copyButtonClassName}
                    title="Next match (Enter)"
                  >
                    <ArrowDown className="h-3.5 w-3.5 text-zinc-300" />
                  </button>
                </div>
              )}
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
                      data-transcript-entry="true"
                      variant={entry.source === "user" ? "contained" : "flat"}
                      className={cn(
                        "relative pr-9",
                        entry.source === "ai" && "max-w-[90%]",
                        entry.source === "structured" &&
                          "max-w-[95%] border-l-2 border-sky-500/60 bg-sky-500/10 pl-3"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          void handleCopyMessage(entry)
                        }}
                        className={cn(
                          "absolute top-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950/90 text-zinc-100 opacity-0 transition-opacity",
                          "group-hover:opacity-100 focus-visible:opacity-100"
                        )}
                        title={
                          copiedMessageId === entry.id
                            ? "Copied"
                            : "Copy message"
                        }
                        aria-label={
                          copiedMessageId === entry.id
                            ? "Message copied"
                            : "Copy message"
                        }
                      >
                        {copiedMessageId === entry.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-zinc-300" />
                        )}
                      </button>

                      <p
                        className={cn(
                          "mb-1 font-mono text-[11px]",
                          entry.source === "user"
                            ? "text-primary-foreground/70"
                            : entry.source === "structured"
                              ? "text-sky-300/80"
                              : "text-muted-foreground"
                        )}
                      >
                        [{entry.timestamp}]
                      </p>

                      {entry.source === "structured" ? (
                        <>
                          {entry.label && (
                            <p className="mb-1 text-xs font-semibold tracking-wide text-sky-300">
                              {entry.label}
                            </p>
                          )}
                          <Response>{entry.message}</Response>
                        </>
                      ) : entry.source === "ai" ? (
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
              audioInputMode={audioInputMode}
              forceDisconnectSignal={audioModeRestartSignal}
              newSessionSignal={newSessionSignal}
              clientTools={clientTools}
              onSystemAudioCaptureChange={setSystemAudioCaptureLive}
              onConnect={() => {
                console.log("[JRVS] onConnect")
              }}
              onDisconnect={() => {
                console.log("[JRVS] onDisconnect")
              }}
              onConnectionStatusChange={handleConnectionStatusChange}
              onSpeakingChange={setIsAgentSpeaking}
              onConversationId={setConversationId}
              onMessage={handleConversationMessage}
              onDebug={handleConversationDebug}
              onSendMessage={handleUserTextMessage}
              onError={handleConversationError}
            />

            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="bg-muted inline-flex rounded-md p-1">
                  {(
                    ["mic", "device", "mixed"] as AudioInputMode[]
                  ).map((mode) => {
                    const unsupported =
                      mode !== "mic" && !systemAudioCaptureSupported
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleAudioInputModeChange(mode)}
                        disabled={unsupported}
                        title={
                          unsupported
                            ? "System audio capture not supported in this browser."
                            : audioModeLabelMap[mode]
                        }
                        className={cn(
                          "rounded px-3 py-1.5 text-sm transition-colors",
                          audioInputMode === mode
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground",
                          unsupported && "cursor-not-allowed opacity-50"
                        )}
                      >
                        {audioModeLabelMap[mode]}
                      </button>
                    )
                  })}
                </div>

                {systemAudioCaptureLive &&
                  (audioInputMode === "device" || audioInputMode === "mixed") && (
                    <span className="rounded-full border border-emerald-700/50 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                      System audio capture live
                    </span>
                  )}
              </div>

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
      </div>
    </main>
  )
}
