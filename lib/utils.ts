/** Initial checksum value, includes the 8 bytes in the checksum field itself */
export const INITIAL_CHKSUM = 8 * 32;
export const RECORD_SIZE = 512;

export const encoder = new TextEncoder();

/** Calculates the checksum from the first 512 bytes of a buffer */
export function getChecksum(buf: Uint8Array): number {
	let checksum = INITIAL_CHKSUM;

	for (let i = 0; i < RECORD_SIZE; i++) {
		// Ignore own checksum field
		if (i >= 148 && i < 156) {
			continue;
		}

		checksum += buf[i];
	}

	return checksum;
}

/** Writes a string into an array buffer at a given offset, with a size limit */
export function writeString(buf: ArrayBuffer, str: string, offset: number, size: number) {
	const view = new Uint8Array(buf, offset, size);
	encoder.encodeInto(str, view);
}

/** Formats numbers for an octal-typed field */
export function formatOctal(input: number, length: number) {
	return input.toString(8).padStart(length, '0');
}
