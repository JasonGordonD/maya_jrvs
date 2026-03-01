"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react"

import {
  mjrvs_build_transfer_map,
  type mjrvs_component_type,
  type mjrvs_config_chunk,
  type mjrvs_config_snapshot,
  type mjrvs_transfer_map,
} from "@/lib/mjrvs_config_snapshot"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GroupedChunks = {
  root_prompt: mjrvs_config_chunk[]
  node_prompt: mjrvs_config_chunk[]
  edge_condition: mjrvs_config_chunk[]
  tool_schema: mjrvs_config_chunk[]
  global_config: mjrvs_config_chunk[]
}

type InspectorTab = "components" | "transfer-map"

const GROUP_ORDER: mjrvs_component_type[] = [
  "root_prompt",
  "node_prompt",
  "edge_condition",
  "tool_schema",
  "global_config",
]

const GROUP_LABELS: Record<mjrvs_component_type, string> = {
  root_prompt: "Root Prompt",
  node_prompt: "Nodes",
  edge_condition: "Edges",
  tool_schema: "Tools",
  global_config: "Global Config",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupChunks(chunks: mjrvs_config_chunk[]): GroupedChunks {
  const groups: GroupedChunks = {
    root_prompt: [],
    node_prompt: [],
    edge_condition: [],
    tool_schema: [],
    global_config: [],
  }
  for (const chunk of chunks) {
    groups[chunk.component_type]?.push(chunk)
  }
  return groups
}

function summarize(content: string, max = 100): string {
  const flat = content.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max)}...` : flat
}

function isJsonLike(s: string): boolean {
  const trimmed = s.trimStart()
  return trimmed.startsWith("{") || trimmed.startsWith("[")
}

function formatJsonSafe(s: string): string {
  if (!isJsonLike(s)) return s
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      /* ignore */
    }
  }, [text])

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(id)
  }, [copied])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] transition-colors hover:bg-zinc-800"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3 text-zinc-400" />
      )}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  )
}

function ContentViewer({ content }: { content: string }) {
  const formatted = useMemo(() => formatJsonSafe(content), [content])
  const json = isJsonLike(content)

  return (
    <div className="relative mt-2">
      <div className="absolute top-2 right-2 z-10">
        <CopyButton text={content} />
      </div>
      <pre
        className={cn(
          "max-h-[400px] overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 pr-20 text-xs leading-relaxed",
          json ? "text-emerald-300/90" : "text-zinc-300"
        )}
      >
        <code>{formatted}</code>
      </pre>
    </div>
  )
}

function chunkKey(chunk: mjrvs_config_chunk): string {
  return `${chunk.component_type}:${chunk.raw_id}:${chunk.component_id}`
}

function ChunkItem({
  chunk,
  isExpanded,
  onToggle,
}: {
  chunk: mjrvs_config_chunk
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div
      className="border-b border-zinc-800/60 last:border-b-0"
      data-chunk-key={chunkKey(chunk)}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/40"
      >
        {isExpanded ? (
          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
        ) : (
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-200">
            {chunk.component_id}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {summarize(chunk.content)}
          </p>
        </div>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3">
          <ContentViewer content={chunk.content} />
        </div>
      )}
    </div>
  )
}

function ChunkGroup({
  type,
  chunks,
  expandedId,
  onToggleChunk,
}: {
  type: mjrvs_component_type
  chunks: mjrvs_config_chunk[]
  expandedId: string | null
  onToggleChunk: (id: string) => void
}) {
  const hasExpanded = chunks.some((c) => chunkKey(c) === expandedId)
  const [manualCollapsed, setManualCollapsed] = useState(false)
  const collapsed = manualCollapsed && !hasExpanded

  if (chunks.length === 0) return null

  return (
    <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
      <button
        type="button"
        onClick={() => setManualCollapsed((p) => !p)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/50"
      >
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {GROUP_LABELS[type]}
          </span>
        </div>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
          {chunks.length}
        </span>
      </button>

      {!collapsed && (
        <div>
          {chunks.map((chunk) => {
            const key = chunkKey(chunk)
            return (
              <ChunkItem
                key={key}
                chunk={chunk}
                isExpanded={expandedId === key}
                onToggle={() => onToggleChunk(key)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transfer Map
// ---------------------------------------------------------------------------

function TransferMapView({
  transferMap,
  onNodeClick,
}: {
  transferMap: mjrvs_transfer_map
  onNodeClick: (name: string) => void
}) {
  const adjacency = useMemo(() => {
    const adj = new Map<string, { outgoing: string[]; incoming: string[] }>()
    for (const node of transferMap.nodes) {
      adj.set(node.name, { outgoing: [], incoming: [] })
    }
    for (const edge of transferMap.edges) {
      const src = adj.get(edge.source)
      const tgt = adj.get(edge.target)
      if (src) src.outgoing.push(edge.target)
      if (tgt) tgt.incoming.push(edge.source)
    }
    return adj
  }, [transferMap])

  if (transferMap.nodes.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-zinc-500">
        No nodes found in the current snapshot.
      </p>
    )
  }

  return (
    <div className="space-y-4 px-3 py-3">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Node Topology
        </h3>
        {transferMap.nodes.map((node) => {
          const entry = adjacency.get(node.name)
          return (
            <div
              key={node.id || node.name}
              className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2"
            >
              <button
                type="button"
                onClick={() => onNodeClick(node.name)}
                className="text-sm font-medium text-sky-400 underline-offset-2 transition-colors hover:text-sky-300 hover:underline"
              >
                {node.name}
              </button>
              {entry && (
                <div className="mt-1 space-y-0.5 text-[11px] text-zinc-500">
                  {entry.incoming.length > 0 && (
                    <p>
                      <span className="text-zinc-600">from:</span>{" "}
                      {entry.incoming.map((n, i) => (
                        <span key={n}>
                          {i > 0 && ", "}
                          <button
                            type="button"
                            onClick={() => onNodeClick(n)}
                            className="text-zinc-400 underline-offset-2 hover:text-zinc-300 hover:underline"
                          >
                            {n}
                          </button>
                        </span>
                      ))}
                    </p>
                  )}
                  {entry.outgoing.length > 0 && (
                    <p>
                      <span className="text-zinc-600">to:</span>{" "}
                      {entry.outgoing.map((n, i) => (
                        <span key={n}>
                          {i > 0 && ", "}
                          <button
                            type="button"
                            onClick={() => onNodeClick(n)}
                            className="text-zinc-400 underline-offset-2 hover:text-zinc-300 hover:underline"
                          >
                            {n}
                          </button>
                        </span>
                      ))}
                    </p>
                  )}
                  {entry.incoming.length === 0 &&
                    entry.outgoing.length === 0 && (
                      <p className="italic text-zinc-600">isolated node</p>
                    )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {transferMap.edges.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Edge List
          </h3>
          {transferMap.edges.map((edge, i) => (
            <div
              key={`${edge.source}-${edge.target}-${i}`}
              className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs"
            >
              <button
                type="button"
                onClick={() => onNodeClick(edge.source)}
                className="font-medium text-sky-400 hover:text-sky-300"
              >
                {edge.source}
              </button>
              <span className="text-zinc-600">&rarr;</span>
              <button
                type="button"
                onClick={() => onNodeClick(edge.target)}
                className="font-medium text-sky-400 hover:text-sky-300"
              >
                {edge.target}
              </button>
              {edge.forward_condition && (
                <span
                  className="ml-auto max-w-[50%] truncate text-[10px] text-zinc-500"
                  title={edge.forward_condition}
                >
                  {edge.forward_condition}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main ConfigInspector component
// ---------------------------------------------------------------------------

export function ConfigInspector({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [snapshot, setSnapshot] = useState<mjrvs_config_snapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<InspectorTab>("components")
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchSnapshot = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/agent-config", {
        method: "GET",
        cache: "no-store",
      })
      const data: mjrvs_config_snapshot = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || `HTTP ${res.status}`)
        if (data.chunks?.length > 0) setSnapshot(data)
        return
      }
      setSnapshot(data)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch agent config"
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && !snapshot && !loading) {
      fetchSnapshot()
    }
  }, [open, snapshot, loading, fetchSnapshot])

  const grouped = useMemo(
    () => (snapshot ? groupChunks(snapshot.chunks) : null),
    [snapshot]
  )

  const transferMap = useMemo(
    () => (snapshot ? mjrvs_build_transfer_map(snapshot.chunks) : null),
    [snapshot]
  )

  const handleToggleChunk = useCallback((id: string) => {
    setExpandedChunkId((prev) => (prev === id ? null : id))
  }, [])

  const handleNodeClick = useCallback(
    (name: string) => {
      setActiveTab("components")
      if (!grouped) return

      const nodeChunks = grouped.node_prompt
      const match = nodeChunks.find((c) => c.component_id === name)
      if (match) {
        const key = `${match.component_type}:${match.raw_id}:${match.component_id}`
        setExpandedChunkId(key)

        requestAnimationFrame(() => {
          const container = scrollRef.current
          if (!container) return
          const target = container.querySelector(
            `[data-chunk-key="${CSS.escape(key)}"]`
          )
          target?.scrollIntoView({ behavior: "smooth", block: "center" })
        })
      }
    },
    [grouped]
  )

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* panel */}
      <div className="relative flex h-full w-full max-w-lg flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl sm:max-w-xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-100">
              Agent Config
            </h2>
            {snapshot && (
              <span className="ml-2 text-[11px] text-zinc-500">
                {snapshot.agent_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchSnapshot}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-[11px] transition-colors hover:bg-zinc-800 disabled:opacity-50"
              title="Refresh Snapshot"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
              ) : (
                <RefreshCw className="h-3 w-3 text-zinc-400" />
              )}
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 transition-colors hover:bg-zinc-800"
              title="Close"
            >
              <X className="h-4 w-4 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* snapshot timestamp */}
        {snapshot && (
          <div className="border-b border-zinc-800/60 px-4 py-2 text-[11px] text-zinc-500">
            Last snapshot:{" "}
            {new Date(snapshot.snapshot_at).toLocaleString()}
          </div>
        )}

        {/* tabs */}
        <div className="flex border-b border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab("components")}
            className={cn(
              "flex-1 px-4 py-2 text-xs font-medium transition-colors",
              activeTab === "components"
                ? "border-b-2 border-sky-500 text-sky-400"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            Components
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("transfer-map")}
            className={cn(
              "flex-1 px-4 py-2 text-xs font-medium transition-colors",
              activeTab === "transfer-map"
                ? "border-b-2 border-sky-500 text-sky-400"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            Transfer Map
          </button>
        </div>

        {/* error banner */}
        {error && (
          <div className="border-b border-red-900/50 bg-red-950/40 px-4 py-2.5 text-xs text-red-300">
            <p className="font-medium">Error</p>
            <p className="mt-0.5 break-words">{error}</p>
          </div>
        )}

        {/* body */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {loading && !snapshot && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
              <span className="ml-2 text-sm text-zinc-500">
                Loading config...
              </span>
            </div>
          )}

          {!loading && !snapshot && !error && (
            <div className="px-4 py-16 text-center text-sm text-zinc-500">
              Click <strong>Refresh</strong> to pull the agent configuration.
            </div>
          )}

          {snapshot && activeTab === "components" && grouped && (
            <div className="p-3">
              {GROUP_ORDER.map((type) => (
                <ChunkGroup
                  key={type}
                  type={type}
                  chunks={grouped[type]}
                  expandedId={expandedChunkId}
                  onToggleChunk={handleToggleChunk}
                />
              ))}

              {snapshot.chunks.length === 0 && (
                <p className="py-8 text-center text-sm text-zinc-500">
                  No components found in this agent configuration.
                </p>
              )}
            </div>
          )}

          {snapshot && activeTab === "transfer-map" && transferMap && (
            <TransferMapView
              transferMap={transferMap}
              onNodeClick={handleNodeClick}
            />
          )}
        </div>
      </div>
    </div>
  )
}
