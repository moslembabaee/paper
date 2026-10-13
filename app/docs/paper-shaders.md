# Paper Shaders

Select a layer and choose an effect in **Paper Shaders** in the inspector. Open **FX studio** (or press **S**) to browse materials, tune a live rectangle or ellipse swatch, and compare against the base paint. Changes in the studio are staged until **Apply shader**; Cancel leaves the document unchanged. Deselect all layers to edit the canvas background. The material study's circle starts with a Mesh Gradient fill.

Supported effects are Mesh Gradient, Dot Orbit, Grain Gradient, Halftone CMYK, Neuro Noise, Gooey (Paper's Metaballs), Dithering, **Perlin Noise**, **Liquid Distortion**, and **Glass Refraction**. Colors, palettes, effect-specific parameters, scale, rotation, and offsets update live. **Static** stops animation, and **Frame · ms** chooses a repeatable snapshot. **Animated** uses the stored frame as its starting point. Reset restores the effect's defaults; removing the effect reveals the layer's existing paint.

Perlin Noise exposes octave count, roughness, frequency step, distribution, and softness. Liquid Distortion uses Paper's Warp shader to distort checks, stripes, or a split edge with noise and layered swirls. Glass Refraction uses Paper's FlutedGlass image filter, with prism/lens/contour/cascade/flat refraction, glass pattern, rib angle, strength, texture shift, frosting, lighting, margins, and grain. Glass samples the configured source image; an image layer supplies its own source by default. It does not sample live layers behind the shape. See Paper's [Perlin Noise](https://shaders.paper.design/perlin-noise), [Warp](https://shaders.paper.design/warp), and [Fluted Glass](https://shaders.paper.design/fluted-glass) references.

**Compositing** offers 16 blend modes and material opacity independently of layer opacity. The material blends over the layer's existing solid fill or image, isolated inside its shape mask. Layer opacity and effects then apply to the composed result; strokes and frame children remain above it. The studio's engineering grid uses a 120px interval. Pointer drags in the canvas inspector create one undo checkpoint per slider gesture.

Shader fills follow rectangles' corner radii, ellipses, SVG path geometry and fill rules, and text masks. Frame fills sit below their children and respect rounded corners even when content clipping is disabled. Strokes, shadows, layer opacity, parent transforms, and selection continue to work. Image layers can use their own source as the Halftone input. A bundled SVG provides a local source for other Halftone fills. External source images need to allow cross-origin image loading.

## Document format

`ElementStyle.shader` stores a discriminated `ShaderPaint` record; `SceneDocument.backgroundShader` stores the canvas effect. Both are optional in version 1 documents, so earlier scenes still load. `ShaderPaint.composite` is optional, with `{ blendMode, opacity }`; omitted values retain normal blending and full material opacity. The store validates shader kinds, parameter types and ranges, integer iteration counts, colors, source URLs, palettes, and compositing before publishing state. Records, composite settings, and palette arrays are frozen, and serialization preserves parameters and animation settings. The MCP schema includes all new materials and optional compositing settings.

SVG exports clip the shader snapshot and base paint together, preserving blend mode and material opacity. PNG/PDF exports use that composed SVG. JSON exports preserve the editable uniforms and settings.

## Rendering

The shader engine is loaded separately from the editor. Paper's WebGL2 components render at animation-frame cadence without React state changes per frame. CMYK and FlutedGlass are static image filters in the package. Their animated modes drive uniforms directly: a gentle three-degree rotation drift for CMYK, and a small texture shift for glass. Their phase is also controlled by the stored frame. Image loading handles cross-origin sources, source changes, and failed-image fallbacks for both filters.

Shader rendering is limited to 1.5 million pixels per surface. Offscreen surfaces release their WebGL resources and restart from their stored frame when visible. Hidden documents and reduced-motion preferences use a static frame. Missing WebGL support, context loss, or failed Halftone images show a CSS fallback; changing a failed source retries loading. Actual animation performance depends on the GPU and the number of visible shader layers.

## Checks

```sh
npm run build
npm test
npm run lint
```

`tests/shaders.test.mjs` checks all effects on all element kinds and the background, static-frame serialization, immutable palettes and composites, atomic validation, legacy document loading, image sources, undo/redo, and SVG compositing. `e2e/fx-studio.spec.ts` checks actual WebGL pixel output, uniform updates without canvas replacement, studio previews and applying staged settings, blend controls, and recovery from failed glass images.
