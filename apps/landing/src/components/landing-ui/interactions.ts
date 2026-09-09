import { startSignalCanvas } from './signal-shader';
import { startVoiceOrb } from './voice-orb';

/** Small DOM controllers survive Astro navigation without retaining old pages. */
class LandingControl extends HTMLElement {
  protected events = new AbortController();
  disconnectedCallback() {
    this.events.abort();
  }
}

class ResumeComposer extends LandingControl {
  private timer?: ReturnType<typeof setInterval>;
  connectedCallback() {
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    const input = this.querySelector<HTMLTextAreaElement>('textarea');
    const form = this.querySelector('form');
    if (!input || !form) return;
    const resize = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
    };
    input.addEventListener('input', resize, options);
    input.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.isComposing &&
          event.keyCode !== 229
        ) {
          event.preventDefault();
          form.requestSubmit();
        }
      },
      options,
    );
    this.querySelectorAll<HTMLButtonElement>('[data-prompt]').forEach(
      (button) =>
        button.addEventListener(
          'click',
          () => {
            input.value = button.dataset.prompt ?? '';
            resize();
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          },
          options,
        ),
    );
    const roles: string[] = JSON.parse(this.dataset.roles || '[]');
    let role = 0;
    if (
      roles.length &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      this.timer = setInterval(() => {
        if (input.value || document.activeElement === input || document.hidden)
          return;
        role = (role + 1) % roles.length;
        input.placeholder = `${this.dataset.prefix ?? ''}${roles[role]}${this.dataset.suffix ?? ''}`;
      }, 3800);
    }
    resize();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.timer);
  }
}

class LandingTabs extends LandingControl {
  connectedCallback() {
    this.events = new AbortController();
    const tabs = [...this.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const panels = [...this.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    const select = (index: number, focus = false) => {
      tabs.forEach((tab, i) => {
        tab.setAttribute('aria-selected', String(index === i));
        tab.tabIndex = index === i ? 0 : -1;
      });
      panels.forEach((panel, i) => {
        panel.hidden = index !== i;
      });
      if (focus) tabs[index].focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i), {
        signal: this.events.signal,
      });
      tab.addEventListener(
        'keydown',
        (event) => {
          if (
            ![
              'ArrowUp',
              'ArrowDown',
              'ArrowLeft',
              'ArrowRight',
              'Home',
              'End',
            ].includes(event.key)
          )
            return;
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? tabs.length - 1
                : (i +
                    (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) +
                    tabs.length) %
                  tabs.length;
          select(next, true);
        },
        { signal: this.events.signal },
      );
    });
  }
}

/**
 * Bento 画面里的网格渐变。与 Signal grid 同一支 shader,区别是**常驻**而不是 hover
 * 触发(源站 bento 就是常驻的)。五块画面 = 五个 WebGL 上下文,所以靠
 * IntersectionObserver 出视口就停,别让它们在页面别处一直烧 GPU。
 */
class BentoMesh extends LandingControl {
  private stop?: () => void;
  connectedCallback() {
    this.events = new AbortController();
    const canvas = this.querySelector('canvas');
    if (!canvas) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible && !this.stop) {
          this.stop = startSignalCanvas(canvas, this.dataset.tone, {
            mixer: 0.2,
            overlay: 0.14,
          });
          this.classList.add('is-live');
        } else if (!visible && this.stop) {
          this.stop();
          this.stop = undefined;
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(this);
    this.events.signal.addEventListener('abort', () => observer.disconnect());
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.stop?.();
  }
}

/** 一轮 Polaris「回合」的节拍表:step 驱动大卡内部时序,beat 点亮当前小卡。 */
const BENTO_BEATS = [
  { step: 0, beat: 0, ms: 1100 },
  { step: 1, beat: 0, ms: 900 },
  { step: 2, beat: 0, ms: 900 },
  { step: 3, beat: 0, ms: 900 },
  { step: 4, beat: 0, ms: 1700 },
  { step: 5, beat: 1, ms: 1200 },
  { step: 5, beat: 2, ms: 1300 },
  { step: 5, beat: 3, ms: 1400 },
  { step: 5, beat: 4, ms: 1400 },
] as const;

