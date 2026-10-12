# Export, import, and local projects

Use **Export** in the header to download the selection or the whole canvas as SVG or PNG. PNG supports 1×, 2× (Retina), 3×, and 4× output, independently of the editor zoom. Choose a transparent background or Paper cream. Selected frames export at their artboard size; the whole canvas covers visible artwork. Rulers, grid, selection handles, labels, and editor chrome are excluded.

SVG uses native geometry and text, with nested frame transforms, clipping, opacity, strokes, shadows, and rounded corners. Images are embedded. Shader fills are rendered at their saved static frame and embedded as PNG snapshots, including offscreen shader layers. WebGL 2 is required to export shaders. Text remains text and uses the system fonts available in the exporting browser; viewing an SVG elsewhere requires the same fonts. PNG output is limited to 64 megapixels and 16,384 pixels per side.

**Save project JSON**, the JSON export tab, or **⌘/Ctrl S** downloads a versioned `.paper.json` file with every layer, frame hierarchy, shader parameters, project name, camera, and grid preference. **Open or import file** opens Paper project JSON (including legacy scene JSON). SVG and HTML files are inserted into the current document. Project JSON preserves image source URLs; external images must remain accessible when reopening it.

Changes are saved locally after a short idle period, and restored on reload. The browser's local storage is a convenience copy; download JSON for a portable backup. If storage fills up or is unavailable, the header asks you to save JSON.

Paste with **⌘/Ctrl V** while working on the canvas:

- **SVG:** SVG markup, SVG clipboard data, or an SVG file is inserted as a vector-backed image layer. Paths, transforms, gradients, masks, and local references remain scalable. SVG internals are not separate editable Paper layers.
- **Figma:** use **Copy as SVG** in Figma, then paste into Paper. Figma's private binary clipboard format and `.fig` files are not supported.
- **HTML:** HTML clipboard fragments or raw HTML markup become an editable frame containing rectangle, text, and embedded raster-image layers. Layout is measured in an isolated, script-free document. Inline layout styles, solid backgrounds, borders, corner radii, opacity, and typography are supported. External stylesheets, CSS classes, gradients, complex effects, and remote HTML images are not imported.

Pasted artwork is centered in the visible canvas and selected as one import. Ordinary text input fields retain their native paste behavior. SVG scripts, event handlers, foreign objects, animation, external resource references, and HTML executable content are stripped. Files are limited to 16 MB; malformed documents are rejected before they change the current scene.
