// Independently implemented spherical cloud field; no source-site runtime dependency.
export const vertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const fragmentShader = `
precision highp float;
varying vec2 v_uv;
uniform float u_time;
uniform float u_audio;
uniform vec2 u_resolution;

float random3(vec3 v) {
  v = fract(v * vec3(0.1031, 0.1030, 0.0973));
  v += dot(v, v.yxz + 31.32);
  return fract((v.x + v.y) * v.z);
}
float valueNoise(vec3 v) {
  vec3 cell = floor(v), f = fract(v);
  vec3 w = f * f * (3.0 - 2.0 * f);
  vec4 lo = vec4(random3(cell), random3(cell+vec3(1,0,0)),
                 random3(cell+vec3(0,1,0)), random3(cell+vec3(1,1,0)));
  vec4 hi = vec4(random3(cell+vec3(0,0,1)), random3(cell+vec3(1,0,1)),
                 random3(cell+vec3(0,1,1)), random3(cell+vec3(1,1,1)));
  vec2 plane = mix(vec2(mix(lo.x,lo.y,w.x), mix(hi.x,hi.y,w.x)),
                   vec2(mix(lo.z,lo.w,w.x), mix(hi.z,hi.w,w.x)), w.y);
  return mix(plane.x,plane.y,w.z);
}
float cloudNoise(vec3 v) {
  return valueNoise(v)*0.58 + valueNoise(v*2.1+vec3(7.3,4.1,2.9))*0.28
       + valueNoise(v*4.2+vec3(2.8,8.5,4.7))*0.14;
}
void main() {
  vec2 uv = v_uv*2.0-1.0;
  float phase = u_time*0.38;
  float azimuth = atan(uv.y,uv.x);
  float lobes = sin(azimuth*3.0+phase*2.0)*0.55
              + sin(azimuth*5.0-phase*1.6)*0.30
              + cos(azimuth*2.0+phase)*0.15;
  float radius = 0.913 + sin(u_time*1.35)*0.007
               + u_audio*0.024 + lobes*(0.003+u_audio*0.022);
  vec2 p = uv/radius;
  float squaredRadius = dot(p,p);
  float feather = 3.0/min(u_resolution.x,u_resolution.y);
  float opacity = 1.0-smoothstep(1.0-feather,1.0,squaredRadius);
  if(opacity<=0.0) { gl_FragColor=vec4(0.0); return; }
  vec3 n = vec3(p,sqrt(max(0.0,1.0-squaredRadius)));

  // Advect a low-frequency three-dimensional field across the sphere.
  vec3 flow = n*vec3(1.6,1.6,1.4);
  flow.xy += vec2(sin(n.y*2.5+phase),cos(n.x*2.4-phase*.8))*(.26+u_audio*.20);
  vec3 drift = vec3(phase*.32,-phase*.21,phase*.38);
  vec3 warp = vec3(valueNoise(flow+vec3(0,phase,phase*.3)),
                   valueNoise(flow+vec3(4.8,-phase*.7,phase)),
                   valueNoise(flow+vec3(phase*.5,9.1,-phase)))-.5;
  float cloud = cloudNoise(flow+warp*1.35+drift);
  float fold = n.x*.49 + n.y*.33 + sin(n.y*2.55-phase)*.31 + (cloud-.5)*.66;
  vec3 blue = vec3(69.0,185.0,216.0)/255.0;
  vec3 mist = vec3(229.0,251.0,255.0)/255.0;
  vec3 deep = vec3(22.0,86.0,107.0)/255.0;
  vec3 color = mix(deep,blue,smoothstep(-.31,.43,fold));
  color = mix(color,mist,smoothstep(.39,.82,cloud)*.33);

  // Broad internal scattering plus a narrower, soft luminous fold.
  float diffuse = max(0.0,dot(n,normalize(vec3(-.42,.64,1.0))));
  color *= .65+.45*diffuse;
  float broad = exp(-pow((fold-.27)*4.1,2.0))*n.z;
  color = mix(color,mist,broad*(.18+u_audio*.15));
  float ribbon = exp(-pow((fold+.055)*8.1,2.0))*pow(n.z,.66);
  color = mix(color,mix(mist,vec3(1),.54),ribbon*.77);
  float specular = pow(max(0.0,dot(n,normalize(vec3(-.46,.54,1.0)))),24.0);
  color += specular*.16;
  color = mix(color,mist,pow(1.0-n.z,3.0)*(.36+.24*max(0.0,-n.x)));
  color += (random3(vec3(gl_FragCoord.xy,1))-.5)*.032;
  gl_FragColor=vec4(clamp(color,0.0,1.0),opacity);
}`;
