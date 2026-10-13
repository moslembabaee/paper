# Live Paper MCP

Agents operate on the most recently focused Paper editor. Mutations appear immediately in the canvas, enter its undo history, and use the existing IndexedDB autosave. Human selection stays in place. Recently affected layers glow in Paper blue; focused reads also show agent activity. Same-origin tabs of the same project synchronize through BroadcastChannel. Other projects stay separate.

## Connect

Requires Node.js 22+. From `app`, run `npm run build`, then `npm run dev` or `npm run preview`. Both start the localhost bridge at `http://127.0.0.1:29979`; the editor header shows **MCP live** when registered. Configure an agent's stdio MCP server:

```json
{
  "mcpServers": {
    "paper": {
      "command": "node",
      "args": ["/root/projects/paper/mcp-server/bin/paper-mcp.mjs"]
    }
  }
}
```

Replace the absolute path for your installation. Agents that support MCP over HTTP can instead connect directly to `http://127.0.0.1:29979/mcp`. Initialize a session and retain its `MCP-Session-Id` header. Stdio discovery works before the editor opens; canvas tools return a useful error until an editor connects.

For a static build, start `npm run bridge` on the machine running the browser. The editor tries its own server, then the local bridge. Set `VITE_PAPER_BRIDGE_URL` at build time to override the bridge base URL, or `PAPER_BRIDGE_PORT` when starting the standalone bridge to override port 29979. Browser policies may require permission to reach localhost from a hosted page. The bridge accepts only loopback connections and loopback web origins; run Paper on localhost for this setup.

Vite also serves `/mcp` on its own port. If 29979 is occupied, use `--live http://127.0.0.1:5173` in the stdio arguments (substitute your Vite port), or set `PAPER_BRIDGE_URL` for the stdio process. Existing offline workflows remain available with explicit `--workspace /path/to/designs --file study.paper.json`; file-backed edits remain independent of live projects.

## Tools

| Tool | Behavior |
| --- | --- |
| `get_basic_info` | Active project ID, file name, top-level artboards, node count, human selection, grid size, and revision |
| `get_canvas_elements` | Current scene, hierarchy, tokens and project settings; optional `element_ids` includes descendants |
| `create_frame` | Creates an undoable frame in the active scene |
| `update_element` | Validates and applies an atomic patch, including reparenting or reordering |
| `add_shader_shape` | Creates a native shader rectangle or ellipse |
| `list_tokens` | Lists design tokens, optionally filtered by `type` |
| `create_token` | Creates an undoable token with a unique lowercase kebab-case name and a value matching its type |
| `export_selection` | Returns JSON or SVG inline; live mode does not write disk files |

Call `get_basic_info` to verify the active project before editing. Pass the returned opaque `revision` as `expected_revision` on mutations. Human document edits and tab synchronization advance revisions; selecting layers and reading artwork do not. Live tools reject `file`; explicit offline mode is required to address a disk file.

Example arguments:

```json
{"id":"hero","name":"Hero","x":120,"y":240,"expected_revision":"<last revision>"}
```

```json
{"name":"agent-blue","type":"color","value":"#81adec","expected_revision":"<last revision>"}
```

## Synchronization and recovery

The browser is authoritative. The HTTP endpoint holds an editor request open and delivers agent calls as soon as they arrive, with no periodic request latency. Replies contain the actual browser result. Reconnects use bounded requests and automatic retries; mutating tool calls are never automatically replayed after an uncertain reply. If a tool times out, read the scene before retrying. Closing or switching a project rejects pending requests addressed to that editor.

Tab synchronization uses project-scoped snapshots with deterministic logical-clock ordering. It batches document serialization after gestures, preserves each tab's own camera and selection, and defers incoming snapshots while a gesture is active. Concurrent edits use the newest ordered snapshot; this is not a collaborative text-style merge of simultaneous edits. Use one active editing tab for conflicting changes to the same project. Activity messages travel separately, so reads do not replace artwork or add undo entries. Indicators expire after 2.6 seconds without another agent call.

Checks: `npm run build`, `npm test`, `npm run test:mcp`, and `npm run test:e2e -- e2e/live-mcp.spec.ts`. Unit tests exercise the real BroadcastChannel and HTTP middleware without opening sockets; browser tests cover live canvas push, outline alignment, shader rendering, undo, autosave, focus routing and project isolation.
