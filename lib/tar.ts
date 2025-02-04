import { encoder, formatOctal, getChecksum, RECORD_SIZE, writeString } from './utils.ts';

/**
 * File attributes for the entry.
 */
export interface TarFileAttributes {
	/** @default 0o664 */
	mode?: number;
	/** @default 1000 */
	uid?: number;
	/** @default 1000 */
	gid?: number;
	/** @default Date.now() */
	mtime?: number;
	/** @default "" */
	user?: string;
	/** @default "" */
	group?: string;
}

/**
 * Information about the entry that should be put into the buffer.
 */
export interface TarFileEntry {
	/** Entry name */
	filename: string;
	/** Entry data */
	data: string | Uint8Array | ArrayBuffer;
	/** Entry file attributes */
	attrs?: TarFileAttributes;
}

const DEFAULT_ATTRS: TarFileAttributes = {};

/**
 * Writes a single file entry in tar format, returns an array buffer which can
 * then be concatenated or written to a stream.
 */
export function writeTarEntry(entry: TarFileEntry): Uint8Array {
	const { filename, data, attrs = DEFAULT_ATTRS } = entry;

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
			const total_length = (prefix.length && prefix.length + 1) + name.length;
			throw new Error(`filename is too long (${total_length})`);
		}
	}

	const dataBytes = normalizeData(data);
	const dataSize = dataBytes.byteLength;

	const paddingSize = RECORD_SIZE - (dataSize % RECORD_SIZE || RECORD_SIZE);

	const buf = new ArrayBuffer(512 + dataSize + paddingSize);

	// File name
	writeString(buf, name, 0, 100);

	// File mode
	writeString(buf, formatOctal(attrs.mode ?? 0o664, 7), 100, 8);

	// UID
	writeString(buf, formatOctal(attrs.uid ?? 1000, 7), 108, 8);

	// GID
	writeString(buf, formatOctal(attrs.gid ?? 1000, 7), 116, 8);

	// File size
	writeString(buf, formatOctal(dataSize, 11), 124, 12);

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

	// Actual data
	{
		const dest = new Uint8Array(buf, 512, dataSize);
		dest.set(dataBytes, 0);
	}

	return new Uint8Array(buf);
}

function normalizeData(data: string | ArrayBuffer | Uint8Array): Uint8Array {
	if (typeof data === 'string') {
		return encoder.encode(data);
	}

	if (data instanceof ArrayBuffer) {
		return new Uint8Array(data);
	}

	return data;
}
