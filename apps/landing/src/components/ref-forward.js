// Kept as readable source; RefForward.astro minifies and inlines it at build time.
(() => {
  if (window.__refForward) return;
  window.__refForward = true;
  const key = 'magic:landing-ref';
  const own = /(^|\.)magic-resume\.cn\.?$/i;
  let source = '';
  function forward() {
    let ref = '';
    try { ref = new URL(document.referrer).hostname; } catch {}
    let candidate = new URL(location.href).searchParams.get('utm_source') || source || (own.test(ref) ? '' : ref);
    try { candidate ||= sessionStorage.getItem(key); } catch {}
    candidate = (candidate || '').toLowerCase().replace(/\.$/, '');
    if (!candidate || own.test(candidate)) return;
    source = candidate;
    try { sessionStorage.setItem(key, source); } catch {}
    document.querySelectorAll('[data-ref-forward]').forEach((element) => {
      const attribute = element.getAttribute('data-ref-forward');
      if (attribute === 'form') {
        // GET forms serialize controls, discarding any query on the action.
        if (!element.querySelector('[name="utm_campaign"]')) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'utm_campaign';
          input.value = `ref.${source}`;
          element.append(input);
        }
        return;
      }
      const href = element.getAttribute(attribute);
      if (new URL(href, location.href).searchParams.has('utm_campaign')) return;
      // Append without reserializing: preserve encoding, ordering and fragments.
      element.setAttribute(attribute, href.replace(/(#|$)/, (hash, _, index) =>
        (href.slice(0, index).includes('?') ? '&' : '?') + 'utm_campaign=ref.' + encodeURIComponent(source) + hash));
    });
  }
  document.addEventListener('astro:page-load', forward);
  forward();
})();
