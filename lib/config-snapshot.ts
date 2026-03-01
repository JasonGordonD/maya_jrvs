import { getElevenLabsAgentId, getElevenLabsApiKey } from "@/lib/server-env"

export type ConfigSnapshotComponentType =
  | "global_config"
  | "node_prompt"
  | "edge_condition"
  | "tool_schema"
  | "root_prompt"

export type ConfigSnapshotChunk = {
  component_type: ConfigSnapshotComponentType
  component_id: string
  content: unknown
  raw_id: string
  snapshot_at: string
}

export type ConfigSnapshotState = {
  agent_id: string | null
  snapshot_at: string | null
  chunks: ConfigSnapshotChunk[]
}

export type ConfigSnapshotSource = "cache" | "live"

export type ConfigSnapshotResult = ConfigSnapshotState & {
  source: ConfigSnapshotSource
}

// Compatibility exports for the existing /api/agent-config route + UI.
export type ComponentType = ConfigSnapshotComponentType

export type ConfigChunk = {
  component_type: ComponentType
  component_id: string
  content: string
  raw_id: string
  snapshot_at: string
}

export type ConfigSnapshot = {
  chunks: ConfigChunk[]
  snapshot_at: string
  agent_name: string
  error?: string
}

export type TransferNode = {
  id: string
  name: string
}

export type TransferEdge = {
  source: string
  target: string
  forwardCondition: string
  backwardCondition: string
}

export type TransferMap = {
  nodes: TransferNode[]
  edges: TransferEdge[]
}

type JsonRecord = Record<string, unknown>

let snapshotChunksState: ConfigSnapshotChunk[] = []
let snapshotAtState: string | null = null
let snapshotAgentIdState: string | null = null

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const asRecord = (value: unknown): JsonRecord => (isRecord(value) ? value : {})

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry))
}

const sortByLocale = (values: string[]): string[] =>
  [...values].sort((left, right) => left.localeCompare(right))

const uniqueStrings = (values: string[]): string[] =>
  sortByLocale(Array.from(new Set(values)))

const normalizeToolLookupKey = (value: string): string => value.trim().toLowerCase()

const safeStringify = (value: unknown): string => {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const parseJsonBody = (rawBody: string): unknown => {
  if (!rawBody) return {}
  try {
    return JSON.parse(rawBody)
  } catch {
    return rawBody
  }
}

const extractWorkflowNodeToolIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []

  return uniqueStrings(
    value.flatMap((entry) => {
      if (typeof entry === "string") return [entry]
      if (!isRecord(entry)) return []

      const toolId = asString(entry.tool_id)
      const id = asString(entry.id)
      const name = asString(entry.name)

      return [toolId, id, name].filter((candidate): candidate is string =>
        Boolean(candidate)
      )
    })
  )
}

const conditionToText = (value: unknown): string => {
  if (value === null || value === undefined) return "(none)"
  if (typeof value === "string") return value
  if (!isRecord(value)) return safeStringify(value)

  const type = asString(value.type)
  if (!type) return safeStringify(value)

  if (type === "llm") {
    return asString(value.condition) ?? safeStringify(value)
  }

  if (type === "unconditional") {
    return "unconditional"
  }

  if (type === "result") {
    if (typeof value.successful === "boolean") {
      return `successful == ${value.successful}`
    }
    return safeStringify(value)
  }

  if (type === "expression" && value.expression !== undefined) {
    return safeStringify(value.expression)
  }

  return safeStringify(value)
}

const registerToolNodes = (
  registrations: Map<string, Set<string>>,
  displayByNormalizedKey: Map<string, string>,
  toolIds: string[],
  nodeName: string
) => {
  toolIds.forEach((toolId) => {
    const trimmed = toolId.trim()
    if (!trimmed) return

    const normalized = normalizeToolLookupKey(trimmed)
    if (!registrations.has(normalized)) {
      registrations.set(normalized, new Set<string>())
    }
    if (!displayByNormalizedKey.has(normalized)) {
      displayByNormalizedKey.set(normalized, trimmed)
    }
    registrations.get(normalized)?.add(nodeName)
  })
}

const resolveNodeRegistrations = (
  registrations: Map<string, Set<string>>,
  toolLookupKeys: string[]
): string[] => {
  const collectedNodes = new Set<string>()

  toolLookupKeys.forEach((lookupKey) => {
    const normalized = normalizeToolLookupKey(lookupKey)
    registrations.get(normalized)?.forEach((nodeName) => {
      collectedNodes.add(nodeName)
    })
  })

  return sortByLocale(Array.from(collectedNodes))
}

