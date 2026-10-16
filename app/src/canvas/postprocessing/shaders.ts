export const vertexShader = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const header = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_source;
uniform sampler2D u_aux;
uniform vec2 u_resolution;
uniform vec4 u_params;
uniform vec4 u_extra;
uniform vec3 u_color;
uniform float u_time;
uniform float u_opacity;
uniform int u_blend;
vec3 blend(vec3 a, vec3 b) {
  if (u_blend == 1) return 1.0 - (1.0-a)*(1.0-b);
  if (u_blend == 2) return a*b;
  if (u_blend == 3) return mix(2.0*a*b, 1.0-2.0*(1.0-a)*(1.0-b), step(vec3(.5),a));
  return b;
}
vec3 straight(vec4 c) { return c.a > .00001 ? c.rgb/c.a : vec3(0.0); }
void finish(vec4 src, vec3 effect) {
  // All intermediate textures use premultiplied alpha; grade in straight RGB.
  outColor = vec4(mix(straight(src), blend(straight(src), effect), u_opacity)*src.a, src.a);
}
`

export const fragments = {
  copy: `${header}void main() { outColor = texture(u_source, v_uv); }`,
  threshold: `${header}void main() {
    vec4 src = texture(u_source, v_uv);
    float l = dot(straight(src), vec3(.2126,.7152,.0722));
    float knee = max(.0001, u_params.y);
    float soft = clamp(l-u_params.x+knee, 0.0, 2.0*knee);
    float weight = max(l-u_params.x, soft*soft/(4.0*knee))/max(l,.0001);
    outColor = vec4(src.rgb*weight,src.a);
  }`,
  blur: `${header}void main() {
    vec2 d = u_params.xy/u_resolution;
    vec4 c = texture(u_source,v_uv)*.227027;
    c += (texture(u_source,v_uv+d*1.384615)+texture(u_source,v_uv-d*1.384615))*.316216;
    c += (texture(u_source,v_uv+d*3.230769)+texture(u_source,v_uv-d*3.230769))*.070270;
    outColor = c;
  }`,
  bloom: `${header}void main() {
    vec4 src = texture(u_source,v_uv);
    vec3 glow = texture(u_aux,v_uv).rgb*u_params.x;
    // Screen is the optical default; other blend modes remain explicit.
    vec3 effect = u_blend == 1 ? glow : straight(src)+glow;
    finish(src,effect);
  }`,
  'chromatic-aberration': `${header}void main() {
    vec4 src = texture(u_source,v_uv);
    vec2 direction = u_params.z > .5 ? (v_uv-.5)*2.0 : vec2(cos(u_params.w),sin(u_params.w));
    vec2 offset = direction*u_params.x*(1.0+u_params.y*3.0)*8.0/u_resolution;
    vec4 r = texture(u_source,clamp(v_uv+offset,vec2(0.0),vec2(1.0)));
    vec4 b = texture(u_source,clamp(v_uv-offset,vec2(0.0),vec2(1.0)));
    finish(src,vec3(straight(r).r,straight(src).g,straight(b).b));
  }`,
  'film-grain': `${header}
  float noise(vec2 p, float seed) { return fract(sin(dot(p,vec2(127.1,311.7))+seed*74.7)*43758.5453); }
  void main() {
    vec4 src=texture(u_source,v_uv);
    vec2 p=floor(v_uv*u_resolution/u_params.y);
    float t = u_extra.x > .5 ? floor(u_time*u_params.z*60.0) : 0.0;
    vec3 n=vec3(noise(p,t));
    if (u_extra.y < .5) n=vec3(n.r,noise(p,t+17.0),noise(p,t+41.0));
    vec3 effect=clamp(straight(src)+(n-.5)*u_params.x,0.0,1.0);
    if(u_blend == 3) effect=.5+(n-.5)*u_params.x;
    finish(src,effect);
  }`,
  vignette: `${header}void main() {
    vec4 src=texture(u_source,v_uv);
    vec2 p=(v_uv-.5)*2.0;
    p.x*=mix(1.0,u_resolution.x/u_resolution.y,u_params.w);
    float edge=smoothstep(u_params.y, u_params.y+max(.001,u_params.z),length(p));
    vec3 effect=mix(straight(src),u_color,edge*u_params.x);
    if(u_blend == 2) effect=mix(vec3(1.0),u_color,edge*u_params.x);
    finish(src,effect);
  }`,
  'color-grade': `${header}void main() {
    vec4 src=texture(u_source,v_uv);
    vec3 c=straight(src)*exp2(u_params.w);
    c=(c-.5)*u_params.x+.5+u_params.y;
    c=mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,u_params.z)*u_color;
    finish(src,clamp(c,0.0,1.0));
  }`,
} as const
