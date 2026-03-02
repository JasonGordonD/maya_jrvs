import {
  getMjrvsElevenLabsAgentId as get_mjrvs_elevenlabs_agent_id,
  getElevenLabsApiKey as get_elevenlabs_api_key,
} from "@/lib/server-env"

export type mjrvs_config_snapshot_component_type =
  | "global_config"
  | "node_prompt"
  | "edge_condition"
  | "tool_schema"
  | "root_prompt"

export type mjrvs_config_snapshot_chunk = {
  component_type: mjrvs_config_snapshot_component_type
  component_id: string
  content: unknown
  raw_id: string
  snapshot_at: string
}

export type mjrvs_config_snapshot_state = {
  agent_id: string | null
  snapshot_at: string | null
  chunks: mjrvs_config_snapshot_chunk[]
}

export type mjrvs_config_snapshot_source = "cache" | "live"

export type mjrvs_config_snapshot_result = mjrvs_config_snapshot_state & {
  source: mjrvs_config_snapshot_source
}

// Compatibility types for existing inspector module.
export type mjrvs_component_type = mjrvs_config_snapshot_component_type

export type mjrvs_config_chunk = {
  component_type: mjrvs_component_type
  component_id: string
  content: string
  raw_id: string
  snapshot_at: string
}

export type mjrvs_config_snapshot = {
  chunks: mjrvs_config_chunk[]
  snapshot_at: string
  agent_name: string
  error?: string
}

export type mjrvs_transfer_node = {
  id: string
  name: string
}

export type mjrvs_transfer_edge = {
  source: string
  target: string
  forward_condition: string
  backward_condition: string
}

export type mjrvs_transfer_map = {
  nodes: mjrvs_transfer_node[]
  edges: mjrvs_transfer_edge[]
}

type mjrvs_json_record = Record<string, unknown>

let mjrvs_snapshot_chunks_state: mjrvs_config_snapshot_chunk[] = []
let mjrvs_snapshot_at_state: string | null = null
let mjrvs_snapshot_agent_id_state: string | null = null

const mjrvs_is_record = (value: unknown): value is mjrvs_json_record =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const mjrvs_as_record = (value: unknown): mjrvs_json_record =>
  mjrvs_is_record(value) ? value : {}

const mjrvs_as_string = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null

const mjrvs_as_string_array = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => mjrvs_as_string(entry))
    .filter((entry): entry is string => Boolean(entry))
}

const mjrvs_sort_by_locale = (values: string[]): string[] =>
  [...values].sort((left, right) => left.localeCompare(right))

const mjrvs_unique_strings = (values: string[]): string[] =>
  mjrvs_sort_by_locale(Array.from(new Set(values)))

const mjrvs_normalize_tool_lookup_key = (value: string): string =>
  value.trim().toLowerCase()

const mjrvs_safe_stringify = (value: unknown): string => {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const mjrvs_parse_json_body = (raw_body: string): unknown => {
  if (!raw_body) return {}
  try {
    return JSON.parse(raw_body)
  } catch {
    return raw_body
  }
}

const mjrvs_extract_workflow_node_tool_ids = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []

  return mjrvs_unique_strings(
    value.flatMap((entry) => {
      if (typeof entry === "string") return [entry]
      if (!mjrvs_is_record(entry)) return []

      const tool_id = mjrvs_as_string(entry.tool_id)
      const id = mjrvs_as_string(entry.id)
      const name = mjrvs_as_string(entry.name)

      return [tool_id, id, name].filter((candidate): candidate is string =>
        Boolean(candidate)
      )
    })
  )
}

const mjrvs_condition_to_text = (value: unknown): string => {
  if (value === null || value === undefined) return "(none)"
  if (typeof value === "string") return value
  if (!mjrvs_is_record(value)) return mjrvs_safe_stringify(value)

  const type = mjrvs_as_string(value.type)
  if (!type) return mjrvs_safe_stringify(value)

  if (type === "llm") {
    return mjrvs_as_string(value.condition) ?? mjrvs_safe_stringify(value)
  }

  if (type === "unconditional") {
    return "unconditional"
  }

  if (type === "result") {
    if (typeof value.successful === "boolean") {
      return `successful == ${value.successful}`
    }
    return mjrvs_safe_stringify(value)
  }

  if (type === "expression" && value.expression !== undefined) {
    return mjrvs_safe_stringify(value.expression)
  }

  return mjrvs_safe_stringify(value)
}

