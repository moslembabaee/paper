/** Authored for Paper's ShaderMount. Fixed loop bounds keep material work on the GPU. */
export const meshFragmentShader = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
// ShaderMount uploads JavaScript numbers with uniform1f, including enum values.
uniform float u_count;
uniform vec4 u_colors[10];
uniform vec3 u_anchors[10];
uniform float u_turbulence, u_frequency, u_chromatic, u_distortion, u_swirl;
uniform float u_grainMixer, u_grainOverlay, u_scale, u_rotation;
uniform float u_grainBlend;
uniform vec2 u_offset;
out vec4 fragColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
vec4 field(vec2 uv) {
  vec4 color = vec4(0); float total = 0.0;
  for (int i = 0; i < 10; i++) {
    if (float(i) >= u_count) break;
    vec2 delta = uv - u_anchors[i].xy;
    float weight = exp(-dot(delta, delta) * 8.0 / (u_anchors[i].z * u_anchors[i].z)) + 0.00001;
    color += vec4(u_colors[i].rgb * u_colors[i].a, u_colors[i].a) * weight; total += weight;
  }
  return color / total;
}
void main() {
  vec2 uv = vec2(gl_FragCoord.x / u_resolution.x, 1.0 - gl_FragCoord.y / u_resolution.y);
  vec2 p = uv - 0.5 - u_offset;
  float c = cos(u_rotation), s = sin(u_rotation);
  p = mat2(c, -s, s, c) * p / u_scale;
  float angle = u_swirl * 3.0 * exp(-dot(p, p) * 3.0);
  p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
  float t = u_time * 0.18;
  float turbulence = u_turbulence + u_distortion * 0.3;
  if (turbulence > 0.0) {
    vec2 flow = vec2(fbm(p * u_frequency + vec2(t, 0)), fbm(p * u_frequency + vec2(7, t)));
    p += (flow - 0.4375) * turbulence;
  }
  float grain = hash(gl_FragCoord.xy);
  p += (grain - 0.5) * u_grainMixer * 0.08;
  p += 0.5;
  vec2 shift = (uv - 0.5) * u_chromatic * 0.08;
  vec4 base = field(p);
  vec3 color = base.rgb / max(base.a, 0.0001);
  if (u_chromatic > 0.0) {
    vec4 red = field(p + shift), blue = field(p - shift);
    color = vec3(red.r / max(red.a, 0.0001), color.g, blue.b / max(blue.a, 0.0001));
  }
  vec3 textureColor;
  if (u_grainBlend == 2.0) textureColor = color * grain;
  else if (u_grainBlend == 3.0) textureColor = 1.0 - (1.0 - color) * (1.0 - grain);
  else if (u_grainBlend == 1.0) textureColor = color - (1.0 - 2.0 * grain) * color * (1.0 - color);
  else textureColor = mix(2.0 * color * grain, 1.0 - 2.0 * (1.0 - color) * (1.0 - grain), step(vec3(0.5), color));
  color = mix(color, textureColor, u_grainOverlay);
  fragColor = vec4(clamp(color, 0.0, 1.0) * base.a, base.a);
}`
