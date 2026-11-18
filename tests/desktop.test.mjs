import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { APP_URL, assetPath, allowedPermission, allowedDownload, externalURL, isAppURL } from '../desktop/security.mjs';

test('desktop assets resolve only inside the bundled app', () => {
  const root = path.resolve('web');
  assert.equal(assetPath(APP_URL, root), path.join(root, 'index.html'));
  assert.equal(assetPath(`${APP_URL}data/modes/rounded-shell.bin`, root), path.join(root, 'data/modes/rounded-shell.bin'));
  assert.equal(assetPath(`${APP_URL}index.html#the-math`, root), path.join(root, 'index.html'));
  for (const url of ['file:///etc/passwd', 'https://app/', 'primeboard://other/index.html',
    'primeboard://app:80/index.html', 'primeboard://user@app/index.html',
    `${APP_URL}%2e%2e%2fpackage.json`, `${APP_URL}%5c..%5cpackage.json`, `${APP_URL}%00`,
    `${APP_URL}C:%5csecret`, `${APP_URL}.env`, `${APP_URL}%zz`]) {
    assert.equal(assetPath(url, root), null, url);
  }
});

test('desktop permissions permit basic MIDI from the instrument and reject broader access', () => {
  assert.equal(allowedPermission('midi', APP_URL, APP_URL), true);
  assert.equal(allowedPermission('midiSysex', APP_URL, APP_URL), true, 'Chromium uses this permission for basic MIDI too.');
  assert.equal(allowedPermission('clipboard-sanitized-write', APP_URL, APP_URL), true);
  for (const permission of ['media','usb','serial','clipboard-read','geolocation','unknown']) {
    assert.equal(allowedPermission(permission, APP_URL, APP_URL), false, permission);
  }
  assert.equal(allowedPermission('midi', 'https://example.org', APP_URL), false);
  assert.equal(allowedPermission('midiSysex', 'https://example.org', APP_URL), false);
  assert.equal(allowedPermission('midi', APP_URL, 'https://example.org'), false);
  assert.equal(allowedPermission('midi', APP_URL, APP_URL, false), false);
  assert.equal(allowedPermission('midi', APP_URL, undefined), false);
});

test('external navigation only opens web links and downloads stay within the app', () => {
  assert.equal(externalURL('https://example.org/score?x=1#part'), 'https://example.org/score?x=1#part');
  for (const value of ['file:///tmp/a', 'javascript:alert(1)', 'ms-settings:test', 'https://user:pass@example.org', APP_URL]) {
    assert.equal(externalURL(value), null);
  }
  assert.equal(allowedDownload('blob:primeboard://app/recording', APP_URL), true);
  assert.equal(allowedDownload(`${APP_URL}music/branches-return.txt`, APP_URL), true);
  assert.equal(allowedDownload('blob:https://example.org/recording', APP_URL), false);
  assert.equal(allowedDownload('file:///tmp/secret', APP_URL), false);
  assert.equal(allowedDownload('blob:primeboard://app/recording', 'https://example.org'), false);
  assert.equal(isAppURL('primeboard://app.evil/'), false);
});