/** 整片 bento 共用一个节拍器,任何时刻只有一张卡在动——五张各演各的就是噪音。 */
class BentoStage extends LandingControl {
  private timer?: ReturnType<typeof setTimeout>;
  private waking?: ReturnType<typeof setTimeout>;
  private cursor = 0;
  private take = 0;
  private takes = 1;
  private held = false;
  private tick = () => {
    clearTimeout(this.timer);
    const frame = BENTO_BEATS[this.cursor];
    this.dataset.step = String(frame.step);
    this.dataset.beat = String(frame.beat);
    this.dataset.item = String(this.take);
    this.cursor += 1;
    if (this.cursor >= BENTO_BEATS.length) {
      this.cursor = 0;
      this.take = (this.take + 1) % this.takes;
    }
    this.timer = setTimeout(this.tick, frame.ms);
  };
  connectedCallback() {
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    this.takes = Math.max(1, this.querySelectorAll('.be-chat-take').length);
    // 静止偏好下停在信息量最大的一帧:提案已经摆出来,五张卡同时可读。
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.classList.add('is-static');
      return;
    }
    const hold = () => {
      this.held = true;
      clearTimeout(this.timer);
      clearTimeout(this.waking);
      this.dataset.held = '';
    };
    const wake = () => {
      clearTimeout(this.waking);
      this.waking = setTimeout(() => {
        this.held = false;
        delete this.dataset.held;
        delete this.dataset.decided;
        this.tick();
      }, 1500);
    };
    // 一碰就把控制权交出去:悬停/聚焦期间停住,离开 1.5s 后自己接着放。
    this.addEventListener('pointerenter', hold, options);
    this.addEventListener('pointerleave', wake, options);
    this.addEventListener('focusin', hold, options);
    this.addEventListener('focusout', wake, options);
    this.querySelectorAll<HTMLButtonElement>(
      '.be-chat-accept,.be-chat-skip,.be-sim-ask button',
    ).forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          hold();
          this.dataset.step = '5';
          this.dataset.decided = button.classList.contains('be-chat-skip')
            ? 'skipped'
            : 'accepted';
          button.setAttribute('data-picked', '');
          setTimeout(() => button.removeAttribute('data-picked'), 900);
        },
        options,
      ),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          if (!this.held) this.tick();
        } else clearTimeout(this.timer);
      },
      { rootMargin: '0px 0px -80px' },
    );
    observer.observe(this);
    this.events.signal.addEventListener('abort', () => observer.disconnect());
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.timer);
    clearTimeout(this.waking);
  }
}

/**
 * Signal grid 的卡片。hover/focus 时挂载网格渐变并抹开,离开后 560ms 再销毁
 * ——离开就立刻拆会让"移出又移回"每次都重建 WebGL 上下文。
 * focusin/focusout 一并接上:这张卡里有可聚焦内容时,键盘也该看到同样的反馈。
 */
class SignalCard extends LandingControl {
  private stop?: () => void;
  private exit = 0;
  private frame = 0;
  connectedCallback() {
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    const canvas = this.querySelector('canvas');
    const enter = () => {
      clearTimeout(this.exit);
      if (canvas && !this.stop)
        this.stop = startSignalCanvas(canvas, this.dataset.tone);
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() =>
        this.classList.add('is-hovered'),
      );
    };
    const leave = () => {
      cancelAnimationFrame(this.frame);
      this.classList.remove('is-hovered');
      const reduce = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      this.exit = window.setTimeout(
        () => {
          this.stop?.();
          this.stop = undefined;
        },
        reduce ? 1 : 560,
      );
    };
    this.addEventListener('pointerenter', enter, options);
    this.addEventListener('pointerleave', leave, options);
    this.addEventListener('focusin', enter, options);
    this.addEventListener('focusout', leave, options);
    requestAnimationFrame(() => this.classList.add('is-entered'));
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.exit);
    cancelAnimationFrame(this.frame);
    this.stop?.();
  }
}

/**
 * 故事拼贴(实测复刻,见 beui.css §5)。三张卡叠着,最前那张直立,后面的按 --depth
 * 往左上偏、旋出去。
 *
 * 当前卡两侧各有邻卡露在外面,所以点最前那张不做任何事——与源站一致。
 *
 * 卡片本身不放链接——button 里套 a 是非法嵌套;prompt 改挂在左侧那个 CTA 上,跟着
 * 当前卡换 href。
 */
