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

const FILE_TYPES: Record<number, string> = {
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
 * Reads tar archives
 */
export async function* untar(reader: Reader): AsyncGenerator<TarEntry> {
	const header = new Uint8Array(512);

	let entry: TarEntry | undefined;

	while (true) {
		if (entry) {
			await entry.discard();
		}

		const res = await reader.read(header);

		if (res === null) {
			break;
		}

		// validate checksum
		{
			const expected = readOctal(header, 148, 8);
			const actual = getChecksum(header);
			if (expected !== actual) {
				if (actual === INITIAL_CHKSUM) {
					break;
				}

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

		entry = new TarEntry(header, reader);
		yield entry;
	}
}

class TarEntry {
	#reader: Reader;
	#read: number = 0;

	readonly name: string;
	readonly mode: number;
	readonly uid: number;
	readonly gid: number;
	readonly size: number;
	readonly mtime: number;
	readonly type: string;
	readonly linkName: string;
	readonly owner: string;
	readonly group: string;
	readonly entrySize: number;

	constructor(header: Uint8Array, reader: Reader) {
		const name = readString(header, 0, 100);
		const mode = readOctal(header, 100, 8);
		const uid = readOctal(header, 108, 8);
		const gid = readOctal(header, 116, 8);
		const size = readOctal(header, 124, 12);
		const mtime = readOctal(header, 136, 12);
		const type = readOctal(header, 156, 1);
		const link_name = readString(header, 157, 100);
		const owner = readString(header, 265, 32);
		const group = readString(header, 297, 32);
		const prefix = readString(header, 345, 155);

		this.name = prefix.length > 0 ? prefix + '/' + name : name;
		this.mode = mode;
		this.uid = uid;
		this.gid = gid;
		this.size = size;
		this.mtime = mtime;
		this.type = FILE_TYPES[type] ?? '' + type;
		this.linkName = link_name;
		this.owner = owner;
		this.group = group;
		this.entrySize = Math.ceil(this.size / RECORD_SIZE) * RECORD_SIZE;

		this.#reader = reader;
	}

	async read(p: Uint8Array): Promise<number | null> {
		const remaining = this.size - this.#read;

		if (remaining <= 0) {
			return null;
		}

		if (p.byteLength <= remaining) {
			this.#read += p.byteLength;
			return await this.#reader.read(p);
		}

		// User exceeded the remaining size of this entry, we can't fulfill that
		// directly because it means reading partially into the next entry
		this.#read += remaining;

		const block = new Uint8Array(remaining);
		const n = await this.#reader.read(block);

		p.set(block, 0);
		return n;
	}

	async discard(): Promise<void> {
		const remaining = this.entrySize - this.#read;

		if (remaining <= 0) {
			return;
		}

		this.#read += remaining;

		await this.#reader.seek(remaining);
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
