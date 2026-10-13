# React + TypeScript + Vite

## Precision canvas

Hold **Option / Alt** to measure between your selection and another layer. Use the inspector's **Arrange** bar for alignment and equal spacing, arrows to nudge, Cmd/Ctrl + arrows to resize, and brackets to change layer depth. See [precision controls and shortcuts](docs/precision.md).

## Boolean paths

Shift-select two or more rectangles, ellipses, or paths in the same frame, then choose **Union**, **Subtract**, **Intersect**, or **Exclude** in the inspector's Boolean toolbar. Subtract removes the upper layers from the bottom selected layer; Exclude keeps areas covered by an odd number of sources.

Operations create editable compounds by default. Expand a source to edit its geometry, switch the operation, or **Release sources** to restore the layers at the compound's current transform. **Flatten path**, or **Flatten result** before combining, produces a regular path for pen editing. Each action supports undo and redo. Compounds retain their sources in project files and use cached cubic outlines for canvas rendering, shader masks, SVG export, and React handoff.

Source token bindings remain live, including inside nested compounds. Deleting tokens retains resolved geometry and paint; releasing transformed sources detaches changed geometry bindings and preserves color bindings. Geometry is recomputed only for source edits or operation changes, so moving a compound reuses its cached outline.

Run `npm test` for geometry and store regressions, and `npx playwright test e2e/boolean.spec.ts` for toolbar workflows and comparisons with native browser path filling.

## Community roadmap

Open **Roadmap** in the editor footer for live development tasks, completed features, progress, and search. Development reads the repository roadmap; production builds ship a public snapshot. See [feed format and self-hosted update instructions](docs/roadmap.md).

## Paper native MCP server

`npm run build` also compiles the Paper MCP server. By default, stdio tools connect to the focused live browser editor through the localhost HTTP bridge; agent changes appear immediately, glow on the canvas, and support undo. Same-project tabs synchronize through BroadcastChannel. Tools include `get_basic_info`, `list_tokens`, `create_token`, `get_canvas_elements`, `create_frame`, `add_shader_shape`, `update_element`, and `export_selection`. Explicit `--file` mode supports offline `.paper.json` edits. See [live connection instructions and synchronization behavior](docs/live-mcp.md). Run `npm run test:mcp` to verify the protocol and file workflows.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
