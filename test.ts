import { assertEquals } from 'jsr:@std/assert';

import { EntryType, untar, writeTarEntry } from './lib/mod.ts';

const expected: [type: EntryType, name: string][] = [
	['directory', '.vscode/'],
	['file', '.vscode/settings.json'],
	['file', 'deno.json'],
	['file', 'LICENSE'],
];

Deno.test('can read uncompressed tar files', async () => {
	using fd = await Deno.open(`samples/archive.tar`);

	const actual: [type: EntryType, name: string][] = [];

	for await (const entry of untar(fd.readable)) {
		actual.push([entry.type, entry.name]);
	}

	assertEquals(actual, expected);
});

Deno.test(`can read compressed tar.gz files`, async () => {
	using fd = await Deno.open(`samples/archive.tar.gz`);
	const stream = fd.readable.pipeThrough(new DecompressionStream('gzip'));

	const actual: [type: EntryType, name: string][] = [];

	for await (const entry of untar(stream)) {
		actual.push([entry.type, entry.name]);
	}

	assertEquals(actual, expected);
});

Deno.test(`can compress tar file and read it`, async () => {
	const expected: [filename: string, contents: string][] = [
		['README.txt', `Hello world!`],
		['mod.ts', `export default 123;`],
	];

	const buffers = expected.map(([filename, data]) => writeTarEntry({ filename, data }));
	const buffer = concat(buffers);

	const blob = new Blob([buffer]);
	const stream = blob.stream();

	const actual: [filename: string, contents: string][] = [];

	for await (const entry of untar(stream)) {
		actual.push([entry.name, await entry.text()]);
	}

	assertEquals(actual, expected);
});

function concat(uints: Uint8Array[]) {
	const size = uints.reduce((accu, uint) => accu + uint.byteLength, 0);
	const copy = new Uint8Array(size);

	uints.reduce((offset, uint) => {
		copy.set(uint, offset);
		return offset + uint.byteLength;
	}, 0);

	return copy;
}
