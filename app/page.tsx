"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  FileCode,
  RotateCcw,
  Search,
} from "lucide-react"

import { Mjrvs_config_inspector_panel } from "@/components/mjrvs_config_inspector_panel"
import {
  ConversationBar,
  type AudioInputMode,
  type ConversationClientTools,
} from "@/components/ui/conversation-bar"
import { Mjrvs_structured_markdown_block } from "@/components/ui/mjrvs_structured_markdown_block"
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

type SessionHistoryEntry = {
  conversationId: string
  startedAt: number
  endedAt: number | null
  durationSeconds: number | null
  label: string
  transcript: TranscriptMessage[]
}

type EndedSessionHistoryEntry = SessionHistoryEntry & {
  endedAt: number
}

type ToolLogEntry = {
  id: string
  timestamp: string
  toolName: string
  action?: string
  params?: string
  resultSummary?: string
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

const createMessageId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`

const createTimestamp = () =>
  new Date().toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

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

const readParameterString = (parameters: unknown, key: string): string => {
  if (!parameters || typeof parameters !== "object") return ""
  const parameterRecord = parameters as Record<string, unknown>
  const rawValue = parameterRecord[key]
  if (typeof rawValue === "string") return rawValue.trim()
  if (rawValue === undefined || rawValue === null) return ""
  return cleanInline(stringifyUnknown(rawValue))
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

const formatSessionStartTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

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

const extractParametersFromText = (text: string): string | undefined => {
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

  return undefined
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
    params: extractParametersFromText(text),
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
  const actionValue = findFirstMatchingKeyValue(payload, [
    "action",
    "operation",
    "event",
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

  const params = parametersValue
    ? truncate(cleanInline(stringifyUnknown(parametersValue)), 220)
    : fallbackFromText?.params

  const resultSummary = resultValue
    ? truncate(cleanInline(stringifyUnknown(resultValue)), 90)
    : fallbackFromText?.resultSummary
  const action = actionValue
    ? truncate(cleanInline(stringifyUnknown(actionValue)), 90)
    : undefined

  return {
    id: createMessageId(),
    timestamp: createTimestamp(),
    toolName,
    action,
    params,
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
  const [systemAudioCaptureSupported] = useState(
    () =>
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getDisplayMedia
  )
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
  const [activeNodeType, setActiveNodeType] = useState<string>("")
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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState(false)
  const [is_config_inspector_open, set_is_config_inspector_open] =
    useState(false)
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryEntry[]>([])
  const [viewedSessionId, setViewedSessionId] = useState<string | null>(null)
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [toolLogEntries, setToolLogEntries] = useState<ToolLogEntry[]>([])
  const [errorLogEntries, setErrorLogEntries] = useState<ErrorLogEntry[]>([])
  const [isToolPanelOpen, setIsToolPanelOpen] = useState(true)
  const [mobilePanelTab, setMobilePanelTab] = useState<MobilePanelTab>("tools")
  const sessionStartRef = useRef<number | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const transcriptSearchInputRef = useRef<HTMLInputElement>(null)
  const transcriptMatchElementsRef = useRef<HTMLElement[]>([])
  const toolLogRef = useRef<HTMLDivElement>(null)
  const errorLogRef = useRef<HTMLDivElement>(null)

  const viewedSession = useMemo(() => {
    if (!viewedSessionId) return null
    return (
      sessionHistory.find((entry) => entry.conversationId === viewedSessionId) ??
      null
    )
  }, [sessionHistory, viewedSessionId])

  const cachedViewedSession =
    viewedSession && viewedSession.endedAt !== null
      ? (viewedSession as EndedSessionHistoryEntry)
      : null
  const viewingCachedSession = cachedViewedSession !== null

  const visibleTranscriptMessages = cachedViewedSession
    ? cachedViewedSession.transcript
    : messages

  const visibleTranscriptConversationId = cachedViewedSession
    ? cachedViewedSession.conversationId
    : conversationId

  const visibleTranscriptDurationSeconds = cachedViewedSession
    ? cachedViewedSession.durationSeconds ??
      Math.max(
        0,
        Math.floor(
          (cachedViewedSession.endedAt - cachedViewedSession.startedAt) / 1000
        )
      )
    : sessionDurationSeconds

  const displayedNodeName = useAuthoritativeNodeUpdates ? activeNode : "—"
  const displayedNodeType = useAuthoritativeNodeUpdates ? activeNodeType : ""

  const hasActiveSession = Boolean(
    activeSessionId &&
      (connectionStatus === "connected" ||
        connectionStatus === "connecting" ||
        connectionStatus === "disconnecting")
  )

  const orderedSessionHistory = useMemo(() => {
    const sortedByStartTime = [...sessionHistory].sort(
      (left, right) => right.startedAt - left.startedAt
    )

    if (!activeSessionId) return sortedByStartTime

    const activeEntry = sortedByStartTime.find(
      (entry) => entry.conversationId === activeSessionId
    )
    if (!activeEntry) return sortedByStartTime

    return [
      activeEntry,
      ...sortedByStartTime.filter(
        (entry) => entry.conversationId !== activeSessionId
      ),
    ]
  }, [activeSessionId, sessionHistory])

  const transcriptMatchCount = useMemo(() => {
    if (!isTranscriptSearchOpen) return 0
    return countTranscriptMatches(visibleTranscriptMessages, transcriptSearchQuery)
  }, [isTranscriptSearchOpen, transcriptSearchQuery, visibleTranscriptMessages])

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
  }, [visibleTranscriptMessages])

  useEffect(() => {
    if (!toolLogRef.current) return
    toolLogRef.current.scrollTop = toolLogRef.current.scrollHeight
  }, [toolLogEntries, isToolPanelOpen])

  useEffect(() => {
    if (!errorLogRef.current) return
    errorLogRef.current.scrollTop = errorLogRef.current.scrollHeight
  }, [errorLogEntries])

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
  }, [
    clearTranscriptHighlights,
    isTranscriptSearchOpen,
    transcriptSearchQuery,
    visibleTranscriptMessages,
  ])

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
    transcriptMatchCount,
    transcriptSearchQuery,
    visibleTranscriptMessages,
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
    if (visibleTranscriptMessages.length === 0) return
    const payload = visibleTranscriptMessages
      .map((entry) => formatTranscriptLine(entry))
      .join("\n")
    const copied = await copyToClipboard(payload)
    if (copied) {
      setCopiedTranscript(true)
    }
  }, [copyToClipboard, visibleTranscriptMessages])

  const handleDownloadTranscript = useCallback(() => {
    if (visibleTranscriptMessages.length === 0) return

    const generatedAt = new Date()
    const filename = formatTranscriptExportFilename(generatedAt)
    const markdown = formatTranscriptExportMarkdown({
      generatedAt,
      conversationId: visibleTranscriptConversationId,
      durationSeconds: visibleTranscriptDurationSeconds,
      messages: visibleTranscriptMessages,
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
  }, [
    visibleTranscriptConversationId,
    visibleTranscriptDurationSeconds,
    visibleTranscriptMessages,
  ])

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
      .map((entry) => {
        const segments = [`[${entry.timestamp}] ${entry.toolName}`]
        if (entry.action) segments.push(`action: ${entry.action}`)
        if (entry.params) segments.push(`params: ${entry.params}`)
        if (entry.resultSummary) {
          segments.push(`result: ${entry.resultSummary}`)
        }
        return segments.join(" | ")
      })
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

  const handleViewHistoricalSession = useCallback(
    (session: SessionHistoryEntry) => {
      if (session.endedAt === null) return
      setViewedSessionId(session.conversationId)
      setIsTranscriptSearchOpen(false)
      setTranscriptSearchQuery("")
      setActiveTranscriptMatchIndex(-1)
      clearTranscriptHighlights()
    },
    [clearTranscriptHighlights]
  )

  const handleBackToLiveTranscript = useCallback(() => {
    setViewedSessionId(null)
    setActiveTranscriptMatchIndex(-1)
    clearTranscriptHighlights()
  }, [clearTranscriptHighlights])

  const handleRenameHistorySession = useCallback((session: SessionHistoryEntry) => {
    const nextLabel = window.prompt("Rename session label", session.label)
    if (nextLabel === null) return

    const normalizedLabel = nextLabel.trim()
    setSessionHistory((previous) =>
      previous.map((entry) =>
        entry.conversationId === session.conversationId
          ? { ...entry, label: normalizedLabel }
          : entry
      )
    )
  }, [])

  const upsertSessionHistoryEntry = useCallback(
    ({
      sessionId,
      startedAt,
      transcript,
    }: {
      sessionId: string
      startedAt: number
      transcript: TranscriptMessage[]
    }) => {
      setSessionHistory((previous) => {
        const existing = previous.find((entry) => entry.conversationId === sessionId)
        if (existing) {
          const updated: SessionHistoryEntry = {
            ...existing,
            startedAt,
            endedAt: null,
            durationSeconds: null,
            transcript:
              transcript.length > 0 ? transcript : existing.transcript,
          }

          return [
            updated,
            ...previous.filter((entry) => entry.conversationId !== sessionId),
          ]
        }

        return [
          {
            conversationId: sessionId,
            startedAt,
            endedAt: null,
            durationSeconds: null,
            label: "",
            transcript,
          },
          ...previous,
        ]
      })
    },
    []
  )

  const syncTranscriptToSession = useCallback(
    (sessionId: string | null, transcript: TranscriptMessage[]) => {
      if (!sessionId) return

      setSessionHistory((previous) => {
        const targetIndex = previous.findIndex(
          (entry) => entry.conversationId === sessionId
        )
        if (targetIndex < 0) return previous

        const current = previous[targetIndex]
        if (current.endedAt !== null) return previous

        // Preserve previous transcript when the UI resets for session handoff.
        if (transcript.length === 0 && current.transcript.length > 0) {
          return previous
        }

        if (current.transcript === transcript) return previous

        const next = [...previous]
        next[targetIndex] = {
          ...current,
          transcript,
        }
        return next
      })
    },
    []
  )

  const markSessionEnded = useCallback(
    (sessionId: string | null, transcript: TranscriptMessage[]) => {
      if (!sessionId) return
      const endedAt = Date.now()

      setSessionHistory((previous) =>
        previous.map((entry) => {
          if (entry.conversationId !== sessionId || entry.endedAt !== null) {
            return entry
          }

          const finalTranscript =
            transcript.length === 0 && entry.transcript.length > 0
              ? entry.transcript
              : transcript

          return {
            ...entry,
            endedAt,
            durationSeconds: Math.max(
              0,
              Math.floor((endedAt - entry.startedAt) / 1000)
            ),
            transcript: finalTranscript,
          }
        })
      )
    },
    []
  )

  const updateMessages = useCallback(
    (updater: (previous: TranscriptMessage[]) => TranscriptMessage[]) => {
      setMessages((previous) => {
        const next = updater(previous)
        syncTranscriptToSession(activeSessionId, next)
        return next
      })
    },
    [activeSessionId, syncTranscriptToSession]
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
        const connectedSessionId = conversationId || activeSessionId

        if (sessionStartRef.current === null) {
          sessionStartRef.current = Date.now()
          setSessionStartedAt(sessionStartRef.current)
          setSessionDurationSeconds(0)
        }
        const effectiveStartedAt = sessionStartRef.current

        if (connectedSessionId && effectiveStartedAt !== null) {
          setActiveSessionId(connectedSessionId)
          upsertSessionHistoryEntry({
            sessionId: connectedSessionId,
            startedAt: effectiveStartedAt,
            transcript: messages,
          })
        }
        return
      }

      if (status === "disconnected") {
        sessionStartRef.current = null
        setSessionStartedAt(null)
        setUseAuthoritativeNodeUpdates(false)
        const endedSessionId = activeSessionId ?? conversationId
        markSessionEnded(endedSessionId, messages)
        setActiveSessionId(null)
      }
    },
    [
      activeSessionId,
      conversationId,
      markSessionEnded,
      messages,
      upsertSessionHistoryEntry,
    ]
  )

  const handleConversationIdChange = useCallback(
    (nextConversationId: string) => {
      setConversationId(nextConversationId)
      setUseAuthoritativeNodeUpdates(false)
      if (
        connectionStatus === "connected" ||
        connectionStatus === "connecting" ||
        connectionStatus === "disconnecting"
      ) {
        setActiveSessionId(nextConversationId)
      }

      if (connectionStatus === "connected") {
        upsertSessionHistoryEntry({
          sessionId: nextConversationId,
          startedAt: sessionStartedAt ?? Date.now(),
          transcript: messages,
        })
      }
    },
    [connectionStatus, messages, sessionStartedAt, upsertSessionHistoryEntry]
  )

  const handleNewSession = useCallback(() => {
    setViewedSessionId(null)
    updateMessages(() => [])
    setToolLogEntries([])
    setErrorLogEntries([])
    setUseStructuredToolDispatch(false)
    setUseAuthoritativeNodeUpdates(false)
    setConversationId("")
    setSystemAudioCaptureLive(false)
    sessionStartRef.current = null
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
  }, [clearTranscriptHighlights, updateMessages])

  const appendToolLogEntry = useCallback((entry: ToolLogEntry | null) => {
    if (!entry) return

    setToolLogEntries((previous) => {
      const last = previous[previous.length - 1]
      if (
        last &&
        last.toolName === entry.toolName &&
        last.action === entry.action &&
        last.params === entry.params &&
        last.resultSummary === entry.resultSummary
      ) {
        return previous
      }

      return [...previous, entry]
    })
  }, [])

  const handleDisplayStructuredContent = useCallback(
    (parameters: Record<string, unknown>) => {
      const content = readParameterString(parameters, "content")

      if (!content) {
        return "missing_content"
      }

      const labelValue = readParameterString(parameters, "label")
      const label = labelValue || undefined

      updateMessages((previous) => [
        ...previous,
        {
          id: createMessageId(),
          timestamp: createTimestamp(),
          source: "structured",
          message: content,
          label,
        },
      ])

      return "displayed"
    },
    [updateMessages]
  )

  const handleReportToolDispatch = useCallback(
    (parameters: Record<string, unknown>) => {
      const rawToolName = readParameterString(parameters, "tool_name")
      if (!rawToolName) {
        return "missing_tool_name"
      }

      const rawAction = readParameterString(parameters, "action")
      const paramsText = readParameterString(parameters, "params")
      const resultSummary = readParameterString(parameters, "result_summary")

      setUseStructuredToolDispatch(true)

      appendToolLogEntry({
        id: createMessageId(),
        timestamp: createTimestamp(),
        toolName: rawToolName,
        action: rawAction || undefined,
        params: paramsText || undefined,
        resultSummary: resultSummary || undefined,
      })

      return "ok"
    },
    [appendToolLogEntry]
  )

  const handleReportActiveNode = useCallback(
    (parameters: Record<string, unknown>) => {
      const rawNodeName = parameters.node_name
      const nodeName =
        typeof rawNodeName === "string" ? rawNodeName.trim() : ""

      if (!nodeName) {
        return "missing_node_name"
      }

      const rawNodeType = parameters.node_type
      const nodeType =
        typeof rawNodeType === "string" ? rawNodeType.trim() : ""

      setUseAuthoritativeNodeUpdates(true)
      setActiveNode(nodeName)
      setActiveNodeType(nodeType)

      return "ok"
    },
    []
  )

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
    },
    [appendToolLogEntry, useStructuredToolDispatch]
  )

  const handleConversationMessage = useCallback((event: ConversationEvent) => {
    console.log("[JRVS] onMessage", event)
    if (!useStructuredToolDispatch) {
      appendToolLogEntry(createToolLogEntry(event.message))
    }

    const content = event.message.trim()
    if (!content) return
    const eventTimestamp = createTimestamp()

    updateMessages((previous) => {
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
  }, [
    appendToolLogEntry,
    updateMessages,
    useStructuredToolDispatch,
  ])

  const handleUserTextMessage = useCallback((message: string) => {
    const content = message.trim()
    if (!content) return
    const sentTimestamp = createTimestamp()

    updateMessages((previous) => {
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
  }, [updateMessages])

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
                <p className="font-mono text-[11px] text-zinc-400">[{entry.timestamp}]</p>
                <p className="mt-1 font-semibold break-words">{entry.toolName}</p>
                {entry.action && (
                  <p className="mt-1">
                    <span className="text-muted-foreground">Action:</span>{" "}
                    <span className="font-medium">{entry.action}</span>
                  </p>
                )}
                {entry.params && (
                  <p className="text-muted-foreground mt-1 break-words whitespace-pre-wrap">
                    {entry.params}
                  </p>
                )}
                {entry.resultSummary && (
                  <p className="mt-1 break-words whitespace-pre-wrap">
                    {entry.resultSummary}
                  </p>
                )}
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
      <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-7xl gap-4 md:h-[calc(100vh-3rem)]">
        {isHistorySidebarOpen && (
          <aside className="bg-card w-[250px] shrink-0 overflow-hidden rounded-xl border shadow-sm">
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b px-3 py-3">
                <h2 className="text-sm font-medium">Session History</h2>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {sessionHistory.length} session
                  {sessionHistory.length === 1 ? "" : "s"} (in memory)
                </p>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {orderedSessionHistory.length === 0 ? (
                  <p className="text-muted-foreground px-1 py-3 text-xs">
                    No connected sessions yet.
                  </p>
                ) : (
                  orderedSessionHistory.map((session) => {
                    const isActive =
                      session.endedAt === null &&
                      session.conversationId === activeSessionId
                    const isEnded = session.endedAt !== null
                    const isSelected = viewedSessionId === session.conversationId
                    const duration = session.endedAt !== null
                      ? session.durationSeconds ??
                        Math.max(
                          0,
                          Math.floor((session.endedAt - session.startedAt) / 1000)
                        )
                      : 0
                    const displayLabel = session.label.trim()

                    return (
                      <div
                        key={session.conversationId}
                        role={isEnded ? "button" : undefined}
                        tabIndex={isEnded ? 0 : undefined}
                        onClick={() => {
                          if (isEnded) {
                            handleViewHistoricalSession(session)
                          }
                        }}
                        onKeyDown={(event) => {
                          if (!isEnded) return
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            handleViewHistoricalSession(session)
                          }
                        }}
                        className={cn(
                          "rounded-md border px-2 py-2 transition-colors",
                          isEnded
                            ? "cursor-pointer hover:border-zinc-500/70 hover:bg-zinc-500/5"
                            : "border-emerald-500/50 bg-emerald-500/5",
                          isActive && "border-emerald-500/70 bg-emerald-500/10",
                          isSelected && "border-amber-500/70 bg-amber-500/10"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-mono text-[11px]">
                            {truncateConversationId(session.conversationId)}
                          </p>
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              isActive
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-zinc-500/20 text-zinc-300"
                            )}
                          >
                            {isActive ? "Active" : "Ended"}
                          </span>
                        </div>

                        <p className="text-muted-foreground mt-1 text-[11px]">
                          Start: {formatSessionStartTime(session.startedAt)}
                        </p>
                        {isEnded && (
                          <p className="text-muted-foreground text-[11px]">
                            Duration: {formatSessionDuration(duration)}
                          </p>
                        )}

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              "truncate text-xs",
                              displayLabel
                                ? "text-foreground"
                                : "text-muted-foreground italic"
                            )}
                            title={displayLabel || "No label"}
                          >
                            {displayLabel || "No label"}
                          </p>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleRenameHistorySession(session)
                            }}
                            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] transition-colors hover:bg-zinc-700/40"
                            title="Rename session label"
                          >
                            Rename
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </aside>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <header className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 shadow-sm">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs sm:text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsHistorySidebarOpen((open) => !open)}
                  className={cn(
                    copyButtonClassName,
                    isHistorySidebarOpen && "bg-zinc-800"
                  )}
                  title={
                    isHistorySidebarOpen
                      ? "Hide conversation history"
                      : "Show conversation history"
                  }
                  aria-label={
                    isHistorySidebarOpen
                      ? "Hide conversation history"
                      : "Show conversation history"
                  }
                >
                  <Clock3 className="h-3.5 w-3.5 text-zinc-300" />
                  <span className="hidden sm:inline">History</span>
                </button>

                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-zinc-400">Node:</span>
                  <span className="min-w-0 truncate font-medium">{displayedNodeName}</span>
                  {displayedNodeName !== "—" && displayedNodeType && (
                    <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300">
                      {displayedNodeType}
                    </span>
                  )}
                </div>
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
                <button
                  type="button"
                  onClick={() =>
                    set_is_config_inspector_open((is_open) => !is_open)
                  }
                  className={cn(
                    copyButtonClassName,
                    is_config_inspector_open && "bg-zinc-800"
                  )}
                  title={
                    is_config_inspector_open
                      ? "Hide Agent Config inspector"
                      : "Show Agent Config inspector"
                  }
                  aria-label={
                    is_config_inspector_open
                      ? "Hide Agent Config inspector"
                      : "Show Agent Config inspector"
                  }
                >
                  <FileCode className="h-3.5 w-3.5 text-zinc-300" />
                  <span className="hidden sm:inline">Agent Config</span>
                </button>
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
                      <h2 className="text-sm font-medium">
                        {viewingCachedSession ? "Cached Transcript" : "Live Transcript"}
                      </h2>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {visibleTranscriptMessages.length} messages
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
                        disabled={visibleTranscriptMessages.length === 0}
                        className={copyButtonClassName}
                        title={
                          visibleTranscriptMessages.length > 0
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
                        disabled={visibleTranscriptMessages.length === 0}
                        className={copyButtonClassName}
                        title={
                          visibleTranscriptMessages.length > 0
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

                  {cachedViewedSession && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs">
                      <span className="font-medium text-amber-200">
                        Viewing session{" "}
                        {truncateConversationId(cachedViewedSession.conversationId)} —{" "}
                        {cachedViewedSession.label.trim() || "No label"}
                      </span>
                      {hasActiveSession && (
                        <button
                          type="button"
                          onClick={handleBackToLiveTranscript}
                          className="rounded border border-amber-500/60 px-2 py-1 text-[11px] transition-colors hover:bg-amber-500/20"
                        >
                          Back to live
                        </button>
                      )}
                    </div>
                  )}

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
                              countTranscriptMatches(
                                visibleTranscriptMessages,
                                nextQuery
                              ) > 0
                                ? 0
                                : -1
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
                  {visibleTranscriptMessages.length === 0 ? (
                    <div className="text-muted-foreground flex h-full items-center justify-center py-10 text-sm">
                      {viewingCachedSession
                        ? "No transcript cached for this session."
                        : "Start a conversation to see live transcript messages."}
                    </div>
                  ) : (
                    visibleTranscriptMessages.map((entry) => (
                      <Message
                        key={entry.id}
                        from={entry.source === "user" ? "user" : "assistant"}
                      >
                        <MessageContent
                          data-transcript-entry="true"
                          variant={entry.source === "user" ? "contained" : "flat"}
                          className={cn(
                            "relative",
                            entry.source !== "structured" && "pr-9",
                            entry.source === "ai" && "max-w-[90%]",
                            entry.source === "structured" && "max-w-[95%]"
                          )}
                        >
                          {entry.source !== "structured" && (
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
                                copiedMessageId === entry.id ? "Copied" : "Copy message"
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
                          )}

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
                            <Mjrvs_structured_markdown_block
                              label={entry.label}
                              content={entry.message}
                              on_copy={copyToClipboard}
                            />
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
                  onConversationId={handleConversationIdChange}
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
                      (audioInputMode === "device" ||
                        audioInputMode === "mixed") && (
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
      </div>
      <Mjrvs_config_inspector_panel
        is_open={is_config_inspector_open}
        on_close={() => set_is_config_inspector_open(false)}
      />
    </main>
  )
}
