/**
 * 博客标签筛选。独立成一个模块而不是塞进 `interactions.ts`:那一包带着 WebGL
 * 着色器和语音球,博客页不该为一个过滤器把它们全下载下来。
 */
class BlogFilter extends HTMLElement {
  private events = new AbortController();

  connectedCallback() {
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    const buttons = [...this.querySelectorAll<HTMLButtonElement>('[data-tag]')];
    const cards = [...document.querySelectorAll<HTMLElement>('.be-blog-card')];
    if (!buttons.length || !cards.length) return;
    buttons.forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          const tag = button.dataset.tag ?? '';
          buttons.forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
          cards.forEach((card) => {
            card.hidden = tag !== '' && !(card.dataset.tags ?? '').split('|').includes(tag);
          });
        },
        options,
      ),
    );
  }

  disconnectedCallback() {
    this.events.abort();
  }
}

if (!customElements.get('blog-filter')) customElements.define('blog-filter', BlogFilter);
