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
  mjrvs_config_snapshot_chunk,
  mjrvs_config_snapshot_component_type,
  mjrvs_config_snapshot_source,
} from "@/lib/mjrvs_config_snapshot"

type mjrvs_config_inspector_panel_props = {
  is_open: boolean
  on_close: () => void
}

type mjrvs_snapshot_api_response = {
  snapshot_at: string | null
  chunks: mjrvs_config_snapshot_chunk[]
  source?: mjrvs_config_snapshot_source
}

type mjrvs_viewer_language = "json" | "text"

type mjrvs_group_definition = {
  type: mjrvs_config_snapshot_component_type
  label: string
}

type mjrvs_transfer_edge = {
  edge_id: string
  source: string
  target: string
  forward_condition: string
}

const mjrvs_group_definitions: mjrvs_group_definition[] = [
  { type: "root_prompt", label: "Root Prompt" },
  { type: "node_prompt", label: "Nodes" },
  { type: "edge_condition", label: "Edges" },
  { type: "tool_schema", label: "Tools" },
  { type: "global_config", label: "Global Config" },
]

const mjrvs_initial_group_expansion_state: Record<
  mjrvs_config_snapshot_component_type,
  boolean
> = {
  root_prompt: true,
  node_prompt: true,
  edge_condition: true,
  tool_schema: true,
  global_config: true,
}

const mjrvs_is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const mjrvs_read_string = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null

