import { createIterableReader } from 'jsr:@mary/reader';
import { assertEquals } from 'jsr:@std/assert';

import { untar } from './mod.ts';

const expected: [type: string, name: string][] = [
	['directory', '.vscode/'],
	['file', '.vscode/settings.json'],
	['file', 'deno.json'],
	['file', 'LICENSE'],
];

Deno.test('can read uncompressed tar files', async () => {
	using fd = await Deno.open(`samples/archive.tar`);

	const reader = createIterableReader(fd.readable);
	const actual: [type: string, name: string][] = [];

	for await (const entry of untar(reader)) {
		actual.push([entry.type, entry.name]);
	}

	assertEquals(actual, expected);
});

Deno.test(`can read compressed tar.gz files`, async () => {
	using fd = await Deno.open(`samples/archive.tar.gz`);
	const stream = fd.readable.pipeThrough(new DecompressionStream('gzip'));

	const reader = createIterableReader(stream);
	const actual: [type: string, name: string][] = [];

	for await (const entry of untar(reader)) {
		actual.push([entry.type, entry.name]);
	}

	assertEquals(actual, expected);
});
