import { cp, mkdir, rm } from 'node:fs/promises';
import './app-version.mjs';
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
// Only replace the web build, preserving staged release archives.
await rm(new URL('../dist/web/', import.meta.url), { recursive: true, force: true });
await cp(new URL('../web/', import.meta.url), new URL('../dist/web/', import.meta.url), { recursive: true });
console.log('Built static app in dist/web/');
