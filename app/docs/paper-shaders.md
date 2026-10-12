# Paper Shaders

Select a layer and choose an effect in **Paper Shaders** in the inspector. Deselect all layers to edit the canvas background. The material study's circle starts with a Mesh Gradient fill.

Supported effects are Mesh Gradient, Dot Orbit, Grain Gradient, Halftone CMYK, Neuro Noise, Gooey (Paper's Metaballs), and Dithering. Colors, palettes, effect-specific parameters, scale, rotation, and offsets update live. **Static** stops animation, and **Frame · ms** chooses a repeatable snapshot. **Animated** uses the stored frame as its starting point. Reset restores the effect's defaults; removing the effect reveals the layer's existing paint.

Shader fills follow rectangles' corner radii, ellipses, SVG path geometry and fill rules, and text masks. Frame fills sit below their children and respect rounded corners even when content clipping is disabled. Strokes, shadows, layer opacity, parent transforms, and selection continue to work. Image layers can use their own source as the Halftone input. A bundled SVG provides a local source for other Halftone fills. External source images need to allow cross-origin image loading.

## Document format

`ElementStyle.shader` stores a discriminated `ShaderPaint` record; `SceneDocument.backgroundShader` stores the canvas effect. Both are optional in version 1 documents, so earlier scenes still load. The store validates shader kinds, parameter types and ranges, colors, source URLs, and palettes before publishing state. Records and palette arrays are frozen, and serialization preserves parameters and animation settings.

## Rendering

The shader engine is loaded separately from the editor. Paper's WebGL2 components render at animation-frame cadence without React state changes per frame. CMYK is a static image filter in the package, so its animated mode adds a gentle three-degree rotation drift through the engine's uniform API. Its phase is also controlled by the stored frame.

Shader rendering is limited to 1.5 million pixels per surface. Offscreen surfaces release their WebGL resources and restart from their stored frame when visible. Hidden documents and reduced-motion preferences use a static frame. Missing WebGL support, context loss, or failed Halftone images show a CSS fallback; changing a failed source retries loading. Actual animation performance depends on the GPU and the number of visible shader layers.

## Checks

```sh
npm run build
npm test
npm run lint
```

`tests/shaders.test.mjs` checks all effects on all element kinds and the background, static-frame serialization, immutable palettes, atomic rejection of invalid data, preservation of existing styling, and legacy document loading.
