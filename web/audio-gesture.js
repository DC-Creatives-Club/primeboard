const AUDIO_CONTROLS = '#sound, #song-play, #song-restart, #recording-play, #recording-export, #midi-connect';

export function shouldUnlockAudio(event) {
  if (!event.isTrusted || event.target.closest?.(AUDIO_CONTROLS)) return false;
  const keyboard = Boolean(event.target.closest?.('#keyboard'));
  // A finger going down may begin a scroll, which is not permission to play
  // audio on iOS. Only keys need the early attempt for low-latency playing.
  if (event.type === 'pointerdown') return event.pointerType === 'mouse' || keyboard;
  // Retry from the release gesture even if that early attempt is still pending.
  if (event.type === 'pointerup') return event.pointerType !== 'mouse' && keyboard;
  if (event.type === 'touchend') return keyboard;
  if (event.type === 'click') return true;
  return event.type === 'keydown' && event.key !== 'Escape' && !event.isComposing
    && !event.ctrlKey && !event.metaKey && !event.altKey;
}
