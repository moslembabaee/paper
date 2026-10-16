/** Authored for Paper's ShaderMount. GPU fragment shader accelerated 2D mesh gradient and procedural color field synthesizer. */
export const meshFragmentShader = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
// ShaderMount uploads JavaScript numbers with uniform1f, including enum values.
uniform float u_count;
uniform vec4 u_colors[10];
uniform vec3 u_anchors[10];
uniform float u_interpolation; // 0.0 = bicubic spline, 1.0 = gaussian-rbf, 2.0 = catmull-rom
uniform float u_warpModulation;
uniform float u_turbulence, u_frequency, u_chromatic, u_distortion, u_swirl;
uniform float u_grainMixer, u_grainOverlay, u_scale, u_rotation;
uniform float u_grainBlend;
uniform vec2 u_offset;
out vec4 fragColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}

// 2D Bicubic / Spline / RBF Color Field Evaluator
vec4 field(vec2 uv) {
  vec4 color = vec4(0.0);
  float total = 0.0;
  for (int i = 0; i < 10; i++) {
    if (float(i) >= u_count) break;
    vec2 delta = uv - u_anchors[i].xy;
    float r = max(0.05, u_anchors[i].z);
    float weight = 0.0;

    if (u_interpolation < 0.5) {
      // Smooth Bicubic Spline Hermite Tensor Interpolation
      // Evaluates C1-continuous cubic Hermite polynomial along x and y with smooth boundary
      vec2 t = clamp(abs(delta) / r, 0.0, 1.0);
      vec2 h = (vec2(1.0) - t) * (vec2(1.0) - t) * (vec2(1.0) + vec2(2.0) * t); // 1 - 3t^2 + 2t^3
      float rad = clamp(length(delta) / r, 0.0, 1.0);
      float hRad = (1.0 - rad) * (1.0 - rad) * (1.0 + 2.0 * rad);
      weight = (h.x * h.y * 0.7 + hRad * 0.3) + 0.00001;
    } else if (u_interpolation < 1.5) {
      // Gaussian RBF Inverse-Distance Field
      weight = exp(-dot(delta, delta) * 8.0 / (r * r)) + 0.00001;
    } else {
      // Catmull-Rom Cubic Spline Interpolation with tension falloff
      vec2 t = clamp(abs(delta) / r, 0.0, 1.0);
      vec2 cr = max(vec2(0.0), vec2(1.0) - 2.5 * t * t + 1.5 * t * t * t);
      weight = cr.x * cr.y + 0.00001;
    }

    color += vec4(u_colors[i].rgb * u_colors[i].a, u_colors[i].a) * weight;
    total += weight;
  }
  return total > 0.0 ? color / total : vec4(0.5, 0.68, 0.93, 1.0);
}

void main() {
  vec2 uv = vec2(gl_FragCoord.x / u_resolution.x, 1.0 - gl_FragCoord.y / u_resolution.y);
  vec2 p = uv - 0.5 - u_offset;
  float c = cos(u_rotation), s = sin(u_rotation);
  p = mat2(c, -s, s, c) * p / u_scale;

  // Warp distortion modulation & swirl
  float warpMod = clamp(u_warpModulation, 0.0, 1.0);
  float swirlAngle = (u_swirl * (1.0 + warpMod * 0.6)) * 3.0 * exp(-dot(p, p) * 3.0);
  p = mat2(cos(swirlAngle), -sin(swirlAngle), sin(swirlAngle), cos(swirlAngle)) * p;

  float t = u_time * 0.18;
  float turbulence = u_turbulence + u_distortion * 0.3;

  // Multi-octave domain warping flow calculation
  if (turbulence > 0.0 || warpMod > 0.0) {
    vec2 flow1 = vec2(fbm(p * u_frequency + vec2(t, 0.0)), fbm(p * u_frequency + vec2(7.3, t * 1.15)));
    vec2 flow2 = vec2(fbm(p * u_frequency * 1.5 + flow1 * (1.0 + warpMod * 2.0) + vec2(3.1, t * 0.8)),
                      fbm(p * u_frequency * 1.5 + flow1 * (1.0 + warpMod * 2.0) + vec2(9.4, t * 0.9)));
    vec2 blendedFlow = mix(flow1, flow2, warpMod);
    p += (blendedFlow - 0.4375) * (turbulence + warpMod * 0.35);
  }

  // High-frequency grain dithering
  float grain = hash(gl_FragCoord.xy);
  p += (grain - 0.5) * u_grainMixer * 0.08;
  p += 0.5;

  // Chromatic aberration pass
  vec2 shift = (uv - 0.5) * u_chromatic * 0.08;
  vec4 base = field(p);
  vec3 color = base.rgb / max(base.a, 0.0001);

  if (u_chromatic > 0.0) {
    vec4 red = field(p + shift), blue = field(p - shift);
    color = vec3(red.r / max(red.a, 0.0001), color.g, blue.b / max(blue.a, 0.0001));
  }

  // Noise blending controls
  vec3 textureColor;
  if (u_grainBlend == 2.0) {
    textureColor = color * grain; // multiply
  } else if (u_grainBlend == 3.0) {
    textureColor = 1.0 - (1.0 - color) * (1.0 - grain); // screen
  } else if (u_grainBlend == 1.0) {
    textureColor = color - (1.0 - 2.0 * grain) * color * (1.0 - color); // soft-light
  } else if (u_grainBlend == 4.0) {
    textureColor = min(vec3(1.0), color + grain * 0.7); // linear-dodge (add)
  } else if (u_grainBlend == 5.0) {
    textureColor = min(vec3(1.0), color / max(vec3(0.001), 1.0 - grain * 0.6)); // color-dodge
  } else {
    // overlay (mode 0)
    textureColor = mix(2.0 * color * grain, 1.0 - 2.0 * (1.0 - color) * (1.0 - grain), step(vec3(0.5), color));
  }

  color = mix(color, textureColor, u_grainOverlay);
  fragColor = vec4(clamp(color, 0.0, 1.0) * base.a, base.a);
}
`
