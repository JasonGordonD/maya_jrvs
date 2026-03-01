export type ComponentType =
  | "root_prompt"
  | "global_config"
  | "node_prompt"
  | "edge_condition"
  | "tool_schema"

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

// ---------------------------------------------------------------------------
// Helpers for safe deep access
// ---------------------------------------------------------------------------

const str = (v: unknown): string =>
  typeof v === "string" ? v : v != null ? JSON.stringify(v) : ""

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const jsonPretty = (v: unknown): string => {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

// ---------------------------------------------------------------------------
// Decompose the raw API payload into typed chunks
// ---------------------------------------------------------------------------

export function decomposeAgentConfig(
  raw: Record<string, unknown>
): ConfigChunk[] {
  const now = new Date().toISOString()
  const chunks: ConfigChunk[] = []

  const convConfig = obj(raw.conversation_config)
  const agentSection = obj(convConfig.agent)
  const promptSection = obj(agentSection.prompt)

  // ---- root_prompt ----
  const rootPromptText = str(promptSection.prompt)
  if (rootPromptText) {
    chunks.push({
      component_type: "root_prompt",
      component_id: "Root Prompt",
      content: rootPromptText,
      raw_id: str(raw.agent_id),
      snapshot_at: now,
    })
  }

  // ---- global_config ----
  const globalConfig: Record<string, unknown> = {}
  if (promptSection.llm) globalConfig.llm = promptSection.llm
  if (promptSection.temperature != null)
    globalConfig.temperature = promptSection.temperature
  if (promptSection.max_tokens != null)
    globalConfig.max_tokens = promptSection.max_tokens

  const tts = convConfig.tts
  if (tts) globalConfig.tts = tts

  const turn = convConfig.turn
  if (turn) globalConfig.turn = turn

  const conversation = convConfig.conversation
  if (conversation) globalConfig.conversation = conversation

  const asr = convConfig.asr
  if (asr) globalConfig.asr = asr

  if (agentSection.first_message)
    globalConfig.first_message = agentSection.first_message
  if (agentSection.language) globalConfig.language = agentSection.language

  const languagePresets = convConfig.language_presets
  if (languagePresets) globalConfig.language_presets = languagePresets

  if (Object.keys(globalConfig).length > 0) {
    chunks.push({
      component_type: "global_config",
      component_id: "Global Config",
      content: jsonPretty(globalConfig),
      raw_id: str(raw.agent_id),
      snapshot_at: now,
    })
  }

  // ---- Locate nodes and edges (multi-node / workflow agents) ----
  const workflow = obj(
    raw.workflow ??
      raw.prompt_agent ??
      raw.agent_graph ??
      raw.graph ??
      convConfig.workflow ??
      agentSection.workflow ??
      agentSection.graph
  )

  const rawNodes = arr(
    workflow.nodes ??
      workflow.steps ??
      raw.nodes ??
      agentSection.nodes
  )

  const rawEdges = arr(
    workflow.edges ??
      workflow.transitions ??
      raw.edges ??
      agentSection.edges
  )

  const nodeIdToName = new Map<string, string>()
  const nodeToolMap = new Map<string, string[]>()

  // ---- node_prompt ----
  for (const rawNode of rawNodes) {
    const node = obj(rawNode)
    const nodeId =
      str(node.node_id) || str(node.id) || str(node.step_id) || ""
    const nodeName =
      str(node.name) || str(node.label) || str(node.title) || nodeId
    const nodePromptObj = obj(node.prompt ?? node.config ?? node.agent)
    const additionalPrompt =
      str(nodePromptObj.prompt) ||
      str(nodePromptObj.additional_prompt) ||
      str(nodePromptObj.system_prompt) ||
      str(node.prompt)
    const nodeLlm = str(nodePromptObj.llm) || str(node.llm) || ""
    const nodeTools = arr(
      nodePromptObj.tools ?? node.tools ?? nodePromptObj.tool_ids ?? node.tool_ids
    )

    nodeIdToName.set(nodeId, nodeName)

    const toolNames = nodeTools.map((t) => {
      const to = obj(t)
      return str(to.name) || str(to.tool_name) || str(to.id) || str(t)
    })
    if (toolNames.length > 0) nodeToolMap.set(nodeId, toolNames)

    const content: Record<string, unknown> = {
      node_name: nodeName,
      node_id: nodeId,
    }
    if (additionalPrompt) content.additional_prompt = additionalPrompt
    if (nodeLlm) content.llm = nodeLlm
    if (node.type) content.type = node.type
    if (nodeTools.length > 0) content.tools = toolNames

    chunks.push({
      component_type: "node_prompt",
      component_id: nodeName,
      content: jsonPretty(content),
      raw_id: nodeId,
      snapshot_at: now,
    })
  }

  // ---- edge_condition ----
  for (const rawEdge of rawEdges) {
    const edge = obj(rawEdge)
    const edgeId =
      str(edge.edge_id) || str(edge.id) || str(edge.transition_id) || ""
    const sourceId =
      str(edge.source_node_id) ||
      str(edge.source) ||
      str(edge.from) ||
      str(edge.from_node_id) ||
      ""
    const targetId =
      str(edge.target_node_id) ||
      str(edge.target) ||
      str(edge.to) ||
      str(edge.to_node_id) ||
      ""
    const sourceName = nodeIdToName.get(sourceId) || sourceId || "unknown"
    const targetName = nodeIdToName.get(targetId) || targetId || "unknown"

    const forwardCondition =
      str(edge.forward_condition) ||
      str(edge.condition) ||
      str(edge.description) ||
      ""
    const backwardCondition =
      str(edge.backward_condition) ||
      str(edge.reverse_condition) ||
      ""

    const content: Record<string, unknown> = {
      edge_id: edgeId,
      source_node: sourceName,
      source_node_id: sourceId,
      target_node: targetName,
      target_node_id: targetId,
    }
    if (forwardCondition) content.forward_condition = forwardCondition
    if (backwardCondition) content.backward_condition = backwardCondition

    chunks.push({
      component_type: "edge_condition",
      component_id: `${sourceName} -> ${targetName}`,
      content: jsonPretty(content),
      raw_id: edgeId,
      snapshot_at: now,
    })
  }

  // ---- tool_schema ----
  const rootTools = arr(promptSection.tools)
  const allToolIds = new Set<string>()

  const processToolList = (
    tools: unknown[],
    registeredOn: string
  ) => {
    for (const rawTool of tools) {
      const tool = obj(rawTool)
      const toolId =
        str(tool.id) || str(tool.tool_id) || str(tool.name) || ""
      const toolName = str(tool.name) || str(tool.tool_name) || toolId
      const toolType =
        str(tool.type) || str(tool.tool_type) || "unknown"

      const dedupeKey = `${toolName}:${toolId}`
      if (allToolIds.has(dedupeKey)) continue
      allToolIds.add(dedupeKey)

      const registeredNodes: string[] = [registeredOn]
      for (const [nid, tnames] of nodeToolMap.entries()) {
        const nname = nodeIdToName.get(nid) || nid
        if (nname === registeredOn) continue
        if (tnames.includes(toolName) || tnames.includes(toolId)) {
          registeredNodes.push(nname)
        }
      }

      const content: Record<string, unknown> = {
        tool_name: toolName,
        tool_type: toolType,
        registered_on: registeredNodes,
      }
      const configKeys = Object.keys(tool).filter(
        (k) =>
          !["id", "tool_id", "name", "tool_name", "type", "tool_type"].includes(
            k
          )
      )
      for (const key of configKeys) {
        content[key] = tool[key]
      }

      chunks.push({
        component_type: "tool_schema",
        component_id: toolName,
        content: jsonPretty(content),
        raw_id: toolId,
        snapshot_at: now,
      })
    }
  }

  if (rootTools.length > 0) processToolList(rootTools, "Root")

  for (const rawNode of rawNodes) {
    const node = obj(rawNode)
    const nodeId = str(node.node_id) || str(node.id) || ""
    const nodeName = nodeIdToName.get(nodeId) || nodeId
    const nodePromptObj = obj(node.prompt ?? node.config ?? node.agent)
    const nodeTools = arr(
      nodePromptObj.tools ?? node.tools
    )
    if (nodeTools.length > 0) processToolList(nodeTools, nodeName)
  }

  // If no nodes/edges/tools were found, include the full raw config as a fallback
  const hasStructuredContent = chunks.some(
    (c) =>
      c.component_type === "node_prompt" ||
      c.component_type === "edge_condition" ||
      c.component_type === "tool_schema"
  )

  if (!hasStructuredContent && Object.keys(raw).length > 0) {
    const excluded = new Set([
      "conversation_config",
      "agent_id",
      "name",
    ])
    const extra: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (!excluded.has(k) && v != null) extra[k] = v
    }
    if (Object.keys(extra).length > 0) {
      chunks.push({
        component_type: "global_config",
        component_id: "Additional Config",
        content: jsonPretty(extra),
        raw_id: str(raw.agent_id),
        snapshot_at: now,
      })
    }
  }

  return chunks
}