class StoryCollage extends LandingControl {
  connectedCallback() {
    this.events = new AbortController();
    const cards = [...this.querySelectorAll<HTMLButtonElement>('.be-story')];
    const cta = document.querySelector<HTMLAnchorElement>('[data-collage-cta]');
    const select = (index: number) => {
      cards.forEach((card, i) => {
        // 有符号偏移:排在当前卡之前的往左扇,之后的往右扇。源站实测 x=125.44·offset、
        // rot=5°·offset(都带符号),而 y=32·|offset|、scale/opacity 只看绝对值。
        const offset = i - index;
        card.style.setProperty('--offset', String(offset));
        card.style.setProperty('--depth', String(Math.abs(offset)));
        card.classList.toggle('is-active', i === index);
        card.setAttribute('aria-pressed', String(i === index));
      });
      if (cta) cta.href = cards[index].dataset.href ?? cta.href;
    };
    cards.forEach((card, i) =>
      card.addEventListener('click', () => select(i), {
        signal: this.events.signal,
      }),
    );
    select(0);
  }
}

/**
 * FAQ 手风琴。原生 <details> 的开合是瞬间的,高度没有可过渡的中间态。
 *
 * 接管 summary 的点击自己驱动:展开时先把 open 打开、让内容以 0fr 渲染出来,
 * **下一帧**再切到 1fr——同一帧里改 open 和高度不会产生过渡;收起时先跑动画,
 * 等 grid-template-rows 过渡结束再摘掉 open,否则内容当场 display:none。
 */
class FaqList extends LandingControl {
  connectedCallback() {
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    const items = [...this.querySelectorAll<HTMLDetailsElement>('details')];
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const answerOf = (item: HTMLDetailsElement) =>
      item.querySelector<HTMLElement>('.be-faq-answer');
    const close = (item: HTMLDetailsElement) => {
      const answer = answerOf(item);
      if (!answer || still) {
        item.open = false;
        return;
      }
      answer.classList.remove('is-open');
      const done = (event: TransitionEvent) => {
        if (event.propertyName !== 'grid-template-rows') return;
        answer.removeEventListener('transitionend', done);
        // 过渡跑完的这段时间里可能又被点开了,那就不能再关。
        if (!answer.classList.contains('is-open')) item.open = false;
      };
      answer.addEventListener('transitionend', done);
    };
    const open = (item: HTMLDetailsElement) => {
      const answer = answerOf(item);
      item.open = true;
      if (!answer) return;
      if (still) {
        answer.classList.add('is-open');
        return;
      }
      requestAnimationFrame(() => answer.classList.add('is-open'));
    };
    items.forEach((item) => {
      if (item.open) answerOf(item)?.classList.add('is-open');
      item.querySelector('summary')?.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          const wasOpen = answerOf(item)?.classList.contains('is-open');
          items.forEach((other) => {
            if (other !== item && other.open) close(other);
          });
          if (wasOpen) close(item);
          else open(item);
        },
        options,
      );
    });
  }
}

/** 每一步停留的时长(ms)。源站实测约 5.5s——快了读不完描述,慢了像卡住。 */
const WALKTHROUGH_DWELL = 5500;

/**
 * 面试三步走的 tablist。
 *
 * 自动进位 + 可点,和 bento 同一套「一碰就交给你」规则:悬停/聚焦停住,离开 1.5s 续播。
 * 第二步的球只在它当值时才跑 rAF——三块舞台同时画等于白烧 GPU。
 */
