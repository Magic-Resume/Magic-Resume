/**
 * Signal grid 卡片 hover 时的网格渐变。
 *
 * 从 animated-dropdown-recreation 的已验证复刻移植(那份的原注:源站用的是 Paper
 * Design 的 MeshGradient,Apache-2.0)。uniform 取值对源站 CDP 实测:scale 1.16、
 * distortion 1.18、swirl .72、grain .08/.035、时间系数 .00024。
 *
 * 只在 hover/focus 时挂载、离开 560ms 后销毁——六张卡各一个 WebGL 上下文,常驻
 * 会把一屏的 GPU 预算吃光。
 */

const reduceMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function startSignalCanvas(
  canvas: HTMLCanvasElement,
  tone?: string,
  /** grain 强度。Signal grid 的 hover 面用实测的 .08/.035;bento 的常驻面要重得多,
   *  否则同样的渐变在大面积上会显得塑料。 */
  grain?: { mixer: number; overlay: number },
): () => void {
  // The source uses Paper Design's Apache-2.0 MeshGradient shader. Keep the
  // measured WebGL renderer and uniforms instead of substituting a CSS/2D wash.
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: true,
    failIfMajorPerformanceCaveat: true,
    powerPreference: 'low-power',
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false,
  });
  if (!gl) return function () {};
  const vertexSource = `#version 300 es
precision mediump float;
layout(location = 0) in vec4 a_position;
uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;
out vec2 v_objectUV;
vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {
vec2 box = vec2(0.);
box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);
float noFitBoxWidth = box.x;
if (u_fit == 1.) box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);
else if (u_fit == 2.) box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);
box.y = box.x / boxRatio;
return vec3(box, noFitBoxWidth);
}
void main() {
gl_Position = a_position;
vec2 uv = gl_Position.xy * .5;
vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
vec2 givenBoxSize = max(vec2(u_worldWidth, u_worldHeight), vec2(1.)) * u_pixelRatio;
float r = u_rotation * 3.14159265358979323846 / 180.;
mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);
vec2 fixedRatioBoxGivenSize = vec2((u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x, (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y);
vec2 objectBoxSize = getBoxSize(1., fixedRatioBoxGivenSize).xy;
vec2 objectWorldScale = u_resolution.xy / objectBoxSize;
v_objectUV = uv * objectWorldScale;
v_objectUV += boxOrigin * (objectWorldScale - 1.);
v_objectUV += graphicOffset;
v_objectUV /= u_scale;
v_objectUV = graphicRotation * v_objectUV;
}`;
  const fragmentSource = `#version 300 es
precision mediump float;
uniform float u_time;
uniform vec4 u_colors[10];
uniform float u_colorsCount;
uniform float u_distortion;
uniform float u_swirl;
uniform float u_grainMixer;
uniform float u_grainOverlay;
in vec2 v_objectUV;
out vec4 fragColor;
#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846
vec2 rotate(vec2 uv, float th) { return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv; }
float hash21(vec2 p) {
p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;
p += dot(p, p + 19.19);
return fract(p.x * p.y);
}
float valueNoise(vec2 st) {
vec2 i = floor(st);
vec2 f = fract(st);
float a = hash21(i);
float b = hash21(i + vec2(1.0, 0.0));
float c = hash21(i + vec2(0.0, 1.0));
float d = hash21(i + vec2(1.0, 1.0));
vec2 u = f * f * (3.0 - 2.0 * f);
return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float noise(vec2 n, vec2 seedOffset) { return valueNoise(n + seedOffset); }
vec2 getPosition(int i, float t) {
float a = float(i) * .37;
float b = .6 + fract(float(i) / 3.) * .9;
float c = .8 + fract(float(i + 1) / 4.);
return .5 + .5 * vec2(sin(t * b + a), cos(t * c + a * 1.5));
}
void main() {
vec2 uv = v_objectUV;
uv += .5;
vec2 grainUV = uv * 1000.;
float mixerGrain = 0.;
if (u_grainMixer > 0.) mixerGrain = .4 * u_grainMixer * (noise(grainUV, vec2(0.)) - .5);
const float firstFrameOffset = 41.5;
float t = .5 * (u_time + firstFrameOffset);
float radius = smoothstep(0., 1., length(uv - .5));
float center = 1. - radius;
for (float i = 1.; i <= 2.; i++) {
  uv.x += u_distortion * center / i * sin(t + i * .4 * smoothstep(.0, 1., uv.y)) * cos(.2 * t + i * 2.4 * smoothstep(.0, 1., uv.y));
  uv.y += u_distortion * center / i * cos(t + i * 2. * smoothstep(.0, 1., uv.x));
}
vec2 uvRotated = uv - vec2(.5);
uvRotated = rotate(uvRotated, -3. * u_swirl * radius);
uvRotated += vec2(.5);
vec3 color = vec3(0.);
float opacity = 0.;
float totalWeight = 0.;
for (int i = 0; i < 10; i++) {
  if (i >= int(u_colorsCount)) break;
  vec2 pos = getPosition(i, t) + mixerGrain;
  vec3 colorFraction = u_colors[i].rgb * u_colors[i].a;
  float opacityFraction = u_colors[i].a;
  float dist = pow(length(uvRotated - pos), 3.5);
  float weight = 1. / (dist + 1e-3);
  color += colorFraction * weight;
  opacity += opacityFraction * weight;
  totalWeight += weight;
}
color /= max(1e-4, totalWeight);
opacity /= max(1e-4, totalWeight);
if (u_grainOverlay > 0.) {
  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);
  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = pow(u_grainOverlay * abs(grainOverlayV), .8);
  color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);
  opacity += .5 * grainOverlayStrength;
}
fragColor = vec4(color, clamp(opacity, 0., 1.));
}`;
  const compile = function (type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(
        'Signal Grid shader compile failed',
        gl.getShaderInfoLog(shader),
      );
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return function () {};
  const program = gl.createProgram();
  if (!program) return function () {};
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(
      'Signal Grid shader link failed',
      gl.getProgramInfoLog(program),
    );
    return function () {};
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const uniform = function (name: string) {
    return gl.getUniformLocation(program, name);
  };
  const locations = {
    resolution: uniform('u_resolution'),
    pixelRatio: uniform('u_pixelRatio'),
    originX: uniform('u_originX'),
    originY: uniform('u_originY'),
    worldWidth: uniform('u_worldWidth'),
    worldHeight: uniform('u_worldHeight'),
    fit: uniform('u_fit'),
    scale: uniform('u_scale'),
    rotation: uniform('u_rotation'),
    offsetX: uniform('u_offsetX'),
    offsetY: uniform('u_offsetY'),
    time: uniform('u_time'),
    colors: uniform('u_colors'),
    colorsCount: uniform('u_colorsCount'),
    distortion: uniform('u_distortion'),
    swirl: uniform('u_swirl'),
    grainMixer: uniform('u_grainMixer'),
    grainOverlay: uniform('u_grainOverlay'),
  };
  // 前三支来自 Signal grid 的实测复刻;后三支是 bento 用的,沿用页面已有的
  // sky / violet / emerald 家族——源站 bento 的逐卡 hex 没能采到(uniform 钩子
  // 挂不上、preserveDrawingBuffer 为 false 也读不了像素),与其猜一套外来的颜色,
  // 不如用这一页自己已经在用的三支。
  const palettes: Record<string, number[]> = {
    peach: [
      0.9764705882, 0.8352941176, 0.7058823529, 1, 0.9568627451, 0.7137254902,
      0.7843137255, 1, 0.7882352941, 0.7215686275, 0.9333333333, 1,
      0.6196078431, 0.8352941176, 0.9176470588, 1, 0.7176470588, 0.9019607843,
      0.8196078431, 1,
    ],
    mint: [
      0.8509803922, 0.937254902, 0.8117647059, 1, 0.662745098, 0.862745098,
      0.8274509804, 1, 0.662745098, 0.8274509804, 0.937254902, 1, 0.7764705882,
      0.7176470588, 0.9137254902, 1, 0.937254902, 0.7490196078, 0.8156862745, 1,
    ],
    violet: [
      0.9568627451, 0.8431372549, 0.6666666667, 1, 0.937254902, 0.7215686275,
      0.6588235294, 1, 0.8196078431, 0.7254901961, 0.9098039216, 1,
      0.6784313725, 0.8509803922, 0.8901960784, 1, 0.768627451, 0.8901960784,
      0.768627451, 1,
    ],
    sky: [
      0.4980392157, 0.8196078431, 0.9843137255, 1, 0.3098039216, 0.7137254902,
      0.9607843137, 1, 0.1843137255, 0.5607843137, 0.9411764706, 1,
      0.4156862745, 0.6588235294, 0.968627451, 1, 0.6235294118, 0.862745098,
      0.9843137255, 1,
    ],
    orchid: [
      0.768627451, 0.7098039216, 0.9921568627, 1, 0.6549019608, 0.5450980392,
      0.9803921569, 1, 0.5450980392, 0.3607843137, 0.9647058824, 1,
      0.8784313725, 0.662745098, 0.9411764706, 1, 0.9411764706, 0.6705882353,
      0.8470588235, 1,
    ],
    mist: [
      0.7254901961, 0.8980392157, 0.8549019608, 1, 0.5607843137, 0.831372549,
      0.7764705882, 1, 0.662745098, 0.8470588235, 0.9176470588, 1, 0.8117647059,
      0.9137254902, 0.7215686275, 1, 0.9176470588, 0.9529411765, 0.862745098, 1,
    ],
    emerald: [
      0.6549019608, 0.9529411765, 0.8156862745, 1, 0.431372549, 0.9058823529,
      0.7176470588, 1, 0.2039215686, 0.8274509804, 0.6, 1, 0.5254901961,
      0.937254902, 0.6745098039, 1, 0.7333333333, 0.968627451, 0.8156862745, 1,
    ],
  };
  const paletteKey =
    tone && palettes[tone]
      ? tone
      : tone === 'amber'
        ? 'mint'
        : tone === 'rose'
          ? 'violet'
          : 'peach';
  const colors = new Float32Array(palettes[paletteKey]);
  gl.uniform1f(locations.originX, 0.5);
  gl.uniform1f(locations.originY, 0.5);
  gl.uniform1f(locations.worldWidth, 0);
  gl.uniform1f(locations.worldHeight, 0);
  gl.uniform1f(locations.fit, 1);
  gl.uniform1f(locations.scale, 1.16);
  gl.uniform1f(locations.rotation, 0);
  gl.uniform1f(locations.offsetX, 0);
  gl.uniform1f(locations.offsetY, 0.2);
  gl.uniform4fv(locations.colors, colors);
  gl.uniform1f(locations.colorsCount, 5);
  gl.uniform1f(locations.distortion, 1.18);
  gl.uniform1f(locations.swirl, 0.72);
  gl.uniform1f(locations.grainMixer, grain ? grain.mixer : 0.08);
  gl.uniform1f(locations.grainOverlay, grain ? grain.overlay : 0.035);
  let frame = 0;
  let running = true;
  let startedAt = 0;
  const draw = function (now: number) {
    if (!startedAt) startedAt = now;
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.uniform2f(locations.resolution, width, height);
    gl.uniform1f(locations.pixelRatio, dpr);
    gl.uniform1f(
      locations.time,
      reduceMotion() ? 0 : (now - startedAt) * 0.00024,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (running && !reduceMotion()) frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return function () {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  };
}