const mjrvs_stringify_content = (value: unknown): string => {
  if (typeof value === "string") return value

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const mjrvs_summarize_content = (chunk: mjrvs_config_snapshot_chunk): string => {
  const content = chunk.content

  if (mjrvs_is_record(content)) {
    if (chunk.component_type === "node_prompt") {
      const prompt_text = mjrvs_read_string(content.additional_prompt)
      if (prompt_text) return prompt_text
    }

    if (chunk.component_type === "root_prompt") {
      const prompt_text = mjrvs_read_string(content.prompt)
      if (prompt_text) return prompt_text
    }

    if (chunk.component_type === "edge_condition") {
      const forward_text = mjrvs_read_string(content.forward_condition)
      if (forward_text) return `Forward: ${forward_text}`
    }
  }

  return mjrvs_stringify_content(content).replace(/\s+/g, " ").trim()
}

const mjrvs_truncate = (value: string, max_length = 100): string => {
  if (value.length <= max_length) return value
  return `${value.slice(0, max_length - 3)}...`
}

const mjrvs_get_chunk_key = (chunk: mjrvs_config_snapshot_chunk): string =>
  `${chunk.component_type}:${chunk.raw_id}`

const mjrvs_get_viewer_content = (
  chunk: mjrvs_config_snapshot_chunk
): { language: mjrvs_viewer_language; value: string } => {
  if (typeof chunk.content === "string") {
    return { language: "text", value: chunk.content }
  }

  return { language: "json", value: mjrvs_stringify_content(chunk.content) }
}

const mjrvs_format_snapshot_timestamp = (timestamp: string | null): string => {
  if (!timestamp) return "Not captured yet"

  const parsed_date = new Date(timestamp)
  if (Number.isNaN(parsed_date.getTime())) return timestamp

  return parsed_date.toLocaleString("en-GB", {
    hour12: false,
  })
}

const mjrvs_create_empty_groups = (): Record<
  mjrvs_config_snapshot_component_type,
  mjrvs_config_snapshot_chunk[]
> => ({
  root_prompt: [],
  node_prompt: [],
  edge_condition: [],
  tool_schema: [],
  global_config: [],
})

const mjrvs_parse_transfer_edge = (
  chunk: mjrvs_config_snapshot_chunk
): mjrvs_transfer_edge | null => {
  if (!mjrvs_is_record(chunk.content)) return null

  const source =
    mjrvs_read_string(chunk.content.source_node_name) ??
    mjrvs_read_string(chunk.content.source_node) ??
    null
  const target =
    mjrvs_read_string(chunk.content.target_node_name) ??
    mjrvs_read_string(chunk.content.target_node) ??
    null

  if (!source || !target) return null

  return {
    edge_id: chunk.raw_id,
    source,
    target,
    forward_condition: mjrvs_read_string(chunk.content.forward_condition) ?? "(none)",
  }
}

export function Mjrvs_config_inspector_panel({
  is_open,
  on_close,
}: mjrvs_config_inspector_panel_props) {
  const [chunks, set_chunks] = useState<mjrvs_config_snapshot_chunk[]>([])
  const [snapshot_at, set_snapshot_at] = useState<string | null>(null)
  const [snapshot_source, set_snapshot_source] =
    useState<mjrvs_config_snapshot_source>("live")
  const [is_loading, set_is_loading] = useState(false)
  const [error_message, set_error_message] = useState<string | null>(null)
  const [expanded_groups, set_expanded_groups] = useState(
    mjrvs_initial_group_expansion_state
  )
  const [expanded_items, set_expanded_items] = useState<Record<string, boolean>>(
    {}
  )
  const [copied_chunk_key, set_copied_chunk_key] = useState<string | null>(null)

  const has_fetched_ref = useRef(false)
  const item_refs = useRef<Record<string, HTMLDivElement | null>>({})

  const grouped_chunks = useMemo(() => {
    const grouped = mjrvs_create_empty_groups()
    chunks.forEach((chunk) => {
      grouped[chunk.component_type].push(chunk)
    })

    mjrvs_group_definitions.forEach((group) => {
      grouped[group.type].sort((left, right) =>
        left.component_id.localeCompare(right.component_id)
      )
    })

    return grouped
  }, [chunks])

  const transfer_edges = useMemo(
    () =>
      grouped_chunks.edge_condition
        .map((chunk) => mjrvs_parse_transfer_edge(chunk))
        .filter((edge): edge is mjrvs_transfer_edge => Boolean(edge)),
    [grouped_chunks.edge_condition]
  )

  const node_chunk_lookup = useMemo(() => {
    const lookup = new Map<string, string>()
    grouped_chunks.node_prompt.forEach((chunk) => {
      lookup.set(chunk.component_id, mjrvs_get_chunk_key(chunk))
    })
    return lookup
  }, [grouped_chunks.node_prompt])

  const transfer_nodes = useMemo(() => {
    const names = new Set<string>()

    grouped_chunks.node_prompt.forEach((chunk) => {
      names.add(chunk.component_id)
    })
    transfer_edges.forEach((edge) => {
      names.add(edge.source)
      names.add(edge.target)
    })

    return Array.from(names).sort((left, right) => left.localeCompare(right))
  }, [grouped_chunks.node_prompt, transfer_edges])

  const transfer_rows = useMemo(
    () =>
      transfer_nodes.map((node_name) => ({
        node_name,
        outgoing: transfer_edges.filter((edge) => edge.source === node_name),
      })),
    [transfer_edges, transfer_nodes]
  )

  const fetch_snapshot = useCallback(async (refresh: boolean) => {
    set_is_loading(true)
    set_error_message(null)

    try {
      const request_url = refresh
        ? "/api/agent-config?refresh=1"
        : "/api/agent-config"
      const response = await fetch(request_url, {
        method: "GET",
        cache: "no-store",
      })

      const raw_body = await response.text()
      const parsed_body: unknown = raw_body ? JSON.parse(raw_body) : {}

      if (!response.ok) {
        if (mjrvs_is_record(parsed_body)) {
          const error_text = mjrvs_read_string(parsed_body.error)
          const details_text = mjrvs_read_string(parsed_body.details)
          throw new Error(
            details_text
              ? `${error_text ?? "Snapshot request failed"}: ${details_text}`
              : error_text ?? `Snapshot request failed (${response.status})`
          )
        }

        throw new Error(`Snapshot request failed (${response.status})`)
      }

      if (!mjrvs_is_record(parsed_body) || !Array.isArray(parsed_body.chunks)) {
        throw new Error("Snapshot response did not include a chunks array")
      }

      const snapshot_response = parsed_body as Partial<mjrvs_snapshot_api_response>
      set_chunks(snapshot_response.chunks ?? [])
      set_snapshot_at(mjrvs_read_string(snapshot_response.snapshot_at))

      if (
        snapshot_response.source === "cache" ||
        snapshot_response.source === "live"
      ) {
        set_snapshot_source(snapshot_response.source)
      } else if (refresh) {
        set_snapshot_source("live")
      }
    } catch (error) {
      const details =
        error instanceof Error ? error.message : "Unknown snapshot fetch error"
      set_error_message(details)
    } finally {
      set_is_loading(false)
    }
  }, [])

  const handle_refresh = useCallback(() => {
    void fetch_snapshot(true)
  }, [fetch_snapshot])

  const handle_toggle_group = useCallback(
    (type: mjrvs_config_snapshot_component_type) => {
      set_expanded_groups((previous) => ({
        ...previous,
        [type]: !previous[type],
      }))
    },
    []
  )

  const handle_toggle_item = useCallback((chunk_key: string) => {
    set_expanded_items((previous) => ({
      ...previous,
      [chunk_key]: !previous[chunk_key],
    }))
  }, [])

  const handle_copy_chunk = useCallback(async (chunk: mjrvs_config_snapshot_chunk) => {
    const chunk_key = mjrvs_get_chunk_key(chunk)
    const { value } = mjrvs_get_viewer_content(chunk)

    try {
      await navigator.clipboard.writeText(value)
      set_copied_chunk_key(chunk_key)
    } catch (error) {
      console.error("[mjrvs_config_inspector] copy failed", error)
    }
  }, [])

  const handle_jump_to_node = useCallback(
    (node_name: string) => {
      const target_chunk_key = node_chunk_lookup.get(node_name)
      if (!target_chunk_key) return

      set_expanded_groups((previous) => ({
        ...previous,
        node_prompt: true,
      }))
      set_expanded_items((previous) => ({
        ...previous,
        [target_chunk_key]: true,
      }))

      window.setTimeout(() => {
        item_refs.current[target_chunk_key]?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        })
      }, 50)
    },
    [node_chunk_lookup]
  )

  useEffect(() => {
    if (!is_open) return
    if (has_fetched_ref.current) return

    has_fetched_ref.current = true
    void fetch_snapshot(false)
  }, [fetch_snapshot, is_open])

  useEffect(() => {
    if (!copied_chunk_key) return

    const timeout_id = window.setTimeout(() => {
      set_copied_chunk_key(null)
    }, 1200)

    return () => window.clearTimeout(timeout_id)
  }, [copied_chunk_key])

  useEffect(() => {
    if (!is_open) return

    const handle_key_down = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        on_close()
      }
    }

    window.addEventListener("keydown", handle_key_down)
    return () => window.removeEventListener("keydown", handle_key_down)
  }, [is_open, on_close])

  return (
    <div
      className={cn(
        "fixed inset-0 z-50",
        is_open ? "pointer-events-auto" : "pointer-events-none"
      )}
      aria-hidden={!is_open}
    >
      <button
        type="button"
        onClick={on_close}
        aria-label="Close Agent Config panel"
        className={cn(
          "absolute inset-0 bg-black/60 transition-opacity",
          is_open ? "opacity-100" : "opacity-0"
        )}
      />

      <aside
        className={cn(
          "absolute top-0 right-0 flex h-full w-full max-w-3xl flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl transition-transform duration-200",
          is_open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 px-4 py-4">
          <div>
            <h2 className="text-base font-semibold">Agent Config</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Last snapshot: {mjrvs_format_snapshot_timestamp(snapshot_at)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Source: {snapshot_source}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handle_refresh}
              disabled={is_loading}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs font-medium transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw
                className={cn("h-3.5 w-3.5", is_loading && "animate-spin")}
              />
              <span>{is_loading ? "Refreshing..." : "Refresh Snapshot"}</span>
            </button>

            <button
              type="button"
              onClick={on_close}
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
            {error_message && (
              <div className="rounded-md border border-red-700/60 bg-red-950/40 px-3 py-3 text-sm text-red-100">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Snapshot request failed</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-red-200">
                      {error_message}
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

              {transfer_rows.length === 0 ? (
                <p className="text-xs text-zinc-400">
                  No node transfer edges available in the current snapshot.
                </p>
              ) : (
                <div className="space-y-2">
                  {transfer_rows.map((row) => (
                    <div
                      key={row.node_name}
                      className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => handle_jump_to_node(row.node_name)}
                        className={cn(
                          "font-medium text-zinc-100 underline-offset-2",
                          node_chunk_lookup.has(row.node_name)
                            ? "cursor-pointer hover:underline"
                            : "cursor-default"
                        )}
                        disabled={!node_chunk_lookup.has(row.node_name)}
                        title={
                          node_chunk_lookup.has(row.node_name)
                            ? "Jump to node prompt"
                            : "Node prompt not present in snapshot"
                        }
                      >
                        {row.node_name}
                      </button>

                      {row.outgoing.length === 0 ? (
                        <p className="mt-1 text-zinc-500">No outgoing edges</p>
                      ) : (
                        <ul className="mt-1 space-y-1 pl-3">
                          {row.outgoing.map((edge) => (
                            <li key={edge.edge_id} className="text-zinc-300">
                              <span className="text-zinc-500">→ </span>
                              <button
                                type="button"
                                onClick={() => handle_jump_to_node(edge.target)}
                                className={cn(
                                  "underline-offset-2",
                                  node_chunk_lookup.has(edge.target)
                                    ? "cursor-pointer hover:underline"
                                    : "cursor-default text-zinc-400"
                                )}
                                disabled={!node_chunk_lookup.has(edge.target)}
                                title={
                                  node_chunk_lookup.has(edge.target)
                                    ? "Jump to target node prompt"
                                    : "Node prompt not present in snapshot"
                                }
                              >
                                {edge.target}
                              </button>
                              <span className="text-zinc-500">
                                {" "}
                                ({mjrvs_truncate(edge.forward_condition, 70)})
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

            {mjrvs_group_definitions.map((group) => {
              const items = grouped_chunks[group.type]
              const is_expanded = expanded_groups[group.type]

              return (
                <section
                  key={group.type}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40"
                >
                  <button
                    type="button"
                    onClick={() => handle_toggle_group(group.type)}
                    className="flex w-full items-center justify-between px-3 py-3 text-left"
                  >
                    <div>
                      <h3 className="text-sm font-semibold">{group.label}</h3>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {items.length} item{items.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    {is_expanded ? (
                      <ChevronDown className="h-4 w-4 text-zinc-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-zinc-400" />
                    )}
                  </button>

                  {is_expanded && (
                    <div className="space-y-2 border-t border-zinc-800 p-3">
                      {items.length === 0 ? (
                        <p className="text-xs text-zinc-500">No components.</p>
                      ) : (
                        items.map((chunk) => {
                          const chunk_key = mjrvs_get_chunk_key(chunk)
                          const is_item_expanded = Boolean(expanded_items[chunk_key])
                          const summary = mjrvs_truncate(
                            mjrvs_summarize_content(chunk),
                            100
                          )
                          const viewer = mjrvs_get_viewer_content(chunk)

                          return (
                            <div
                              key={chunk_key}
                              ref={(element) => {
                                item_refs.current[chunk_key] = element
                              }}
                              className="rounded-md border border-zinc-800 bg-zinc-950/70"
                            >
                              <button
                                type="button"
                                onClick={() => handle_toggle_item(chunk_key)}
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
                                {is_item_expanded ? (
                                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                                ) : (
                                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                                )}
                              </button>

                              {is_item_expanded && (
                                <div className="border-t border-zinc-800 px-3 py-3">
                                  <div className="mb-2 flex items-center justify-end">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handle_copy_chunk(chunk)
                                      }}
                                      className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs transition-colors hover:bg-zinc-900"
                                      title="Copy full content"
                                    >
                                      {copied_chunk_key === chunk_key ? (
                                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5 text-zinc-300" />
                                      )}
                                      <span>
                                        {copied_chunk_key === chunk_key
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
