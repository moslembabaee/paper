# React + TypeScript + Vite

## Precision canvas

Hold **Option / Alt** to measure between your selection and another layer. Use the inspector's **Arrange** bar for alignment and equal spacing, arrows to nudge, Cmd/Ctrl + arrows to resize, and brackets to change layer depth. See [precision controls and shortcuts](docs/precision.md).

## Auto layout

Select a frame and click **+** beside **Auto layout**. Choose horizontal or vertical flow, gap, independent padding on each side, main-axis alignment (including space between), and cross-axis alignment. Children follow their layer order; reorder layers to change the flow. Hidden children do not occupy space. Removing auto layout preserves the current positions.

Set each layer's width and height to **Fixed**, **Hug contents**, or **Fill container**. Hug frames wrap their visible children and padding; hug text measures its content and wraps when its width is constrained. Shapes and images hug their current dimensions. Fill siblings divide the remaining main-axis space equally, and fill on the cross axis occupies the parent's content area. Fill inside a hugging parent axis uses the child's intrinsic size to avoid a circular dependency. Fixed children retain their dimensions when space runs out; clipping follows the frame's Clip content setting. A direct resize changes the edited axis to Fixed.

Layout reflows after creation, edits, reordering, reparenting, visibility changes, deletion, and token updates, within the same undo step. Project files retain layout settings, and legacy frames remain freely positioned. Dev mode exports matching flexbox CSS, Tailwind, and React rules. MCP `create_frame` and `update_element` accept `layout` and `sizing`; see [layout types](src/scene/types.ts).

Run `npm test` for layout, history, persistence, and handoff regressions, or `npx playwright test e2e/auto-layout.spec.ts` for the inspector workflow. Headless MCP uses estimated font metrics; the editor measures the loaded browser font and reflows when fonts finish loading.

## Boolean paths

Shift-select two or more rectangles, ellipses, or paths in the same frame, then choose **Union**, **Subtract**, **Intersect**, or **Exclude** in the inspector's Boolean toolbar. Subtract removes the upper layers from the bottom selected layer; Exclude keeps areas covered by an odd number of sources.

Operations create editable compounds by default. Expand a source to edit its geometry, switch the operation, or **Release sources** to restore the layers at the compound's current transform. **Flatten path**, or **Flatten result** before combining, produces a regular path for pen editing. Each action supports undo and redo. Compounds retain their sources in project files and use cached cubic outlines for canvas rendering, shader masks, SVG export, and React handoff.

Source token bindings remain live, including inside nested compounds. Deleting tokens retains resolved geometry and paint; releasing transformed sources detaches changed geometry bindings and preserves color bindings. Geometry is recomputed only for source edits or operation changes, so moving a compound reuses its cached outline.

Run `npm test` for geometry and store regressions, and `npx playwright test e2e/boolean.spec.ts` for toolbar workflows and comparisons with native browser path filling.

## Vector node editing

Double-click an unlocked vector path, or select it and press **Enter**, to edit its subpaths. Click an anchor to select it, **Shift-click** to select more, and drag to move anchors with their handles. Use arrows to nudge by one path unit, or Shift + arrows for ten. Cmd/Ctrl + A selects every anchor; Backspace/Delete removes selected anchors. **Done**, Enter, or Escape leaves editing; Escape during a drag restores its starting geometry.

The node panel edits coordinates, corner radius, and handle types: **Mirrored** shares direction and length, **Asymmetric** shares direction with independent lengths, and **Disconnected** moves handles independently. **Corner** removes handles. Alt-drag disconnects a handle, while Shift constrains dragging. Double-click a node to toggle between corner and mirrored handles.

Double-click an outline edge to insert an anchor without changing its curve, or use **Insert node** for the next segment's midpoint. Corner radii apply to nodes with straight adjacent edges, clamp to available space, and stay editable when reopening a project. Inserting on a rounded subpath converts that subpath's visible outline to cubic anchors; undo restores its radius properties. Boolean compounds must be flattened before node editing. Rendering, shaders, exports, and handoff share the same cached SVG outline.

Run `npm test` for node geometry, persistence, and undo regressions, and `npx playwright test e2e/path-edit.spec.ts` for canvas interaction coverage.

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
