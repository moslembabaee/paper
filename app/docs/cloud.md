# Self-hosted accounts, cloud sync, and remote MCP

Paper remains usable without an account. IndexedDB is the primary database, including during a network outage. Static deployments ship `cloud.json` with `cloud:false` and never request the cloud API. The self-hosted Nginx configuration advertises cloud support.

## Deployment

From the repository root:

```sh
cp .env.example .env
# Set PAPER_SESSION_SECRET to the output of: openssl rand -hex 32
# Set PAPER_PUBLIC_URL to your externally reachable origin, e.g. https://paper.example.com
# Add the OAuth client IDs/secrets for one or both providers.
docker compose up -d --build --wait
```

Keep `PAPER_SESSION_SECRET` stable and private. It encrypts the recoverable MCP token at rest. An empty or short secret prevents startup. Use HTTPS for public deployments: cookies are marked Secure when `PAPER_PUBLIC_URL` starts with `https:`. Terminate TLS at your existing reverse proxy; forward `/`, `/api/`, and `/mcp` to Paper's port 3000. The API service is exposed only on the Docker network.

Register OAuth applications using the provider instructions for [Google](https://developers.google.com/identity/protocols/oauth2/web-server) and [GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps). Set their callback URLs to:

- Google: `https://paper.example.com/api/auth/google/callback`
- GitHub: `https://paper.example.com/api/auth/github/callback`

The backend exchanges authorization codes with PKCE, binds single-use state to an HttpOnly cookie, and uses verified provider identities. Different providers remain separate accounts even if they share an email address. OAuth provider access tokens are never persisted or exposed to the client.

`paper_projects` persists `/data/auth.json` and `/data/projects/<user_id>/<project_id>.paper.json`. Each project file contains a document envelope with the Paper document, revision, and timestamps. Back up the entire volume and the session secret. Run one API service against a volume: comparison/write locks are per process, not a distributed database.

`auto_deploy.sh` builds both images, validates configuration, and waits for both services to become healthy before marking a commit deployed.

## Workspace and conflict handling

Sign in from **Profile & account**. Paper offers to sync existing guest projects; choosing **Keep local for now** leaves them on the device. Return to account settings to upload later. Projects created while signed in automatically sync. Cached projects owned by another account are never uploaded to the current account.

Local edits save to IndexedDB first and upload after a debounce. Remote edits arrive through an account-scoped SSE stream and a periodic reconciliation. All project lists and documents come from the current session's account. A network outage retains pending local edits and resumes reconciliation on reconnect or focus.

Writes compare an expected SHA-256 revision before replacement. On a conflict, the client deterministically chooses the later `updatedAt` timestamp, breaking exact ties with the lexicographically larger canonical document hash. Timestamps more than a minute ahead of server time are rejected. Concurrent edits resolve at the document level, so this is not a collaborative merge or CRDT; the losing document's edits are superseded. Canvas changes during a pending pull defer the pull, and IndexedDB updates compare the document in a transaction before replacing it.

## Remote agents

Generate a **Remote MCP token** in account settings. Reveal and copy it there. Regeneration immediately revokes the previous token; changing local preferences never changes remote credentials.

Connect a client supporting [MCP Streamable HTTP](https://ts.sdk.modelcontextprotocol.io/server) to:

```json
{
  "url": "https://paper.example.com/mcp",
  "headers": { "Authorization": "Bearer paper_<your-private-token>" }
}
```

Client configuration shapes vary. The endpoint uses stateless Streamable HTTP with JSON responses (protocol revisions 2025-03-26, 2025-06-18, and 2025-11-25). POST requests accept `application/json, text/event-stream`; GET returns 405 as permitted for servers without an MCP SSE notification stream. Browser update notifications use the separate session-authenticated `/api/events` SSE stream.

Call `list_projects`, then supply `project_id` to the standard Paper tools: `get_basic_info`, `get_canvas_elements`, `create_frame`, `update_element`, `list_tokens`, `create_token`, `add_shader_shape`, and `export_selection`. For mutations, pass `expected_revision` from the last read to guard against stale edits. `create_frame` can create a new project using a new ID. Remote tools never accept filesystem paths or export paths.

The gateway always edits the persisted project; an active editor receives the new revision and glowing agent outlines. Closed tabs are not required for tool execution. Reopening or switching to the project downloads agent edits during reconciliation. JSON preserves shaders; SVG shader export still needs explicit browser-captured shader snapshots.

The file-backed `mcp-server/bin/paper-mcp.mjs` stdio workflow is unchanged. A production UI can still connect to the separately running local bridge by setting `VITE_PAPER_BRIDGE_URL` at build time.

## Development and verification

The Fastify deployment dependency is isolated in `app/server/package.json`. The backend compiles with the app, while the reusable HTTP handler can be tested without binding sockets or installing Fastify.

```sh
cd app
npm run build
npm run test:cloud
npm test
npm run test:mcp
npm run test:e2e -- e2e/cloud.spec.ts e2e/workspace.spec.ts
```

For live development, install backend dependencies and run the service:

```sh
cd app/server
npm install
cd ..
npm run build:server
PAPER_SESSION_SECRET=<stable-secret> PAPER_DATA_DIR=/tmp/paper-cloud \
PAPER_PUBLIC_URL=http://localhost:5173 npm run dev:server
```

In another terminal run `PAPER_API_URL=http://localhost:3001 npm run dev`. Add OAuth provider credentials to the backend environment when testing actual provider sign-in. The Vite proxy advertises cloud capability only when `PAPER_API_URL` is set.