class WalkthroughStage extends LandingControl {
  private timer?: ReturnType<typeof setTimeout>;
  private waking?: ReturnType<typeof setTimeout>;
  private stopOrb?: () => void;
  private tabs: HTMLButtonElement[] = [];
  private index = 0;
  private held = false;
  private orbStartedAt = 0;
  private select = (next: number, manual = false) => {
    clearTimeout(this.timer);
    this.index = (next + this.tabs.length) % this.tabs.length;
    this.tabs.forEach((tab, i) =>
      tab.setAttribute('aria-selected', String(i === this.index)),
    );
    this.dataset.step = String(this.index);
    this.index === 1 ? this.mountOrb() : this.unmountOrb();
    if (!manual && !this.held)
      this.timer = setTimeout(
        () => this.select(this.index + 1),
        WALKTHROUGH_DWELL,
      );
  };
  /**
   * 脚本化的电平包络。落地页没有麦克风,但相位语汇要和产品一致:
   * 面试官说 → 收缩着想 → 轮到你说。9Hz 是音节速率,外面再罩一层 2.3Hz 的语句起伏。
   */
  private orbState = () => {
    const t = (performance.now() - this.orbStartedAt) / 1000;
    const cycle = t % 7;
    const phase =
      cycle < 2.6 ? 'speaking' : cycle < 3.8 ? 'thinking' : 'listening';
    const envelope =
      Math.max(0, Math.sin(t * 9)) * (0.55 + 0.45 * Math.sin(t * 2.3));
    const level = Math.min(1, Math.max(0, envelope));
    return {
      phase: phase as 'speaking' | 'thinking' | 'listening',
      output: phase === 'speaking' ? level : 0,
      input: phase === 'listening' ? level * 0.8 : 0,
    };
  };
  private mountOrb() {
    if (this.stopOrb) return;
    const host = this.querySelector<HTMLElement>('.be-orb');
    if (!host) return;
    this.orbStartedAt = performance.now();
    const caption = this.querySelector<HTMLElement>('.be-walk-phase');
    const words: Record<string, string> = JSON.parse(
      this.dataset.phases || '{}',
    );
    let shown = '';
    this.stopOrb = startVoiceOrb(host, () => {
      const state = this.orbState();
      if (caption && words[state.phase] && shown !== state.phase) {
        shown = state.phase;
        caption.textContent = words[state.phase];
      }
      return state;
    });
  }
  private unmountOrb() {
    this.stopOrb?.();
    this.stopOrb = undefined;
  }
  connectedCallback() {
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    this.tabs = [...this.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    if (!this.tabs.length) return;
    this.tabs.forEach((tab, i) => {
      tab.addEventListener(
        'click',
        () => {
          this.held = true;
          this.select(i, true);
        },
        options,
      );
      tab.addEventListener(
        'keydown',
        (event) => {
          const delta =
            event.key === 'ArrowRight' || event.key === 'ArrowDown'
              ? 1
              : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                ? -1
                : 0;
          if (!delta) return;
          event.preventDefault();
          this.select(this.index + delta, true);
          this.tabs[this.index].focus();
        },
        options,
      );
    });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.classList.add('is-static');
      this.select(0, true);
      return;
    }
    const hold = () => {
      this.held = true;
      clearTimeout(this.timer);
      clearTimeout(this.waking);
    };
    const wake = () => {
      clearTimeout(this.waking);
      this.waking = setTimeout(() => {
        this.held = false;
        this.select(this.index + 1);
      }, 1500);
    };
    this.addEventListener('pointerenter', hold, options);
    this.addEventListener('pointerleave', wake, options);
    this.addEventListener('focusin', hold, options);
    this.addEventListener('focusout', wake, options);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible && !this.held) this.select(this.index);
        else {
          clearTimeout(this.timer);
          this.unmountOrb();
        }
      },
      { rootMargin: '0px 0px -80px' },
    );
    observer.observe(this);
    this.events.signal.addEventListener('abort', () => observer.disconnect());
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.timer);
    clearTimeout(this.waking);
    this.unmountOrb();
  }
}
/** 光斑是**追**指针不是钉在指针上:每帧收敛 65%,快速划过时拖出一道尾巴。 */
class FooterSpotlight extends LandingControl {
  private frame = 0;
  connectedCallback() {
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    let tx = 0,
      ty = 0,
      cx = 0,
      cy = 0,
      active = false;
    const reduce = () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const paint = () => {
      cx += (tx - cx) * 0.65;
      cy += (ty - cy) * 0.65;
      this.style.setProperty('--spot-x', `${cx}px`);
      this.style.setProperty('--spot-y', `${cy}px`);
      this.frame =
        active && (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05)
          ? requestAnimationFrame(paint)
          : 0;
    };
    const move = (event: PointerEvent) => {
      const rect = this.getBoundingClientRect();
      tx = event.clientX - rect.left;
      ty = event.clientY - rect.top;
      if (!active) {
        cx = tx;
        cy = ty;
      }
      active = true;
      this.style.setProperty('--spot-visible', '1');
      if (reduce()) {
        cx = tx;
        cy = ty;
        paint();
        return;
      }
      if (!this.frame) this.frame = requestAnimationFrame(paint);
    };
    this.addEventListener('pointerenter', move, options);
    this.addEventListener('pointermove', move, options);
    this.addEventListener(
      'pointerleave',
      () => {
        active = false;
        this.style.setProperty('--spot-visible', '0');
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
      },
      options,
    );
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.frame) cancelAnimationFrame(this.frame);
  }
}

/**
 * 套餐卡的极光。WebGL2 的 raymarch 波面,不是渐变——渐变做不出那种丝缕结构。
 * 每像素最多 70 步,所以**只在进入视口时跑**;拿不到 webgl2 就退回 CSS 渐变那层。
 */