const toSnapshotState = (): ConfigSnapshotState => ({
  agent_id: snapshotAgentIdState,
  snapshot_at: snapshotAtState,
  chunks: [...snapshotChunksState],
})

type SnapshotToolEntry = {
  rawId: string
  name: string
  type: string
  toolConfig: unknown
  lookupKeys: string[]
}

const collectSnapshotChunks = (
  payload: JsonRecord,
  snapshotAt: string
): ConfigSnapshotChunk[] => {
  const chunks: ConfigSnapshotChunk[] = []

  const conversationConfig = asRecord(payload.conversation_config)
  const rootAgentConfig = asRecord(conversationConfig.agent)
  const rootPromptConfig = asRecord(rootAgentConfig.prompt)
  const workflowConfig = asRecord(payload.workflow)
  const workflowNodes = asRecord(workflowConfig.nodes)
  const workflowEdges = asRecord(workflowConfig.edges)
  const rootPromptText = asString(rootPromptConfig.prompt) ?? ""

  const globalConfigContent = {
    llm_selection: {
      llm: asString(rootPromptConfig.llm),
      reasoning_effort: rootPromptConfig.reasoning_effort ?? null,
      thinking_budget: rootPromptConfig.thinking_budget ?? null,
      temperature: rootPromptConfig.temperature ?? null,
      max_tokens: rootPromptConfig.max_tokens ?? null,
      backup_llm_config: rootPromptConfig.backup_llm_config ?? null,
      cascade_timeout_seconds: rootPromptConfig.cascade_timeout_seconds ?? null,
    },
    tts_settings: conversationConfig.tts ?? null,
    turn_config: conversationConfig.turn ?? null,
    conversation_initiation_settings: {
      first_message: asString(rootAgentConfig.first_message) ?? "",
      disable_first_message_interruptions:
        rootAgentConfig.disable_first_message_interruptions ?? null,
      language: asString(rootAgentConfig.language),
    },
  }

  chunks.push({
    component_type: "global_config",
    component_id: "Global Config",
    content: globalConfigContent,
    raw_id: "global_config",
    snapshot_at: snapshotAt,
  })

  chunks.push({
    component_type: "root_prompt",
    component_id: "Root Prompt",
    content: {
      prompt: rootPromptText,
      llm: asString(rootPromptConfig.llm),
      full_prompt_config: rootPromptConfig,
    },
    raw_id: "root_prompt",
    snapshot_at: snapshotAt,
  })

  const nodeIdToName = new Map<string, string>()
  Object.entries(workflowNodes).forEach(([nodeId, nodeValue]) => {
    const nodeRecord = asRecord(nodeValue)
    const nodeName = asString(nodeRecord.label) ?? nodeId
    nodeIdToName.set(nodeId, nodeName)
  })

  const toolRegistrations = new Map<string, Set<string>>()
  const toolDisplayByKey = new Map<string, string>()
  const rootToolIds = asStringArray(rootPromptConfig.tool_ids)
  registerToolNodes(
    toolRegistrations,
    toolDisplayByKey,
    rootToolIds,
    "Root Agent"
  )

  const nodePromptChunks: ConfigSnapshotChunk[] = []
  Object.entries(workflowNodes).forEach(([nodeId, nodeValue]) => {
    const nodeRecord = asRecord(nodeValue)
    const nodeName = nodeIdToName.get(nodeId) ?? nodeId
    const nodeConversationConfig = asRecord(nodeRecord.conversation_config)
    const nodeAgentConfig = asRecord(nodeConversationConfig.agent)
    const nodePromptConfig = asRecord(nodeAgentConfig.prompt)
    const additionalPrompt = asString(nodeRecord.additional_prompt) ?? ""
    const additionalToolIds = asStringArray(nodeRecord.additional_tool_ids)
    const workflowNodeToolIds = extractWorkflowNodeToolIds(nodeRecord.tools)
    const nodeToolList = uniqueStrings([
      ...additionalToolIds,
      ...workflowNodeToolIds,
    ])

    registerToolNodes(
      toolRegistrations,
      toolDisplayByKey,
      nodeToolList,
      nodeName
    )

    nodePromptChunks.push({
      component_type: "node_prompt",
      component_id: nodeName,
      content: {
        node_name: nodeName,
        node_id: nodeId,
        node_type: asString(nodeRecord.type) ?? "unknown",
        additional_prompt: additionalPrompt,
        llm_assignment:
          asString(nodePromptConfig.llm) ?? asString(rootPromptConfig.llm),
        tool_list: nodeToolList,
        node_prompt_config: nodePromptConfig,
      },
      raw_id: nodeId,
      snapshot_at: snapshotAt,
    })
  })

  chunks.push(
    ...nodePromptChunks.sort((left, right) =>
      left.component_id.localeCompare(right.component_id)
    )
  )

  const edgeChunks: ConfigSnapshotChunk[] = []
  Object.entries(workflowEdges).forEach(([edgeId, edgeValue]) => {
    const edgeRecord = asRecord(edgeValue)
    const sourceId = asString(edgeRecord.source) ?? "unknown_source"
    const targetId = asString(edgeRecord.target) ?? "unknown_target"
    const sourceName = nodeIdToName.get(sourceId) ?? sourceId
    const targetName = nodeIdToName.get(targetId) ?? targetId
    const forwardConditionText = conditionToText(edgeRecord.forward_condition)
    const backwardConditionText = conditionToText(edgeRecord.backward_condition)

    edgeChunks.push({
      component_type: "edge_condition",
      component_id: `${sourceName} -> ${targetName}`,
      content: {
        edge_id: edgeId,
        source_node_name: sourceName,
        source_node_id: sourceId,
        target_node_name: targetName,
        target_node_id: targetId,
        forward_condition: forwardConditionText,
        backward_condition: backwardConditionText,
        forward_condition_raw: edgeRecord.forward_condition ?? null,
        backward_condition_raw: edgeRecord.backward_condition ?? null,
      },
      raw_id: edgeId,
      snapshot_at: snapshotAt,
    })
  })

  chunks.push(
    ...edgeChunks.sort((left, right) =>
      left.component_id.localeCompare(right.component_id)
    )
  )

  const toolEntriesById = new Map<string, SnapshotToolEntry>()
  const addToolEntry = (entry: SnapshotToolEntry) => {
    const normalizedEntryId = normalizeToolLookupKey(entry.rawId)
    const existing = toolEntriesById.get(normalizedEntryId)

    if (!existing) {
      toolEntriesById.set(normalizedEntryId, entry)
      return
    }

    const shouldPromoteConfig =
      isRecord(entry.toolConfig) &&
      Object.keys(entry.toolConfig).length > 1 &&
      (!isRecord(existing.toolConfig) ||
        Object.keys(existing.toolConfig).length <= 1)

    if (shouldPromoteConfig) {
      toolEntriesById.set(normalizedEntryId, entry)
    } else {
      existing.lookupKeys = uniqueStrings([
        ...existing.lookupKeys,
        ...entry.lookupKeys,
      ])
    }
  }

  const rootTools = Array.isArray(rootPromptConfig.tools)
    ? rootPromptConfig.tools
    : []

  rootTools.forEach((toolValue, index) => {
    const toolRecord = asRecord(toolValue)
    const rawId =
      asString(toolRecord.tool_id) ??
      asString(toolRecord.id) ??
      asString(toolRecord.name) ??
      `tool_${index + 1}`
    const toolName = asString(toolRecord.name) ?? rawId
    const lookupKeys = uniqueStrings(
      [rawId, toolName, asString(toolRecord.tool_id), asString(toolRecord.id)].filter(
        (candidate): candidate is string => Boolean(candidate)
      )
    )

    addToolEntry({
      rawId,
      name: toolName,
      type: asString(toolRecord.type) ?? "unknown",
      toolConfig: toolRecord,
      lookupKeys,
    })
  })

  rootToolIds.forEach((toolId) => {
    addToolEntry({
      rawId: toolId,
      name: toolId,
      type: "unknown",
      toolConfig: { tool_id: toolId, unresolved: true },
      lookupKeys: [toolId],
    })
  })

  Array.from(toolRegistrations.keys()).forEach((normalizedToolId) => {
    if (toolEntriesById.has(normalizedToolId)) return

    const displayName =
      toolDisplayByKey.get(normalizedToolId) ?? normalizedToolId
    addToolEntry({
      rawId: displayName,
      name: displayName,
      type: "unknown",
      toolConfig: { tool_reference: displayName, unresolved: true },
      lookupKeys: [displayName],
    })
  })

  const toolChunks = Array.from(toolEntriesById.values())
    .map((toolEntry) => {
      const registeredOnNodes = resolveNodeRegistrations(
        toolRegistrations,
        toolEntry.lookupKeys
      )

      return {
        component_type: "tool_schema" as const,
        component_id: toolEntry.name,
        content: {
          tool_name: toolEntry.name,
          tool_type: toolEntry.type,
          registered_on_nodes: registeredOnNodes,
          full_tool_config: toolEntry.toolConfig,
        },
        raw_id: toolEntry.rawId,
        snapshot_at: snapshotAt,
      }
    })
    .sort((left, right) => left.component_id.localeCompare(right.component_id))

  chunks.push(...toolChunks)

  return chunks
}

