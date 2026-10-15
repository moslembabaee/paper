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

Verification from `app/`:

```sh
node --experimental-strip-types tests/app-project-manifest.test.mjs
npx --no-install playwright test e2e/app-project-manifest.spec.ts
npm test && npm run build
```