class PricingAurora extends LandingControl {
  private stop?: () => void;
  connectedCallback() {
    this.events = new AbortController();
    const canvas = this.querySelector('canvas');
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: true,
      premultipliedAlpha: true,
    });
    if (!gl) return;
    const program = buildAuroraProgram(gl);
    if (!program) return;
    this.classList.add('is-live');

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const params: Record<string, number> = {
      uSpeed: 0.32,
      uAmplitude: 2.8,
      uWaveScale: 0.68,
      uWaveRatio: 0.82,
      uSwell: 39,
      uTurbulence: 18,
      uTilt: 1.08,
      uZoom: 0.88,
      uHeight: 5.8,
      uFogDepth: 17,
      uSteps: 70,
      uBrightness: 1.12,
      uOpacity: 0.96,
      uGrain: 1,
      uGrainIntensity: 0.025,
      uParallax: 0.28,
    };
    for (const name of Object.keys(params))
      gl.uniform1f(uniform(name), params[name]);
    const tone = AURORA_TONES[this.dataset.tone ?? 'pro'] ?? AURORA_TONES.pro;
    gl.uniform3fv(uniform('uHorizonColor'), tone.horizon);
    gl.uniform3fv(uniform('uWaveColor'), tone.wave);
    gl.uniform3fv(uniform('uCrestColor'), tone.crest);
    gl.uniform1i(uniform('uEnableMouse'), 1);
    gl.enable(gl.DEPTH_TEST);

    const iResolution = uniform('iResolution'),
      iTime = uniform('iTime'),
      uMouse = uniform('uMouse');
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    const card = this.closest('.be-plan') ?? this;
    card.addEventListener(
      'pointermove',
      (event) => {
        const rect = card.getBoundingClientRect();
        const e = event as PointerEvent;
        mouse.tx = Math.min(
          1,
          Math.max(0, (e.clientX - rect.left) / rect.width),
        );
        mouse.ty = Math.min(
          1,
          Math.max(0, (e.clientY - rect.top) / rect.height),
        );
      },
      { signal: this.events.signal },
    );
    card.addEventListener(
      'pointerleave',
      () => {
        mouse.tx = 0.5;
        mouse.ty = 0.5;
      },
      { signal: this.events.signal },
    );

    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const started = performance.now();
    let frame = 0,
      visible = false;
    const draw = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width)),
        height = Math.max(1, Math.round(rect.height));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      mouse.x += (mouse.tx - mouse.x) * 0.045;
      mouse.y += (mouse.ty - mouse.y) * 0.045;
      gl.uniform2f(iResolution, width, height);
      gl.uniform1f(iTime, (now - started) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frame = !reduce && visible ? requestAnimationFrame(draw) : 0;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        if (visible && !frame) frame = requestAnimationFrame(draw);
        else if (!visible && frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(this);
    draw(started);

    this.stop = () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      gl.deleteProgram(program);
    };
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.stop?.();
  }
}

/**
 * 每档一组色。Pro 是源件那支青蓝;Max 往紫红推——同一片波面,越贵的越烫。
 * 只有色变,几何与速度共用,免得两张卡看着像两个组件。
 */
const rgb = (r: number, g: number, b: number) =>
  new Float32Array([r / 255, g / 255, b / 255]);
const AURORA_TONES: Record<
  string,
  { horizon: Float32Array; wave: Float32Array; crest: Float32Array }
> = {
  pro: {
    horizon: rgb(7, 19, 40),
    wave: rgb(6, 104, 232),
    crest: rgb(34, 211, 238),
  },
  max: {
    horizon: rgb(24, 6, 42),
    wave: rgb(124, 58, 237),
    crest: rgb(244, 114, 182),
  },
};

