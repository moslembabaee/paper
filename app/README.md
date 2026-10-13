# React + TypeScript + Vite

## Precision canvas

Hold **Option / Alt** to measure between your selection and another layer. Use the inspector's **Arrange** bar for alignment and equal spacing, arrows to nudge, Cmd/Ctrl + arrows to resize, and brackets to change layer depth. See [precision controls and shortcuts](docs/precision.md).

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
