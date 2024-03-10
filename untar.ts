import { getChecksum, INITIAL_CHKSUM, RECORD_SIZE } from './utils.ts';

/**
 * Provides the ability to read variably-sized buffers
 */
export interface Reader {
	/**
	 * Reads up to `p.byteLength` into `p`
	 */
	read(p: Uint8Array): Promise<number | null>;
	/**
	 * Skip reading `n` amount of bytes
	 */
	seek(n: number): Promise<number>;
}

const decoder = new TextDecoder();

export type EntryType =
	| 'file'
	| 'link'
	| 'symlink'
	| 'character_device'
	| 'block_device'
	| 'directory'
	| 'fifo'
	| 'contiguous_file';

const ENTRY_TYPES: Record<number, EntryType> = {
	0: 'file',
	1: 'link',
	2: 'symlink',
	3: 'character_device',
	4: 'block_device',
	5: 'directory',
	6: 'fifo',
	7: 'contiguous_file',
};

/**
 * Reads tar archive from a stream
 */
export async function* untar(stream: ReadableStream<Uint8Array>): AsyncGenerator<TarEntry> {
	const reader = stream.getReader();

	const header = new Uint8Array(RECORD_SIZE);
	let read = 0;

	while (true) {
		const { done, value } = await reader.read();

		if (done) {
			break;
		}

		let chunk = value;

		while (chunk.byteLength > 0) {
			const remaining = Math.min(chunk.byteLength, RECORD_SIZE - read);

			header.set(chunk.subarray(0, remaining), read);
			chunk = chunk.subarray(remaining);

			read += remaining;

			if (read === 512) {
				// validate checksum
				{
					const expected = readOctal(header, 148, 8);
					const actual = getChecksum(header);

					if (expected !== actual) {
						if (actual === INITIAL_CHKSUM) {
							break;
						}

						console.log(header);
						throw new Error(`invalid checksum, expected ${expected} got ${actual}`);
					}
				}

				// validate magic
				{
					const magic = readString(header, 257, 8);
					if (!magic.startsWith('ustar')) {
						throw new Error(`unsupported archive format: ${magic}`);
					}
				}

				const { promise, resolve } = Promise.withResolvers<Uint8Array>();
				const entry = new TarEntry(header, reader, chunk, resolve);

				yield entry;

				if (entry.size > 0) {
					if (!entry.bodyUsed) {
						await entry.skip();
					}

					chunk = await promise;
				}

				read = 0;
			}
		}
	}
}

class TarEntry {
	/** 512-byte header chunk */
	#header: Uint8Array;
	/** Memoized result for `this.size` */
	#sizeField: number | undefined;

	#bodyUsed = false;
	#reader: ReadableStreamDefaultReader;
	#buffered: Uint8Array | undefined;
	#callback: (remaining: Uint8Array) => void;

	constructor(
		header: Uint8Array,
		reader: ReadableStreamDefaultReader,
		buffered: Uint8Array,
		callback: (remaining: Uint8Array) => void,
	) {
		this.#header = header;

		this.#reader = reader;
		this.#buffered = buffered.byteLength > 0 ? buffered : undefined;
		this.#callback = callback;
	}

	/** File name */
	get name(): string {
		const header = this.#header;
		const name = readString(header, 0, 100);
		const prefix = readString(header, 345, 155);

		return prefix.length > 0 ? prefix + '/' + name : name;
	}
	/** File permissions */
	get mode(): number {
		return readOctal(this.#header, 100, 8);
	}
	/** User ID */
	get uid(): number {
		return readOctal(this.#header, 108, 8);
	}
	/** Group ID */
	get gid(): number {
		return readOctal(this.#header, 116, 8);
	}
	/** File size */
	get size(): number {
		return this.#sizeField ??= readOctal(this.#header, 124, 12);
	}
	/** Modified time */
	get mtime(): number {
		return readOctal(this.#header, 136, 12);
	}
	/** File type */
	get type(): EntryType {
		const type = readOctal(this.#header, 156, 1);
		return ENTRY_TYPES[type];
	}
	/** Link name */
	get linkName(): string {
		return readString(this.#header, 157, 100);
	}
	/** Owner name */
	get owner(): string {
		return readString(this.#header, 265, 32);
	}
	/** Group name */
	get group(): string {
		return readString(this.#header, 297, 32);
	}

	get #entryStream(): ReadableStream<Uint8Array> {
		let bodyRemaining = this.size;
		let entryRemaining = Math.ceil(bodyRemaining / RECORD_SIZE) * RECORD_SIZE;

		return new ReadableStream({
			start: () => {
				if (this.#bodyUsed) {
					throw new Error(`Body already consumed`);
				}

				this.#bodyUsed = true;
			},
			pull: async (controller) => {
				if (entryRemaining === 0) {
					controller.close();
					return;
				}

				let chunk: Uint8Array;

				if (this.#buffered) {
					chunk = this.#buffered;
					this.#buffered = undefined;
				} else {
					const result = await this.#reader.read();

					if (result.done) {
						controller.error(new Error('Unexpected end of stream'));
						return;
					}

					chunk = result.value;
				}

				const size = chunk.length;
				const entrySize = Math.min(entryRemaining, size);
				const bodySize = Math.min(bodyRemaining, size);

				if (bodySize > 0) {
					controller.enqueue(chunk.subarray(0, bodySize));
				}

				bodyRemaining -= bodySize;
				entryRemaining -= entrySize;

				if (entryRemaining === 0) {
					this.#callback(chunk.subarray(entrySize));
					controller.close();
				}
			},
		});
	}

	/** Whether the body has been consumed */
	get bodyUsed(): boolean {
		return this.#bodyUsed;
	}

	/** Get a readable stream of the file contents */
	get body(): ReadableStream<Uint8Array> {
		return this.#entryStream;
	}

	/** Skip reading this entry. There's no need to call this manually, it will be skipped if not used */
	async skip(): Promise<void> {
		const reader = this.#entryStream.getReader();

		// deno-lint-ignore no-empty
		while (!(await reader.read()).done) {}
	}

	/** Read the file contents to an array buffer */
	async arrayBuffer(): Promise<ArrayBuffer> {
		const uint8 = new Uint8Array(this.size);
		let offset = 0;

		for await (const chunk of this.#entryStream) {
			uint8.set(chunk, offset);
			offset += chunk.byteLength;
		}

		return uint8.buffer;
	}

	/** Read the file contents as a string */
	async text(): Promise<string> {
		const bytes = await this.arrayBuffer();
		return decoder.decode(bytes);
	}

	/** Read the file contents as a JSON */
	async json(): Promise<string> {
		const text = await this.text();
		return JSON.parse(text);
	}
}

function readString(arr: Uint8Array, offset: number, size: number): string {
	let input = arr.subarray(offset, offset + size);

	for (let idx = 0, len = input.length; idx < len; idx++) {
		const code = input[idx];

		if (code === 0) {
			input = input.subarray(0, idx);
			break;
		}
	}

	return decoder.decode(input);
}

function readOctal(arr: Uint8Array, offset: number, size: number): number {
	const res = readString(arr, offset, size);
	return res ? parseInt(res, 8) : 0;
}
