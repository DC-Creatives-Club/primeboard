// Enlarge the existing display without replacing canvases or touching playback.
// The fixed-position layout also works on browsers without element fullscreen.
export function bindVisualizationFullscreen(frame, button, keyboardButton) {
  const doc = frame.ownerDocument;
  let active = false, native = false, entering = false;
  let previousFocus = null, restoreInert = [];
  let ignoreEscapeUntil = 0;
  let transitionUntil = 0, blurTimer;

  function setActive(value) {
    if (active === value) return;
    active = value;
    transitionUntil = Date.now() + 500;
    frame.classList.toggle('is-fullscreen', active);
    doc.body.classList.toggle('visualization-fullscreen', active);
    button.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    button.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
    button.setAttribute('aria-pressed', String(active));
    if (active) {
      previousFocus = doc.activeElement;
      // Keep keyboard navigation in the expanded view, including the fallback.
      for (let node = frame; node.parentElement; node = node.parentElement) {
        for (const sibling of node.parentElement.children) {
          if (sibling !== node && !sibling.inert) {
            sibling.inert = true; restoreInert.push(sibling);
          }
        }
        if (node.parentElement === doc.body) break;
      }
      frame.focus({ preventScroll: true });
    } else {
      for (const sibling of restoreInert) sibling.inert = false;
      restoreInert = [];
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    }
  }

  async function exit() {
    if (doc.fullscreenElement === frame) {
      try { await doc.exitFullscreen(); }
      catch { return; } // Leave the exit control available if the browser refuses.
    }
    setActive(false);
  }

  async function toggle() {
    if (active) return exit();
    if (entering) return;
    setActive(true);
    if (!frame.requestFullscreen || doc.fullscreenEnabled === false) return;
    entering = true;
    try {
      // Must run directly in the click gesture, before awaiting audio or anything else.
      await frame.requestFullscreen();
      if (!active && doc.fullscreenElement === frame) await exit();
    } catch { /* Keep the viewport-filling fallback if native fullscreen is denied. */ }
    finally { entering = false; }
  }

  doc.addEventListener('fullscreenchange', () => {
    if (doc.fullscreenElement === frame) {
      native = true;
    } else if (native) {
      native = false;
      // Some browsers dispatch Escape after they have already left fullscreen.
      ignoreEscapeUntil = Date.now() + 500;
      setActive(false);
    }
  });
  doc.defaultView.addEventListener('focus', () => clearTimeout(blurTimer));
  button.addEventListener('click', toggle);
  keyboardButton.addEventListener('click', () => {
    const show = frame.classList.toggle('show-fullscreen-keys');
    keyboardButton.setAttribute('aria-pressed', String(show));
    keyboardButton.textContent = show ? 'Hide keyboard' : 'Show keyboard';
    frame.focus({ preventScroll: true });
  });

  return {
    get active() { return active; },
    toggle,
    exit,
    handleBlur(onLeave) {
      if (!active && !entering && Date.now() > transitionUntil) { onLeave(); return; }
      // Safari briefly blurs the document while moving out of its native
      // fullscreen window. A real departure still releases inputs after settling;
      // visibilitychange continues to release them immediately when hidden.
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => { if (!doc.hasFocus()) onLeave(); }, 250);
    },
    handleEscape(event) {
      if (event.code !== 'Escape' || (!active && Date.now() > ignoreEscapeUntil)) return false;
      event.preventDefault();
      if (active) void exit();
      return true;
    },
  };
}
