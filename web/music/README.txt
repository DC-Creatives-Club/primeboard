Primeboard: Ode to Joy
=====================

Composition: Ludwig van Beethoven, theme from Symphony No. 9 (1824).
The underlying composition is in the public domain.

Melody reference: Mutopia Project, piece 528, typeset by Peter Chubb.
https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528
Source: https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.ly
Mutopia identifies this edition as Public Domain. The typesetter's dedication
and attribution are retained in the unmodified local ode-to-joy-source.ly file.

Adaptation: the 16-bar soprano melody is transposed from G major to C major.
Primeboard adds a simple C/G accompaniment and short articulation gaps to fit
its 26 keys. This is a theme arrangement, not the full symphony or original
orchestration. The new event transcription and accompaniment are provided under
this repository's MIT license, alongside the rest of the application code.

The browser synthesizes sine tones directly. No third-party sound recording,
samples, streaming services, or external music requests are used.

Every active melody note contributes exponent 2; each harmony note contributes
exponent 1. Simultaneous contributions at the same key add before conversion
to light, the exact prime product, and square-root audio amplitude. Song weights
stay fixed for their written duration; the Hold step setting applies to live
keyboard playing. Playback uses Web Audio's clock for both audio and visuals.

Play enables sound. Pause preserves the position and visual spectrum while
silencing scheduled audio. Resume continues there; Restart plays from the start.
Stop/Escape clears playback. Playing a key, loading a number, changing Sustain,
or choosing a color preset returns control to the live instrument. Leaving the
window or hiding the page pauses a song. The tempo menu changes playback speed.
