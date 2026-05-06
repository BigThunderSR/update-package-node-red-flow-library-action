# chunk-data

> Split buffers and streams into smaller chunks

Use case: When working with HTTP uploads and progress tracking, you need the request body to be sent in multiple chunks. However, data sources like `Readable.from(buffer)` emit the entire buffer as a single chunk, causing upload progress to jump from 0% to 100% instantly with no intermediate updates.

## Install

```sh
npm install chunk-data
```

## Usage

### Chunking a buffer

```js
import {chunk} from 'chunk-data';

const largeBuffer = new Uint8Array(10_000_000); // 10 MB

// Split into 64 KB chunks
for (const piece of chunk(largeBuffer, 65_536)) {
	console.log(piece.length);
	//=> 65536 (except last chunk)
}
```

### Chunking an iterable of buffers

```js
import {chunkFrom} from 'chunk-data';

const buffers = [new Uint8Array(1000), new Uint8Array(2000)];

// Re-chunk into 500-byte chunks
for (const piece of chunkFrom(buffers, 500)) {
	console.log(piece.length);
	//=> 500, 500, 500, 500, 500, 1000
}
```

### Chunking a stream

```js
import {chunkFromAsync} from 'chunk-data';
import {Readable} from 'node:stream';

const largeBuffer = new Uint8Array(10_000_000); // 10 MB
const stream = Readable.from([largeBuffer]);

// Split into 64 KB chunks
for await (const piece of chunkFromAsync(stream, 65_536)) {
	console.log(piece.length);
	//=> 65536 (except last chunk)
}
```

> [!TIP]
> Node.js streams (like `Readable`) are async iterables and work directly with `chunkFromAsync()`.

## API

### chunk(data, chunkSize)

Splits a typed array into smaller chunks.

This is a generator function that yields chunks of the specified size. Returns zero-copy views of the original buffer for optimal performance.

#### data

Type: `ArrayBufferView`

The typed array to split into chunks. Can be `Uint8Array`, `Uint16Array`, `Int32Array`, or any other typed array.

#### chunkSize

Type: `number`

The maximum size of each chunk in bytes. Must be a positive integer.

Returns: `Generator<Uint8Array>`

### chunkFrom(iterable, chunkSize)

Splits an iterable of typed arrays into smaller chunks.

This is a generator function that re-chunks data from sources that emit inconsistently-sized chunks. Accumulates small chunks and splits large chunks to ensure consistent output chunk sizes.

#### iterable

Type: `Iterable<ArrayBufferView>`

The iterable of typed arrays to re-chunk. Can be an array of buffers, a generator, or any iterable that yields typed arrays.

#### chunkSize

Type: `number`

The maximum size of each chunk in bytes. Must be a positive integer.

Returns: `Generator<Uint8Array>`

### chunkFromAsync(iterable, chunkSize)

Splits an async iterable of typed arrays into smaller chunks.

This async generator consumes an async iterable or iterable and re-emits its data as smaller chunks. Accumulates small chunks and splits large chunks to ensure consistent output chunk sizes.

#### iterable

Type: `AsyncIterable<ArrayBufferView> | Iterable<ArrayBufferView>`

The async iterable to read from and re-chunk. Can be any async iterable or iterable that yields typed arrays. Node.js streams are async iterables and work directly.

#### chunkSize

Type: `number`

The maximum size of each output chunk in bytes. Must be a positive integer.

Returns: `AsyncGenerator<Uint8Array>`

## Why?

**Problem:** Upload progress tracking requires sending data in multiple chunks, but many data sources emit large single chunks:

```js
import {Readable} from 'node:stream';

const buffer = new Uint8Array(10_000_000);
const stream = Readable.from([buffer]);

// This emits ONE chunk of 10 MB, not multiple smaller chunks
for await (const chunk of stream) {
	console.log(chunk.length);
	//=> 10000000 (entire buffer in one go)
}
```

**Solution:** Use `chunkFromAsync()` to split it:

```js
import {Readable} from 'node:stream';
import {chunkFromAsync} from 'chunk-data';

const buffer = new Uint8Array(10_000_000);
const stream = Readable.from([buffer]);

// Now we get many smaller chunks
for await (const piece of chunkFromAsync(stream, 65_536)) {
	console.log(piece.length);
	//=> 65536
	//=> 65536
	//=> 65536
	//=> ... (152 chunks of 64 KB each, plus remainder)
}
```

This enables HTTP clients like Got to report incremental upload progress instead of jumping from 0% to 100%.

## Performance

### `chunk()` - Zero-copy views

Uses `subarray()` which creates views of the original data without copying. This means chunking is extremely fast and memory-efficient, even for large buffers.

```js
import {chunk} from 'chunk-data';

const buffer = new Uint8Array(100_000_000); // 100 MB

for (const piece of chunk(buffer, 65_536)) {
	// No data copying - chunks are views into the original buffer
	// Chunking 100 MB takes <1ms
}
```

### `chunkFrom()` and `chunkFromAsync()` - Optimized copying

May copy data to coalesce small input chunks, but optimized to minimize copying:
- Emit zero-copy views from large input chunks whenever possible
- Only copy when combining small chunks to reach the desired chunk size
- Avoid O(n²) behavior by copying at most once per input chunk

This makes them efficient for both scenarios:
- Sources that emit large chunks (mostly zero-copy)
- Sources that emit many small chunks (minimal copying)

## When to use which?

- **`chunk()`** - When you have a single buffer in memory that you want to split into smaller pieces
- **`chunkFrom()`** - When you have multiple buffers (like an array or generator) that you want to re-chunk synchronously
- **`chunkFromAsync()`** - When you have a stream or async source that you want to re-chunk asynchronously

## Related

- [chunkify](https://github.com/sindresorhus/chunkify) - Split an iterable into evenly sized chunks
