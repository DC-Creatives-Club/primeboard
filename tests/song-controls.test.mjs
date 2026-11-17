import test from 'node:test';
import assert from 'node:assert/strict';
import { updateSongButton } from '../web/song-controls.js';

test('playback frames preserve the Pause button contents and enabled state', () => {
  let text = '▶ Play song', disabled = false, textWrites = 0, disabledWrites = 0;
  const button = {
    get textContent() { return text; },
    set textContent(value) { text = value; textWrites++; },
    get disabled() { return disabled; },
    set disabled(value) { disabled = value; disabledWrites++; },
  };
  updateSongButton(button, 'playing', false);
  assert.equal(text, 'Ⅱ Pause');
  for (let frame = 0; frame < 120; frame++) updateSongButton(button, 'playing', false);
  assert.equal(textWrites, 1, 'do not replace the clicked text node while playing');
  assert.equal(disabledWrites, 0);
  updateSongButton(button, 'paused', false);
  assert.equal(text, '▶ Resume');
  updateSongButton(button, 'paused', true);
  assert.equal(text, 'Starting…'); assert.equal(disabled, true);
  updateSongButton(button, 'playing', false);
  assert.equal(text, 'Ⅱ Pause'); assert.equal(disabled, false);
  updateSongButton(button, 'idle', false);
  assert.equal(text, '▶ Play song');
});
