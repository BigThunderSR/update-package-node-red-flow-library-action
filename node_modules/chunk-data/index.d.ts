/**
Splits a typed array into smaller chunks.

This is useful for upload progress tracking when the data source emits large chunks. For example, `Readable.from(buffer)` emits the entire buffer as a single chunk, preventing incremental progress reporting. This function splits it into smaller pieces.

Returns zero-copy views of the original buffer for optimal performance.

@param data - The typed array to split into chunks.
@param chunkSize - The maximum size of each chunk in bytes.
@yields Chunks of the specified size.

@example
```
import {chunk} from 'chunk-data';

const largeBuffer = new Uint8Array(10_000_000);

// Split into 64 KB chunks
for (const piece of chunk(largeBuffer, 65_536)) {
	console.log(piece.length);
}
```
*/
export function chunk(
	data: ArrayBufferView,
	chunkSize: number,
): Generator<Uint8Array, void, undefined>;

/**
Splits an iterable of typed arrays into smaller chunks.

This is useful for re-chunking data from sources that emit inconsistently-sized chunks. Accumulates small chunks and splits large chunks to ensure consistent output chunk sizes.

Emits zero-copy views when possible, but may copy data to combine small chunks.

@param iterable - The iterable of typed arrays to re-chunk.
@param chunkSize - The maximum size of each chunk in bytes.
@yields Chunks of the specified size (except possibly the final chunk).

@example
```
import {chunkFrom} from 'chunk-data';

const buffers = [new Uint8Array(1000), new Uint8Array(2000)];

// Re-chunk into 500-byte chunks
for (const piece of chunkFrom(buffers, 500)) {
	console.log(piece.length);
}
```

@example
```
import {chunkFrom} from 'chunk-data';

function * generateBuffers() {
	yield new Uint8Array(100);
	yield new Uint8Array(500);
	yield new Uint8Array(200);
}

// Re-chunk generator output
for (const piece of chunkFrom(generateBuffers(), 300)) {
	console.log(piece.length);
}
```
*/
export function chunkFrom(
	iterable: Iterable<ArrayBufferView>,
	chunkSize: number,
): Generator<Uint8Array, void, undefined>;

/**
Splits an async iterable of typed arrays into smaller chunks.

This async generator consumes an async iterable or iterable and re-emits its data as smaller chunks. Accumulates small chunks and splits large chunks to ensure consistent output chunk sizes. Node.js streams are async iterables and work directly.

May copy data to coalesce small input chunks, but minimizes copying by emitting zero-copy views from large input chunks whenever possible.

@param iterable - The async iterable to read from and re-chunk.
@param chunkSize - The maximum size of each output chunk in bytes.
@yields Chunks of the specified size (except possibly the final chunk).

@example
```
import {chunkFromAsync} from 'chunk-data';
import {Readable} from 'node:stream';

const largeBuffer = new Uint8Array(10_000_000);
const stream = Readable.from([largeBuffer]);

// Split into 64 KB chunks
for await (const piece of chunkFromAsync(stream, 65_536)) {
	console.log(piece.length);
}
```

@example
```
import {chunkFromAsync} from 'chunk-data';
import {Readable} from 'node:stream';

const buffer = new Uint8Array(5_000_000);
const stream = Readable.from([buffer]);

// Split into 128 KB chunks
for await (const piece of chunkFromAsync(stream, 128 * 1024)) {
	console.log(piece.length);
}
```
*/
export function chunkFromAsync(
	iterable: AsyncIterable<ArrayBufferView> | Iterable<ArrayBufferView>,
	chunkSize: number,
): AsyncGenerator<Uint8Array, void, undefined>;
