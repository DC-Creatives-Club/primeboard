// Keep the button's text node stable between pointer-down and pointer-up.
// Replacing it on every animation frame can disrupt click targeting in Safari.
export function updateSongButton(button, state, pending) {
  const label = pending ? 'Starting…' : state === 'playing' ? 'Ⅱ Pause'
    : state === 'paused' ? '▶ Resume' : state === 'ended' ? '↻ Play again' : '▶ Play song';
  if (button.textContent !== label) button.textContent = label;
  if (button.disabled !== pending) button.disabled = pending;
}