const fetchAgentConfig = async (
  agentId: string,
  apiKey: string
): Promise<JsonRecord> => {
  const upstreamResponse = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`,
    {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
      },
      cache: "no-store",
    }
  )

  const rawBody = await upstreamResponse.text()
  const parsedBody = parseJsonBody(rawBody)

  if (!upstreamResponse.ok) {
    const details =
      typeof parsedBody === "string"
        ? parsedBody
        : safeStringify(parsedBody) || upstreamResponse.statusText
    throw new Error(
      `Failed to fetch agent config from ElevenLabs (${upstreamResponse.status}): ${details}`
    )
  }

  if (!isRecord(parsedBody)) {
    throw new Error("ElevenLabs returned an unexpected payload for agent config")
  }

  return parsedBody
}

export const hasConfigSnapshot = (): boolean => snapshotChunksState.length > 0

export const getConfigSnapshotState = (): ConfigSnapshotState => toSnapshotState()

export const snapshotAgentConfig = async (options?: {
  agentId?: string
}): Promise<ConfigSnapshotState> => {
  const apiKey = getElevenLabsApiKey()
  const agentId = options?.agentId?.trim() || getElevenLabsAgentId()

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY")
  }

  if (!agentId) {
    throw new Error("Missing NEXT_PUBLIC_ELEVENLABS_AGENT_ID")
  }

  const payload = await fetchAgentConfig(agentId, apiKey)
  const snapshotAt = new Date().toISOString()
  const chunks = collectSnapshotChunks(payload, snapshotAt)

  snapshotChunksState = chunks
  snapshotAtState = snapshotAt
  snapshotAgentIdState = agentId

  return toSnapshotState()
}

export const getOrCreateConfigSnapshot = async (options?: {
  agentId?: string
}): Promise<ConfigSnapshotResult> => {
  const requestedAgentId = options?.agentId?.trim()

  if (
    hasConfigSnapshot() &&
    (!requestedAgentId || requestedAgentId === snapshotAgentIdState)
  ) {
    return {
      ...toSnapshotState(),
      source: "cache",
    }
  }

  const refreshed = await snapshotAgentConfig(options)
  return {
    ...refreshed,
    source: "live",
  }
}

export const clearConfigSnapshotState = () => {
  snapshotChunksState = []
  snapshotAtState = null
  snapshotAgentIdState = null
}

const toLegacyChunk = (chunk: ConfigSnapshotChunk): ConfigChunk => ({
  ...chunk,
  content: safeStringify(chunk.content),
})

export function decomposeAgentConfig(raw: Record<string, unknown>): ConfigChunk[] {
  const payload = asRecord(raw)
  const snapshotAt = new Date().toISOString()
  return collectSnapshotChunks(payload, snapshotAt).map(toLegacyChunk)
}

export function buildTransferMap(chunks: ConfigChunk[]): TransferMap {
  const nodesByName = new Map<string, TransferNode>()
  const edges: TransferEdge[] = []

  chunks
    .filter((chunk) => chunk.component_type === "node_prompt")
    .forEach((chunk) => {
      if (!nodesByName.has(chunk.component_id)) {
        nodesByName.set(chunk.component_id, {
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
          asString(parsed.source_node_name) ??
          asString(parsed.source_node) ??
          "unknown"
        const target =
          asString(parsed.target_node_name) ??
          asString(parsed.target_node) ??
          "unknown"

        if (!nodesByName.has(source)) {
          nodesByName.set(source, {
            id: asString(parsed.source_node_id) ?? source,
            name: source,
          })
        }
        if (!nodesByName.has(target)) {
          nodesByName.set(target, {
            id: asString(parsed.target_node_id) ?? target,
            name: target,
          })
        }

        edges.push({
          source,
          target,
          forwardCondition: asString(parsed.forward_condition) ?? "",
          backwardCondition: asString(parsed.backward_condition) ?? "",
        })
      } catch {
        // Skip malformed legacy chunk payloads.
      }
    })

  return {
    nodes: Array.from(nodesByName.values()),
    edges,
  }
}