// ---------------------------------------------------------------------------
// Build a node-to-node transfer map from edge chunks
// ---------------------------------------------------------------------------

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

export function buildTransferMap(chunks: ConfigChunk[]): TransferMap {
  const nodeChunks = chunks.filter((c) => c.component_type === "node_prompt")
  const edgeChunks = chunks.filter((c) => c.component_type === "edge_condition")

  const nodeNames = new Set<string>()
  const nodes: TransferNode[] = []

  for (const chunk of nodeChunks) {
    if (!nodeNames.has(chunk.component_id)) {
      nodeNames.add(chunk.component_id)
      nodes.push({ id: chunk.raw_id, name: chunk.component_id })
    }
  }

  const edges: TransferEdge[] = []
  for (const chunk of edgeChunks) {
    try {
      const parsed = JSON.parse(chunk.content)
      const source = parsed.source_node || "unknown"
      const target = parsed.target_node || "unknown"

      for (const name of [source, target]) {
        if (!nodeNames.has(name)) {
          nodeNames.add(name)
          nodes.push({
            id: parsed[name === source ? "source_node_id" : "target_node_id"] || name,
            name,
          })
        }
      }

      edges.push({
        source,
        target,
        forwardCondition: parsed.forward_condition || "",
        backwardCondition: parsed.backward_condition || "",
      })
    } catch {
      // skip malformed edge chunks
    }
  }

  return { nodes, edges }
}