const mjrvs_register_tool_nodes = (
  registrations: Map<string, Set<string>>,
  display_name_by_key: Map<string, string>,
  tool_ids: string[],
  node_name: string
) => {
  tool_ids.forEach((tool_id) => {
    const trimmed_tool_id = tool_id.trim()
    if (!trimmed_tool_id) return

    const normalized_tool_id = mjrvs_normalize_tool_lookup_key(trimmed_tool_id)
    if (!registrations.has(normalized_tool_id)) {
      registrations.set(normalized_tool_id, new Set<string>())
    }
    if (!display_name_by_key.has(normalized_tool_id)) {
      display_name_by_key.set(normalized_tool_id, trimmed_tool_id)
    }
    registrations.get(normalized_tool_id)?.add(node_name)
  })
}

const mjrvs_resolve_node_registrations = (
  registrations: Map<string, Set<string>>,
  tool_lookup_keys: string[]
): string[] => {
  const collected_nodes = new Set<string>()

  tool_lookup_keys.forEach((lookup_key) => {
    const normalized_key = mjrvs_normalize_tool_lookup_key(lookup_key)
    registrations.get(normalized_key)?.forEach((node_name) => {
      collected_nodes.add(node_name)
    })
  })

  return mjrvs_sort_by_locale(Array.from(collected_nodes))
}

const mjrvs_to_snapshot_state = (): mjrvs_config_snapshot_state => ({
  agent_id: mjrvs_snapshot_agent_id_state,
  snapshot_at: mjrvs_snapshot_at_state,
  chunks: [...mjrvs_snapshot_chunks_state],
})

type mjrvs_snapshot_tool_entry = {
  raw_id: string
  name: string
  type: string
  tool_config: unknown
  lookup_keys: string[]
}

