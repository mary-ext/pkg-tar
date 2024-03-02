# tar

Read and write tar archives.

```ts
// `writeTarEntry` is designed to be very simplistic, as the name suggests, it
// only spits out a buffer for one file entry. Good for streaming writes, but
// means you'd have to concatenate it yourself if you're doing it in one go.

const buffer = writeTarEntry({
	name: 'README.md',
	data: `Hello, **world**!`,
});

// `untar` expects a Reader interface, the package `@mary/reader` provides this
// by letting you convert a Uint8Array async iterable to one.

for await (const entry of untar(reader)) {
	// If it's a file in the blobs directory...
	if (entry.name.startsWith('blobs/')) {
		// Read the contents...
		const buffer = new Uint8Array(entry.size);
		await entry.read(buffer);
	}
}
```
