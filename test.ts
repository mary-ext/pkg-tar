import { assertEquals } from 'jsr:@std/assert';

import { EntryType, untar } from './mod.ts';

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
