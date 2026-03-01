"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  GitBranch,
  RefreshCcw,
  X,
} from "lucide-react"

import { Response } from "@/components/ui/response"
import { cn } from "@/lib/utils"
import type {
  ConfigSnapshotChunk,
  ConfigSnapshotComponentType,
  ConfigSnapshotSource,
} from "@/lib/config-snapshot"

type ConfigInspectorPanelProps = {
  isOpen: boolean
  onClose: () => void
}

type SnapshotApiResponse = {
  agent_id: string | null
  snapshot_at: string | null
  chunks: ConfigSnapshotChunk[]
  source: ConfigSnapshotSource
}

type ViewerLanguage = "json" | "text"

type GroupDefinition = {
  type: ConfigSnapshotComponentType
  label: string
}

type TransferEdge = {
  edgeId: string
  source: string
  target: string
  forwardCondition: string
}

const groupDefinitions: GroupDefinition[] = [
  { type: "root_prompt", label: "Root Prompt" },
  { type: "node_prompt", label: "Nodes" },
  { type: "edge_condition", label: "Edges" },
  { type: "tool_schema", label: "Tools" },
  { type: "global_config", label: "Global Config" },
]

const initialGroupExpansionState: Record<ConfigSnapshotComponentType, boolean> = {
  root_prompt: true,
  node_prompt: true,
  edge_condition: true,
  tool_schema: true,
  global_config: true,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null

const stringifyContent = (value: unknown): string => {
  if (typeof value === "string") return value

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const summarizeContent = (chunk: ConfigSnapshotChunk): string => {
  const content = chunk.content

  if (isRecord(content)) {
    if (chunk.component_type === "node_prompt") {
      const prompt = readString(content.additional_prompt)
      if (prompt) return prompt
    }

    if (chunk.component_type === "root_prompt") {
      const prompt = readString(content.prompt)
      if (prompt) return prompt
    }

    if (chunk.component_type === "edge_condition") {
      const forward = readString(content.forward_condition)
      if (forward) return `Forward: ${forward}`
    }
  }

  return stringifyContent(content).replace(/\s+/g, " ").trim()
}

const truncate = (value: string, maxLength = 100): string => {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}

const getChunkKey = (chunk: ConfigSnapshotChunk): string =>
  `${chunk.component_type}:${chunk.raw_id}`

const getViewerContent = (
  chunk: ConfigSnapshotChunk
): { language: ViewerLanguage; value: string } => {
  if (typeof chunk.content === "string") {
    return { language: "text", value: chunk.content }
  }

  return { language: "json", value: stringifyContent(chunk.content) }
}

const formatSnapshotTimestamp = (timestamp: string | null): string => {
  if (!timestamp) return "Not captured yet"

  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return timestamp

  return parsed.toLocaleString("en-GB", {
    hour12: false,
  })
}

const createEmptyGroups = (): Record<ConfigSnapshotComponentType, ConfigSnapshotChunk[]> => ({
  root_prompt: [],
  node_prompt: [],
  edge_condition: [],
  tool_schema: [],
  global_config: [],
})

const parseTransferEdge = (chunk: ConfigSnapshotChunk): TransferEdge | null => {
  if (!isRecord(chunk.content)) return null

  const source =
    readString(chunk.content.source_node_name) ??
    readString(chunk.content.source_node) ??
    null
  const target =
    readString(chunk.content.target_node_name) ??
    readString(chunk.content.target_node) ??
    null

  if (!source || !target) return null

  return {
    edgeId: chunk.raw_id,
    source,
    target,
    forwardCondition: readString(chunk.content.forward_condition) ?? "(none)",
  }
}

export function ConfigInspectorPanel({
  isOpen,
  onClose,
}: ConfigInspectorPanelProps) {
  const [chunks, setChunks] = useState<ConfigSnapshotChunk[]>([])
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null)
  const [snapshotSource, setSnapshotSource] = useState<ConfigSnapshotSource>("live")
  const [agentId, setAgentId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState(
    initialGroupExpansionState
  )
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
  const [copiedChunkKey, setCopiedChunkKey] = useState<string | null>(null)

  const hasFetchedRef = useRef(false)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const groupedChunks = useMemo(() => {
    const grouped = createEmptyGroups()
    chunks.forEach((chunk) => {
      grouped[chunk.component_type].push(chunk)
    })

    groupDefinitions.forEach((group) => {
      grouped[group.type].sort((left, right) =>
        left.component_id.localeCompare(right.component_id)
      )
    })

    return grouped
  }, [chunks])

  const transferEdges = useMemo(
    () =>
      groupedChunks.edge_condition
        .map((chunk) => parseTransferEdge(chunk))
        .filter((edge): edge is TransferEdge => Boolean(edge)),
    [groupedChunks.edge_condition]
  )

  const nodeChunkLookup = useMemo(() => {
    const lookup = new Map<string, string>()
    groupedChunks.node_prompt.forEach((chunk) => {
      lookup.set(chunk.component_id, getChunkKey(chunk))
    })
    return lookup
  }, [groupedChunks.node_prompt])

  const transferNodes = useMemo(() => {
    const names = new Set<string>()

    groupedChunks.node_prompt.forEach((chunk) => {
      names.add(chunk.component_id)
    })
    transferEdges.forEach((edge) => {
      names.add(edge.source)
      names.add(edge.target)
    })

    return Array.from(names).sort((left, right) => left.localeCompare(right))
  }, [groupedChunks.node_prompt, transferEdges])

  const transferRows = useMemo(
    () =>
      transferNodes.map((nodeName) => ({
        nodeName,
        outgoing: transferEdges.filter((edge) => edge.source === nodeName),
      })),
    [transferEdges, transferNodes]
  )

  const fetchSnapshot = useCallback(async (refresh: boolean) => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const url = refresh
        ? "/api/agent-config/snapshot?refresh=1"
        : "/api/agent-config/snapshot"
      const response = await fetch(url, {
        method: refresh ? "POST" : "GET",
        cache: "no-store",
      })

      const rawBody = await response.text()
      const parsedBody: unknown = rawBody ? JSON.parse(rawBody) : {}

      if (!response.ok) {
        if (isRecord(parsedBody)) {
          const error = readString(parsedBody.error)
          const details = readString(parsedBody.details)
          throw new Error(
            details
              ? `${error ?? "Snapshot request failed"}: ${details}`
              : error ?? `Snapshot request failed (${response.status})`
          )
        }

        throw new Error(`Snapshot request failed (${response.status})`)
      }

      if (!isRecord(parsedBody) || !Array.isArray(parsedBody.chunks)) {
        throw new Error("Snapshot response did not include a chunks array")
      }

      const snapshotResponse = parsedBody as Partial<SnapshotApiResponse>
      setChunks(snapshotResponse.chunks ?? [])
      setSnapshotAt(readString(snapshotResponse.snapshot_at))
      setAgentId(readString(snapshotResponse.agent_id))

      if (snapshotResponse.source === "cache" || snapshotResponse.source === "live") {
        setSnapshotSource(snapshotResponse.source)
      }
    } catch (error) {
      const details =
        error instanceof Error ? error.message : "Unknown snapshot fetch error"
      setErrorMessage(details)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleRefresh = useCallback(() => {
    void fetchSnapshot(true)
  }, [fetchSnapshot])

  const handleToggleGroup = useCallback((type: ConfigSnapshotComponentType) => {
    setExpandedGroups((previous) => ({
      ...previous,
      [type]: !previous[type],
    }))
  }, [])

  const handleToggleItem = useCallback((chunkKey: string) => {
    setExpandedItems((previous) => ({
      ...previous,
      [chunkKey]: !previous[chunkKey],
    }))
  }, [])

  const handleCopyChunk = useCallback(async (chunk: ConfigSnapshotChunk) => {
    const chunkKey = getChunkKey(chunk)
    const { value } = getViewerContent(chunk)

    try {
      await navigator.clipboard.writeText(value)
      setCopiedChunkKey(chunkKey)
    } catch (error) {
      console.error("[ConfigInspector] copy failed", error)
    }
  }, [])

  const handleJumpToNode = useCallback(
    (nodeName: string) => {
      const targetChunkKey = nodeChunkLookup.get(nodeName)
      if (!targetChunkKey) return

      setExpandedGroups((previous) => ({
        ...previous,
        node_prompt: true,
      }))
      setExpandedItems((previous) => ({
        ...previous,
        [targetChunkKey]: true,
      }))

      window.setTimeout(() => {
        itemRefs.current[targetChunkKey]?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        })
      }, 50)
    },
    [nodeChunkLookup]
  )

  useEffect(() => {
    if (!isOpen) return
    if (hasFetchedRef.current) return

    hasFetchedRef.current = true
    void fetchSnapshot(false)
  }, [fetchSnapshot, isOpen])

  useEffect(() => {
    if (!copiedChunkKey) return

    const timeoutId = window.setTimeout(() => {
      setCopiedChunkKey(null)
    }, 1200)

    return () => window.clearTimeout(timeoutId)
  }, [copiedChunkKey])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  return (
    <div
      className={cn(
        "fixed inset-0 z-50",
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      )}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close Agent Config panel"
        className={cn(
          "absolute inset-0 bg-black/60 transition-opacity",
          isOpen ? "opacity-100" : "opacity-0"
        )}
      />

      <aside
        className={cn(
          "absolute top-0 right-0 flex h-full w-full max-w-3xl flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl transition-transform duration-200",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 px-4 py-4">
          <div>
            <h2 className="text-base font-semibold">Agent Config</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Last snapshot: {formatSnapshotTimestamp(snapshotAt)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Source: {snapshotSource}
              {agentId ? ` · Agent ${agentId}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs font-medium transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw
                className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
              />
              <span>{isLoading ? "Refreshing..." : "Refresh Snapshot"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-md border border-zinc-700 p-1.5 transition-colors hover:bg-zinc-900"
              aria-label="Close Agent Config panel"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {errorMessage && (
              <div className="rounded-md border border-red-700/60 bg-red-950/40 px-3 py-3 text-sm text-red-100">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Snapshot request failed</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-red-200">
                      {errorMessage}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="mb-2 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-zinc-300" />
                <h3 className="text-sm font-semibold">Transfer Map</h3>
              </div>

              {transferRows.length === 0 ? (
                <p className="text-xs text-zinc-400">
                  No node transfer edges available in the current snapshot.
                </p>
              ) : (
                <div className="space-y-2">
                  {transferRows.map((row) => (
                    <div
                      key={row.nodeName}
                      className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => handleJumpToNode(row.nodeName)}
                        className={cn(
                          "font-medium text-zinc-100 underline-offset-2",
                          nodeChunkLookup.has(row.nodeName)
                            ? "cursor-pointer hover:underline"
                            : "cursor-default"
                        )}
                        disabled={!nodeChunkLookup.has(row.nodeName)}
                        title={
                          nodeChunkLookup.has(row.nodeName)
                            ? "Jump to node prompt"
                            : "Node prompt not present in snapshot"
                        }
                      >
                        {row.nodeName}
                      </button>

                      {row.outgoing.length === 0 ? (
                        <p className="mt-1 text-zinc-500">No outgoing edges</p>
                      ) : (
                        <ul className="mt-1 space-y-1 pl-3">
                          {row.outgoing.map((edge) => (
                            <li key={edge.edgeId} className="text-zinc-300">
                              <span className="text-zinc-500">→ </span>
                              <button
                                type="button"
                                onClick={() => handleJumpToNode(edge.target)}
                                className={cn(
                                  "underline-offset-2",
                                  nodeChunkLookup.has(edge.target)
                                    ? "cursor-pointer hover:underline"
                                    : "cursor-default text-zinc-400"
                                )}
                                disabled={!nodeChunkLookup.has(edge.target)}
                                title={
                                  nodeChunkLookup.has(edge.target)
                                    ? "Jump to target node prompt"
                                    : "Node prompt not present in snapshot"
                                }
                              >
                                {edge.target}
                              </button>
                              <span className="text-zinc-500">
                                {" "}
                                ({truncate(edge.forwardCondition, 70)})
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {groupDefinitions.map((group) => {
              const items = groupedChunks[group.type]
              const isExpanded = expandedGroups[group.type]

              return (
                <section
                  key={group.type}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleGroup(group.type)}
                    className="flex w-full items-center justify-between px-3 py-3 text-left"
                  >
                    <div>
                      <h3 className="text-sm font-semibold">{group.label}</h3>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {items.length} item{items.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-zinc-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-zinc-400" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="space-y-2 border-t border-zinc-800 p-3">
                      {items.length === 0 ? (
                        <p className="text-xs text-zinc-500">No components.</p>
                      ) : (
                        items.map((chunk) => {
                          const chunkKey = getChunkKey(chunk)
                          const expanded = Boolean(expandedItems[chunkKey])
                          const summary = truncate(summarizeContent(chunk), 100)
                          const viewer = getViewerContent(chunk)

                          return (
                            <div
                              key={chunkKey}
                              ref={(element) => {
                                itemRefs.current[chunkKey] = element
                              }}
                              className="rounded-md border border-zinc-800 bg-zinc-950/70"
                            >
                              <button
                                type="button"
                                onClick={() => handleToggleItem(chunkKey)}
                                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-zinc-100">
                                    {chunk.component_id}
                                  </p>
                                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-500">
                                    {chunk.component_type}
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-300">
                                    {summary || "(empty content)"}
                                  </p>
                                </div>
                                {expanded ? (
                                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                                ) : (
                                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                                )}
                              </button>

                              {expanded && (
                                <div className="border-t border-zinc-800 px-3 py-3">
                                  <div className="mb-2 flex items-center justify-end">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleCopyChunk(chunk)
                                      }}
                                      className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs transition-colors hover:bg-zinc-900"
                                      title="Copy full content"
                                    >
                                      {copiedChunkKey === chunkKey ? (
                                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5 text-zinc-300" />
                                      )}
                                      <span>
                                        {copiedChunkKey === chunkKey
                                          ? "Copied"
                                          : "Copy"}
                                      </span>
                                    </button>
                                  </div>

                                  <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
                                    <Response className="max-h-[280px] overflow-auto px-3 py-3 text-sm leading-6">
                                      {`\`\`\`${viewer.language}\n${viewer.value || "(empty)"}\n\`\`\``}
                                    </Response>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      </aside>
    </div>
  )
}
