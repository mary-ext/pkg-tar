import { TarFileAttributes } from './tar.ts';
import { formatOctal, getChecksum, RECORD_SIZE, writeString } from './utils.ts';

/**
 * Information about the entry that should be put into the stream.
 */
export interface TarStreamEntry {
	/** Entry name */
	filename: string;
	/** Entry size */
	size: number;
	/** Entry file attributes */
	attrs?: TarFileAttributes;
}

const DEFAULT_ATTRS: TarFileAttributes = {};

/**
 * Creates a transform stream
 */
export function createTarStream(entry: TarStreamEntry) {
	const { filename, size, attrs = DEFAULT_ATTRS } = entry;

	let remaining = size;

	return new TransformStream<Uint8Array, Uint8Array>({
		start(controller) {
			let name = filename;
			let prefix = '';

			if (name.length > 100) {
				let i = 0;
				while (name.length > 100) {
					i = filename.indexOf('/', i);

					if (i === -1) {
						break;
					}

					prefix = filename.slice(0, i);
					name = filename.slice(i + 1);
				}

				if (name.length > 100 || prefix.length > 155) {
					const total = (prefix.length && prefix.length + 1) + name.length;
					throw new Error(`Filename is too long (${total})`);
				}
			}

			const buf = new ArrayBuffer(512);

			// File name
			writeString(buf, name, 0, 100);

			// File mode
			writeString(buf, formatOctal(attrs.mode ?? 0o664, 7), 100, 8);

			// UID
			writeString(buf, formatOctal(attrs.uid ?? 1000, 7), 108, 8);

			// GID
			writeString(buf, formatOctal(attrs.gid ?? 1000, 7), 116, 8);

			// File size
			writeString(buf, formatOctal(size, 11), 124, 12);

			// Modified time
			writeString(buf, formatOctal(Math.floor((attrs.mtime ?? Date.now()) / 1000), 11), 136, 12);

			// File type
			writeString(buf, '0', 156, 12);

			// Ustar
			writeString(buf, 'ustar00', 257, 8);

			// User ownership
			writeString(buf, attrs.user ?? '', 265, 32);

			// User group
			writeString(buf, attrs.group ?? '', 297, 32);

			// File prefix
			writeString(buf, prefix, 345, 155);

			// Checksum
			{
				const header = new Uint8Array(buf, 0, 512);
				const chksum = getChecksum(header);

				writeString(buf, formatOctal(chksum, 8), 148, 8);
			}

			controller.enqueue(new Uint8Array(buf));
		},
		transform(chunk, controller) {
			const size = chunk.byteLength;

			if (remaining - size < 0) {
				throw new Error(`Chunk was outside the bounds of the stream`);
			}

			remaining -= size;
			controller.enqueue(chunk);
		},
		flush(controller) {
			if (remaining !== 0) {
				throw new Error(`Unexpected end of stream`);
			}

			const paddingSize = RECORD_SIZE - (size % RECORD_SIZE || RECORD_SIZE);

			if (paddingSize > 0) {
				const padding = new Uint8Array(paddingSize);
				controller.enqueue(padding);
			}
		},
	});
}
