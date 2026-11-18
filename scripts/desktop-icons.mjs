import { Resvg } from '@resvg/resvg-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const svg = await readFile(new URL('../web/icon.svg', import.meta.url), 'utf8');
const target = new URL('../desktop/assets/', import.meta.url);
await mkdir(target, { recursive: true });
const png = size => Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
await writeFile(new URL('icon.png', target), png(512));

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map(png);
const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2); directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (let i = 0; i < sizes.length; i++) {
  const entry = 6 + i * 16;
  directory[entry] = directory[entry + 1] = sizes[i] % 256;
  directory.writeUInt16LE(1, entry + 4); directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(images[i].length, entry + 8); directory.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
}
await writeFile(new URL('icon.ico', target), Buffer.concat([directory, ...images]));

const chunks = [['icp4',16], ['icp5',32], ['icp6',64], ['ic07',128], ['ic08',256], ['ic09',512], ['ic10',1024]].map(([type,size]) => {
  const image = png(size), header = Buffer.alloc(8);
  header.write(type); header.writeUInt32BE(image.length + 8, 4);
  return Buffer.concat([header, image]);
});
const header = Buffer.alloc(8); header.write('icns'); header.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
await writeFile(new URL('icon.icns', target), Buffer.concat([header, ...chunks]));
console.log('Generated desktop icons from web/icon.svg.');
