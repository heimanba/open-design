/**
 * Wrap an artifact's HTML for a sandboxed iframe. Corresponds to
 * buildSrcdoc in packages/runtime/src/index.ts — the reference version also
 * injects an edit-mode overlay and tweak bridge, which this starter omits.
 *
 * If the model returned a full document, pass it through unchanged; otherwise
 * wrap the fragment in a minimal doctype shell.
 *
 * When `options.deck` is set we also inject a `postMessage` listener that
 * lets the host advance / rewind slides without relying on the iframe
 * having keyboard focus. The host posts:
 *   { type: 'ocd:slide', action: 'next' | 'prev' | 'first' | 'last' | 'go', index?: number }
 * and the iframe responds with:
 *   { type: 'ocd:slide-state', active: number, count: number }
 * after every navigation so the host can render its own counter / dots.
 */
export function buildSrcdoc(
  html: string,
  options: { deck?: boolean } = {},
): string {
  const head = html.trimStart().slice(0, 64).toLowerCase();
  const isFullDoc = head.startsWith('<!doctype') || head.startsWith('<html');
  const wrapped = isFullDoc
    ? html
    : `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>${html}</body>
</html>`;
  if (!options.deck) return wrapped;
  return injectDeckBridge(wrapped);
}

function injectDeckBridge(doc: string): string {
  const script = `<script>(function(){
  function slides(){ return document.querySelectorAll('.slide'); }
  function scroller(){
    if (document.body.scrollWidth > document.body.clientWidth + 1) return document.body;
    return document.scrollingElement || document.documentElement;
  }
  function activeIndex(){
    return Math.round(scroller().scrollLeft / window.innerWidth);
  }
  function go(i){
    var list = slides();
    if (!list.length) return;
    var next = Math.max(0, Math.min(list.length - 1, i));
    scroller().scrollTo({ left: next * window.innerWidth, behavior: 'smooth' });
    setTimeout(report, 360);
  }
  function report(){
    try {
      var list = slides();
      window.parent.postMessage({
        type: 'ocd:slide-state',
        active: activeIndex(),
        count: list.length,
      }, '*');
    } catch (e) {}
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'ocd:slide') return;
    var list = slides();
    var i = activeIndex();
    if (data.action === 'next') go(i + 1);
    else if (data.action === 'prev') go(i - 1);
    else if (data.action === 'first') go(0);
    else if (data.action === 'last') go(list.length - 1);
    else if (data.action === 'go' && typeof data.index === 'number') go(data.index);
  });
  // Report once on load and on every scroll-end so the host stays in sync.
  window.addEventListener('load', function(){ setTimeout(report, 200); });
  document.addEventListener('scroll', function(){ clearTimeout(window.__ocdReportT); window.__ocdReportT = setTimeout(report, 120); }, { passive: true, capture: true });
})();</script>`;
  if (/<\/body>/i.test(doc)) return doc.replace(/<\/body>/i, `${script}</body>`);
  return doc + script;
}