const mjrvs_collect_snapshot_chunks = (
  payload: mjrvs_json_record,
  snapshot_at: string
): mjrvs_config_snapshot_chunk[] => {
  const chunks: mjrvs_config_snapshot_chunk[] = []

  const conversation_config = mjrvs_as_record(payload.conversation_config)
  const root_agent_config = mjrvs_as_record(conversation_config.agent)
  const root_prompt_config = mjrvs_as_record(root_agent_config.prompt)
  const workflow_config = mjrvs_as_record(payload.workflow)
  const workflow_nodes = mjrvs_as_record(workflow_config.nodes)
  const workflow_edges = mjrvs_as_record(workflow_config.edges)
  const root_prompt_text = mjrvs_as_string(root_prompt_config.prompt) ?? ""

  const global_config_content = {
    llm_selection: {
      llm: mjrvs_as_string(root_prompt_config.llm),
      reasoning_effort: root_prompt_config.reasoning_effort ?? null,
      thinking_budget: root_prompt_config.thinking_budget ?? null,
      temperature: root_prompt_config.temperature ?? null,
      max_tokens: root_prompt_config.max_tokens ?? null,
      backup_llm_config: root_prompt_config.backup_llm_config ?? null,
      cascade_timeout_seconds: root_prompt_config.cascade_timeout_seconds ?? null,
    },
    tts_settings: conversation_config.tts ?? null,
    turn_config: conversation_config.turn ?? null,
    conversation_initiation_settings: {
      first_message: mjrvs_as_string(root_agent_config.first_message) ?? "",
      disable_first_message_interruptions:
        root_agent_config.disable_first_message_interruptions ?? null,
      language: mjrvs_as_string(root_agent_config.language),
    },
  }

  chunks.push({
    component_type: "global_config",
    component_id: "Global Config",
    content: global_config_content,
    raw_id: "global_config",
    snapshot_at,
  })

  chunks.push({
    component_type: "root_prompt",
    component_id: "Root Prompt",
    content: {
      prompt: root_prompt_text,
      llm: mjrvs_as_string(root_prompt_config.llm),
      full_prompt_config: root_prompt_config,
    },
    raw_id: "root_prompt",
    snapshot_at,
  })

  const node_id_to_name = new Map<string, string>()
  Object.entries(workflow_nodes).forEach(([node_id, node_value]) => {
    const node_record = mjrvs_as_record(node_value)
    const node_name = mjrvs_as_string(node_record.label) ?? node_id
    node_id_to_name.set(node_id, node_name)
  })

  const tool_registrations = new Map<string, Set<string>>()
  const tool_display_name_by_key = new Map<string, string>()
  const root_tool_ids = mjrvs_as_string_array(root_prompt_config.tool_ids)
  mjrvs_register_tool_nodes(
    tool_registrations,
    tool_display_name_by_key,
    root_tool_ids,
    "Root Agent"
  )

  const node_prompt_chunks: mjrvs_config_snapshot_chunk[] = []
  Object.entries(workflow_nodes).forEach(([node_id, node_value]) => {
    const node_record = mjrvs_as_record(node_value)
    const node_name = node_id_to_name.get(node_id) ?? node_id
    const node_conversation_config = mjrvs_as_record(node_record.conversation_config)
    const node_agent_config = mjrvs_as_record(node_conversation_config.agent)
    const node_prompt_config = mjrvs_as_record(node_agent_config.prompt)
    const additional_prompt = mjrvs_as_string(node_record.additional_prompt) ?? ""
    const additional_tool_ids = mjrvs_as_string_array(node_record.additional_tool_ids)
    const workflow_node_tool_ids = mjrvs_extract_workflow_node_tool_ids(
      node_record.tools
    )
    const node_tool_list = mjrvs_unique_strings([
      ...additional_tool_ids,
      ...workflow_node_tool_ids,
    ])

    mjrvs_register_tool_nodes(
      tool_registrations,
      tool_display_name_by_key,
      node_tool_list,
      node_name
    )

    node_prompt_chunks.push({
      component_type: "node_prompt",
      component_id: node_name,
      content: {
        node_name,
        node_id,
        node_type: mjrvs_as_string(node_record.type) ?? "unknown",
        additional_prompt,
        llm_assignment:
          mjrvs_as_string(node_prompt_config.llm) ??
          mjrvs_as_string(root_prompt_config.llm),
        tool_list: node_tool_list,
        node_prompt_config,
      },
      raw_id: node_id,
      snapshot_at,
    })
  })

  chunks.push(
    ...node_prompt_chunks.sort((left, right) =>
      left.component_id.localeCompare(right.component_id)
    )
  )

  const edge_chunks: mjrvs_config_snapshot_chunk[] = []
  Object.entries(workflow_edges).forEach(([edge_id, edge_value]) => {
    const edge_record = mjrvs_as_record(edge_value)
    const source_id = mjrvs_as_string(edge_record.source) ?? "unknown_source"
    const target_id = mjrvs_as_string(edge_record.target) ?? "unknown_target"
    const source_name = node_id_to_name.get(source_id) ?? source_id
    const target_name = node_id_to_name.get(target_id) ?? target_id
    const forward_condition_text = mjrvs_condition_to_text(
      edge_record.forward_condition
    )
    const backward_condition_text = mjrvs_condition_to_text(
      edge_record.backward_condition
    )

    edge_chunks.push({
      component_type: "edge_condition",
      component_id: `${source_name} -> ${target_name}`,
      content: {
        edge_id,
        source_node_name: source_name,
        source_node_id: source_id,
        target_node_name: target_name,
        target_node_id: target_id,
        forward_condition: forward_condition_text,
        backward_condition: backward_condition_text,
        forward_condition_raw: edge_record.forward_condition ?? null,
        backward_condition_raw: edge_record.backward_condition ?? null,
      },
      raw_id: edge_id,
      snapshot_at,
    })
  })

  chunks.push(
    ...edge_chunks.sort((left, right) =>
      left.component_id.localeCompare(right.component_id)
    )
  )

  const tool_entries_by_id = new Map<string, mjrvs_snapshot_tool_entry>()

  const add_tool_entry = (entry: mjrvs_snapshot_tool_entry) => {
    const normalized_entry_id = mjrvs_normalize_tool_lookup_key(entry.raw_id)
    const existing_entry = tool_entries_by_id.get(normalized_entry_id)

    if (!existing_entry) {
      tool_entries_by_id.set(normalized_entry_id, entry)
      return
    }

    const should_promote_config =
      mjrvs_is_record(entry.tool_config) &&
      Object.keys(entry.tool_config).length > 1 &&
      (!mjrvs_is_record(existing_entry.tool_config) ||
        Object.keys(existing_entry.tool_config).length <= 1)

    if (should_promote_config) {
      tool_entries_by_id.set(normalized_entry_id, entry)
    } else {
      existing_entry.lookup_keys = mjrvs_unique_strings([
        ...existing_entry.lookup_keys,
        ...entry.lookup_keys,
      ])
    }
  }

  const root_tools = Array.isArray(root_prompt_config.tools)
    ? root_prompt_config.tools
    : []

  root_tools.forEach((tool_value, index) => {
    const tool_record = mjrvs_as_record(tool_value)
    const raw_id =
      mjrvs_as_string(tool_record.tool_id) ??
      mjrvs_as_string(tool_record.id) ??
      mjrvs_as_string(tool_record.name) ??
      `tool_${index + 1}`
    const tool_name = mjrvs_as_string(tool_record.name) ?? raw_id
    const lookup_keys = mjrvs_unique_strings(
      [
        raw_id,
        tool_name,
        mjrvs_as_string(tool_record.tool_id),
        mjrvs_as_string(tool_record.id),
      ].filter((candidate): candidate is string => Boolean(candidate))
    )

    add_tool_entry({
      raw_id,
      name: tool_name,
      type: mjrvs_as_string(tool_record.type) ?? "unknown",
      tool_config: tool_record,
      lookup_keys,
    })
  })

  root_tool_ids.forEach((tool_id) => {
    add_tool_entry({
      raw_id: tool_id,
      name: tool_id,
      type: "unknown",
      tool_config: { tool_id, unresolved: true },
      lookup_keys: [tool_id],
    })
  })

  Array.from(tool_registrations.keys()).forEach((normalized_tool_id) => {
    if (tool_entries_by_id.has(normalized_tool_id)) return

    const display_name =
      tool_display_name_by_key.get(normalized_tool_id) ?? normalized_tool_id
    add_tool_entry({
      raw_id: display_name,
      name: display_name,
      type: "unknown",
      tool_config: { tool_reference: display_name, unresolved: true },
      lookup_keys: [display_name],
    })
  })

  const tool_chunks = Array.from(tool_entries_by_id.values())
    .map((tool_entry) => {
      const registered_on_nodes = mjrvs_resolve_node_registrations(
        tool_registrations,
        tool_entry.lookup_keys
      )

      return {
        component_type: "tool_schema" as const,
        component_id: tool_entry.name,
        content: {
          tool_name: tool_entry.name,
          tool_type: tool_entry.type,
          registered_on_nodes,
          full_tool_config: tool_entry.tool_config,
        },
        raw_id: tool_entry.raw_id,
        snapshot_at,
      }
    })
    .sort((left, right) => left.component_id.localeCompare(right.component_id))

  chunks.push(...tool_chunks)

  return chunks
}