/** 波面着色器。源件的 uniform 名与数值原样保留,便于日后对着 catalog 比对。 */
function buildAuroraProgram(gl: WebGL2RenderingContext) {
  const vertexSource =
    '#version 300 es\nin vec2 p;\nvoid main(){gl_Position=vec4(p,0.,1.);}';
  const fragmentSource = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec2 iResolution;uniform float iTime;uniform vec2 uMouse;uniform bool uEnableMouse;',
    'uniform float uSpeed,uAmplitude,uWaveScale,uWaveRatio,uSwell,uTurbulence,uTilt,uZoom,uHeight,uFogDepth,uSteps,uBrightness,uOpacity,uGrain,uGrainIntensity,uParallax;',
    'uniform vec3 uHorizonColor,uWaveColor,uCrestColor;out vec4 outColor;',
    'const float FAR_LIMIT=20000.;',
    'float pixelNoise(vec2 point){vec3 q=fract(vec3(point.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}',
    'float surfaceDistance(vec3 point,vec2 frequency,vec4 clock){',
    ' float displacedX=point.x+clock.x;displacedX+=uSwell*sin((point.y+displacedX)/20.+clock.y);',
    ' float displacedY=point.y-clock.z;displacedY+=uTurbulence*cos(point.x/23.+clock.w);',
    ' return point.z-(sin(displacedX*frequency.x)*uAmplitude+sin(displacedY*frequency.y)*uAmplitude+uHeight);',
    '}',
    'float traceSurface(vec3 origin,vec3 direction,vec2 frequency,vec4 clock){',
    ' float travelled=0.;',
    ' for(int step=0;step<128;step++){',
    '  if(float(step)>=uSteps)break;float sceneDistance=surfaceDistance(origin+travelled*direction,frequency,clock);',
    '  if(abs(sceneDistance)<.1)break;travelled+=.9*sceneDistance;if(!(abs(travelled)<FAR_LIMIT))return FAR_LIMIT;',
    ' }',
    ' return travelled;',
    '}',
    'vec3 rotateScreenX(vec3 value,float angle){float c=cos(angle),s=sin(angle);return mat3(1.,0.,0.,0.,c,-s,0.,s,c)*value;}',
    'vec3 rotateScreenZ(vec3 value,vec2 axis){return mat3(axis.x,-axis.y,0.,axis.y,axis.x,0.,0.,0.,1.)*value;}',
    'vec3 rotateCameraY(vec3 value,float angle){float c=cos(angle),s=sin(angle);return mat3(c,0.,s,0.,1.,0.,-s,0.,c)*value;}',
    'void main(){',
    ' float time=iTime*uSpeed;vec2 frequency=vec2(uWaveScale/7.,uWaveScale*uWaveRatio/3.);',
    ' vec4 clock=vec4(time/.130,time/.810,time/.200,time/.710);',
    ' float verticalFov=(3.14159/2.3)/max(uZoom,.05);vec3 camera=vec3(0.,0.,30.);',
    ' vec2 screen=gl_FragCoord.xy/iResolution-.5;screen.x*=iResolution.x/iResolution.y;screen.y*=-1.;',
    ' vec3 direction=vec3(0.,0.,-1.);float radius=length(screen);',
    ' direction=rotateScreenX(direction,verticalFov*radius);vec2 axis=radius>1e-5?screen/radius:vec2(1.,0.);',
    ' direction=rotateScreenZ(direction,axis);direction=rotateCameraY(direction,uTilt);',
    ' if(uEnableMouse){direction=rotateCameraY(direction,(uMouse.x-.5)*uParallax*.4);direction=rotateScreenX(direction,(uMouse.y-.5)*uParallax*.4);}',
    ' float distanceToSurface=traceSurface(camera,direction,frequency,clock);vec3 hit=camera+distanceToSurface*direction;',
    ' float fog=clamp(uFogDepth/max(distanceToSurface,.001),0.,1.);',
    ' vec3 body=mix(uWaveColor,uCrestColor,clamp(hit.z*.08+.5,0.,1.));',
    ' vec3 color=clamp(mix(uHorizonColor,body,fog)*uBrightness,0.,1.);',
    ' float alpha=clamp(fog,0.,1.)*uOpacity;',
    ' if(uGrain>.5){alpha+=(pixelNoise(gl_FragCoord.xy+mod(iTime,64.)*11.)-.5)*uGrainIntensity;}',
    ' alpha=clamp(alpha,0.,1.);outColor=vec4(color*alpha,alpha);',
    '}',
  ].join('\n');
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const attribute = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  return program;
}
for (const [name, element] of [
  ['resume-composer', ResumeComposer],
  ['landing-tabs', LandingTabs],
  ['story-collage', StoryCollage],
  ['walkthrough-stage', WalkthroughStage],
  ['faq-list', FaqList],
  ['footer-spotlight', FooterSpotlight],
  ['pricing-aurora', PricingAurora],
  ['signal-card', SignalCard],
  ['bento-mesh', BentoMesh],
  ['bento-stage', BentoStage],
] as const) {
  if (!customElements.get(name)) customElements.define(name, element);
}
