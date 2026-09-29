/* Accessible column resizing. Width lives only in this page session. */
(() => {
  const workspace = document.getElementById("explorer");
  const separator = document.getElementById("columnResizer");
  const setup = document.getElementById("setupPanel");
  const desktop = window.matchMedia("(min-width: 1001px)");
  const defaultWidth = 350, minimumSetup = 280, minimumGraph = 480, gutter = 24;
  let preferredWidth = defaultWidth;
  let pointer = null;
  let observedWidth = 0;

  function bounds() {
    const available = workspace.getBoundingClientRect().width - gutter;
    return { available, min: minimumSetup, max: Math.max(minimumSetup, available - minimumGraph) };
  }
  function render() {
    if (!desktop.matches) {
      finish();
      return;
    }
    const { available, min, max } = bounds();
    const actual = Math.max(min, Math.min(max, preferredWidth));
    workspace.style.setProperty("--controls-width", `${actual}px`);
    separator.setAttribute("aria-valuemin", String(Math.round(100 * min / available)));
    separator.setAttribute("aria-valuemax", String(Math.round(100 * max / available)));
    separator.setAttribute("aria-valuenow", String(Math.round(100 * actual / available)));
    separator.setAttribute("aria-valuetext", `Setup ${Math.round(actual)} pixels; graph ${Math.round(available - actual)} pixels`);
  }
  function setWidth(value) {
    const { min, max } = bounds();
    preferredWidth = Math.max(min, Math.min(max, value));
    render();
  }
  function finish(event) {
    if (!pointer || event?.pointerId !== undefined && event.pointerId !== pointer.id) return;
    const id = pointer.id;
    pointer = null;
    document.body.classList.remove("is-resizing-columns");
    if (separator.hasPointerCapture(id)) separator.releasePointerCapture(id);
  }
  separator.addEventListener("pointerdown", event => {
    if (!desktop.matches || event.button !== 0 || pointer) return;
    pointer = { id: event.pointerId, x: event.clientX, width: setup.getBoundingClientRect().width };
    separator.focus({ preventScroll: true });
    separator.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing-columns");
    event.preventDefault();
  });
  separator.addEventListener("pointermove", event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    setWidth(pointer.width + event.clientX - pointer.x);
  });
  separator.addEventListener("pointerup", finish);
  separator.addEventListener("pointercancel", finish);
  separator.addEventListener("lostpointercapture", finish);
  window.addEventListener("blur", () => finish());
  separator.addEventListener("dblclick", () => { preferredWidth = defaultWidth; render(); });
  separator.addEventListener("keydown", event => {
    if (!desktop.matches) return;
    const { min, max } = bounds();
    const actual = setup.getBoundingClientRect().width;
    const step = event.shiftKey ? 40 : 16;
    if (event.key === "ArrowLeft") setWidth(actual - step);
    else if (event.key === "ArrowRight") setWidth(actual + step);
    else if (event.key === "Home") setWidth(min);
    else if (event.key === "End") setWidth(max);
    else if (event.key === "Enter") { preferredWidth = defaultWidth; render(); }
    else if (event.key === "Escape" && pointer) { preferredWidth = pointer.width; finish(); render(); }
    else return;
    event.preventDefault();
  });
  desktop.addEventListener("change", render);
  // Observe width only: changing either panel's height must not start a resize loop.
  const observer = new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (width !== observedWidth) { observedWidth = width; render(); }
  });
  observer.observe(workspace);
  render();
})();