const mjrvs_fetch_agent_config = async (
  agent_id: string,
  api_key: string
): Promise<mjrvs_json_record> => {
  const upstream_response = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agent_id)}`,
    {
      method: "GET",
      headers: {
        "xi-api-key": api_key,
      },
      cache: "no-store",
    }
  )

  const raw_body = await upstream_response.text()
  const parsed_body = mjrvs_parse_json_body(raw_body)

  if (!upstream_response.ok) {
    const details =
      typeof parsed_body === "string"
        ? parsed_body
        : mjrvs_safe_stringify(parsed_body) || upstream_response.statusText
    throw new Error(
      `Failed to fetch agent config from ElevenLabs (${upstream_response.status}): ${details}`
    )
  }

  if (!mjrvs_is_record(parsed_body)) {
    throw new Error("ElevenLabs returned an unexpected payload for agent config")
  }

  return parsed_body
}

export const mjrvs_has_config_snapshot = (): boolean =>
  mjrvs_snapshot_chunks_state.length > 0

export const mjrvs_get_config_snapshot_state = (): mjrvs_config_snapshot_state =>
  mjrvs_to_snapshot_state()

export const mjrvs_snapshot_agent_config = async (options?: {
  agent_id?: string
}): Promise<mjrvs_config_snapshot_state> => {
  const api_key = get_elevenlabs_api_key()
  const agent_id = options?.agent_id?.trim() || get_mjrvs_elevenlabs_agent_id()

  if (!api_key) {
    throw new Error("Missing ELEVENLABS_API_KEY")
  }

  if (!agent_id) {
    throw new Error("Missing MJRVS_ELEVENLABS_AGENT_ID")
  }

  const payload = await mjrvs_fetch_agent_config(agent_id, api_key)
  const snapshot_at = new Date().toISOString()
  const chunks = mjrvs_collect_snapshot_chunks(payload, snapshot_at)

  mjrvs_snapshot_chunks_state = chunks
  mjrvs_snapshot_at_state = snapshot_at
  mjrvs_snapshot_agent_id_state = agent_id

  return mjrvs_to_snapshot_state()
}

export const mjrvs_get_or_create_config_snapshot = async (options?: {
  agent_id?: string
}): Promise<mjrvs_config_snapshot_result> => {
  const requested_agent_id = options?.agent_id?.trim()

  if (
    mjrvs_has_config_snapshot() &&
    (!requested_agent_id || requested_agent_id === mjrvs_snapshot_agent_id_state)
  ) {
    return {
      ...mjrvs_to_snapshot_state(),
      source: "cache",
    }
  }

  const refreshed_snapshot = await mjrvs_snapshot_agent_config(options)
  return {
    ...refreshed_snapshot,
    source: "live",
  }
}

export const mjrvs_clear_config_snapshot_state = () => {
  mjrvs_snapshot_chunks_state = []
  mjrvs_snapshot_at_state = null
  mjrvs_snapshot_agent_id_state = null
}

const mjrvs_to_legacy_chunk = (
  chunk: mjrvs_config_snapshot_chunk
): mjrvs_config_chunk => ({
  ...chunk,
  content: mjrvs_safe_stringify(chunk.content),
})

export function mjrvs_decompose_agent_config(
  raw: Record<string, unknown>
): mjrvs_config_chunk[] {
  const payload = mjrvs_as_record(raw)
  const snapshot_at = new Date().toISOString()
  return mjrvs_collect_snapshot_chunks(payload, snapshot_at).map(mjrvs_to_legacy_chunk)
}

export function mjrvs_build_transfer_map(
  chunks: mjrvs_config_chunk[]
): mjrvs_transfer_map {
  const nodes_by_name = new Map<string, mjrvs_transfer_node>()
  const edges: mjrvs_transfer_edge[] = []

  chunks
    .filter((chunk) => chunk.component_type === "node_prompt")
    .forEach((chunk) => {
      if (!nodes_by_name.has(chunk.component_id)) {
        nodes_by_name.set(chunk.component_id, {
          id: chunk.raw_id,
          name: chunk.component_id,
        })
      }
    })

  chunks
    .filter((chunk) => chunk.component_type === "edge_condition")
    .forEach((chunk) => {
      try {
        const parsed = JSON.parse(chunk.content) as Record<string, unknown>
        const source =
          mjrvs_as_string(parsed.source_node_name) ??
          mjrvs_as_string(parsed.source_node) ??
          "unknown"
        const target =
          mjrvs_as_string(parsed.target_node_name) ??
          mjrvs_as_string(parsed.target_node) ??
          "unknown"

        if (!nodes_by_name.has(source)) {
          nodes_by_name.set(source, {
            id: mjrvs_as_string(parsed.source_node_id) ?? source,
            name: source,
          })
        }
        if (!nodes_by_name.has(target)) {
          nodes_by_name.set(target, {
            id: mjrvs_as_string(parsed.target_node_id) ?? target,
            name: target,
          })
        }

        edges.push({
          source,
          target,
          forward_condition: mjrvs_as_string(parsed.forward_condition) ?? "",
          backward_condition: mjrvs_as_string(parsed.backward_condition) ?? "",
        })
      } catch {
        // Ignore malformed chunks in legacy mode.
      }
    })

  return {
    nodes: Array.from(nodes_by_name.values()),
    edges,
  }
}
