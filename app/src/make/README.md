# App project manifest

`AppProject` is the `paper-app` v1 manifest for Paper Make. It is separate from
`paper` scene documents and contains only a reference to a scene snapshot; importing
an app never loads or changes a scene. Import the public API from `make/index.ts`.

- `createAppProject(input)` creates a complete v1 manifest with defaults for omitted
  settings, a starter file, revision 1, draft release and idle preview.
- `validateAppProject(unknown)` validates a complete v1 object and returns a detached,
  canonical copy. Required fields are not supplied by the validator.
- `parseAppProject(json)` also rejects duplicate JSON keys, including escaped keys.
- `serializeAppProject(project)` validates before serialization. Every accepted
  manifest fits the import budget after JSON escaping and formatting.
- `migrateAppProject(unknown)` explicitly upgrades unversioned/v0 app drafts. v1 is
  validated unchanged; scenes, foreign formats and future versions are rejected.
  Parse legacy JSON with `parseJsonStrict` first to preserve duplicate-key checks.

V0 supports file arrays (`{ path, content }`) or maps of strings/file records and
flat `projectId`, `sceneId`, `frameId`, `sceneRevision` references. Root source files
such as `App.tsx` move to `src/`; `package.json`, `tsconfig.json`, `README.md` and
`index.html` stay at the root. Preview entry points follow the same rule. Colliding
paths or ambiguous scene references reject the entire migration. Existing metadata
is preserved; only omitted values receive defaults. Source modules are stored as
text and are never evaluated by this module.

The v1 schema requires `format`, `version`, `id`, `name`, `revision`,
`sceneReference` (nullable), `files`, `assetIds`, `release`, `preview`, `createdAt`
and `updatedAt`. Only `description` is optional. Nested types in `types.ts` list
all permitted fields. Unknown fields and incorrect types reject rather than being
silently dropped or coerced. Revisions are positive safe integers; timestamps use
UTC ISO strings (`YYYY-MM-DDTHH:mm:ss.sssZ`); release URLs use HTTP(S) without
credentials. Release metadata describes a release; it does not publish anything.

Limits are inclusive: 100 files, 512 KiB UTF-8 per file, 2 MiB total source,
100 unique asset IDs, 128 characters per ID, 200 per name, 256 per path, and
4 MiB UTF-8 for both imported JSON and canonical serialized JSON. Description,
release notes and preview errors allow 16,384 characters; release channels and
URLs allow 2,048. Object/JSON nesting is bounded to 16 levels. Paths are relative
POSIX paths; one leading `./` is normalized. Traversal, encoded paths, absolute
paths, controls, Windows aliases/reserved names, forbidden prototype segments and
normalized duplicates reject. Object inputs must contain plain enumerable data
properties and dense arrays, without accessors, cycles or prototype keys.

Validation/migration builds an isolated result and returns only after all checks
pass. Callers must replace their stored manifest only after successful validation;
a thrown `AppProjectValidationError` must never be used as permission to fall back
to a permissive import.

## Account-scoped artifact storage

`AppStorage` (`server/app-storage.ts`, re-exported from `server/storage.ts`) persists
app artifacts under `apps/<userId>/<appId>/`:

- `manifest.json`: Canonical `AppProject` manifest and the sole publication point.
- `revisions/<revision>/files/`: Immutable materialized source files for that revision.
- `revisions/<revision>/record.json`: Immutable revision number, SHA-256 manifest hash,
  timestamp, and complete project snapshot. Reads verify the record's identity and hash.

Confinement and safety guarantees:

- **Atomic publication**: A writer stages a complete snapshot in `.staging_<uuid>/`
  inside the app, syncs files and directories, installs the snapshot, then atomically
  replaces the manifest. The live app directory is never moved. A directory-sync
  failure after publication rolls back the prior manifest. A crash leaves either
  the old or new complete revision. Unpublished snapshots are hidden from readers
  and reclaimed by the next writer holding that app's lock; readers never clean
  another operation's staging tree.
- **Optimistic revision check**: Updates require matching `expectedRevision` (`null` for new
  apps; positive integer matching current revision for updates). Stale writes reject
  with `409 Revision conflict` and include `{ current }`. Invalid revision tokens
  reject with `400`. As with scene storage, one service process owns the volume;
  concurrent writes serialize per volume/account/app across all store instances
  in that process. Multiple independent writer processes are unsupported.
- **Account isolation & symlink confinement**: Account and app directories, manifests,
  every intermediate artifact directory, and files reject symbolic links with `403`.
  Reads require bounded regular files opened with `O_NOFOLLOW` and `O_NONBLOCK`.
  Traversals (`..`, absolute paths, encoded slashes, control characters) reject with `400` or validation errors. Accounts
  cannot read, overwrite, list or delete another user's artifacts.
- **Strict input validation**: v1 manifests keep the strict schema from Make 01;
  storage does not drop unknown file fields, collapse duplicate legacy paths, or
  execute accessors. Only explicit legacy drafts go through migration. The account
  ID must come from authenticated server context, never an untrusted request body.

Verification from `app/`:

```sh
node --experimental-strip-types tests/app-project-manifest.test.mjs
node --experimental-strip-types tests/app-storage.test.mjs
npx --no-install playwright test e2e/app-project-manifest.spec.ts
npm test && npm run build
```
