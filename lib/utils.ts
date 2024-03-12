/** Initial checksum value, includes the 8 bytes in the checksum field itself */
export const INITIAL_CHKSUM = 8 * 32;
export const RECORD_SIZE = 512;

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
