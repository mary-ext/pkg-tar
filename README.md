# tar

[Source code](https://codeberg.org/mary-ext/pkg-tar)

Read and write tar archives.

```ts
// `writeTarEntry` is designed to be very simplistic, as the name suggests, it
// only spits out a buffer for one file entry. Good for streaming writes, but
// means you'd have to concatenate it yourself if you're doing it in one go.

const buffer = writeTarEntry({
	name: 'README.md',
	data: `Hello, **world**!`,
});

// `untar` lets you iterate over a tar archive, it's streamed, so you'd need to
// pass a readable stream.

for await (const entry of untar(stream)) {
	// If it's a file in the blobs directory...
	if (entry.name.startsWith('blobs/')) {
		const buffer = await entry.arrayBuffer();
		// -> ArrayBuffer(...)
	}
}
```
