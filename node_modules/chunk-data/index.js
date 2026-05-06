const toUint8Array = data => (data instanceof Uint8Array
	? data
	: new Uint8Array(data.buffer, data.byteOffset, data.byteLength));

export function * chunk(data, chunkSize) {
	if (!ArrayBuffer.isView(data)) {
		throw new TypeError('Expected data to be ArrayBufferView');
	}

	if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
		throw new TypeError('Expected chunkSize to be a positive integer');
	}

	const uint8Array = toUint8Array(data);

	for (let offset = 0; offset < uint8Array.length; offset += chunkSize) {
		yield uint8Array.subarray(offset, offset + chunkSize);
	}
}

export function * chunkFrom(iterable, chunkSize) {
	if (typeof iterable?.[Symbol.iterator] !== 'function' || typeof iterable === 'string') {
		throw new TypeError('Expected iterable to be an Iterable<ArrayBufferView>');
	}

	if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
		throw new TypeError('Expected chunkSize to be a positive integer');
	}

	let carryBuffer;
	let carryLength = 0;

	for (const part of iterable) {
		if (!ArrayBuffer.isView(part)) {
			throw new TypeError('Expected iterable chunks to be Uint8Array or ArrayBufferView');
		}

		const buffer = toUint8Array(part);

		// Skip empty buffers
		if (buffer.length === 0) {
			continue;
		}

		let offset = 0;

		// Fill carry buffer to a full chunk if present
		if (carryLength > 0) {
			const needed = chunkSize - carryLength;
			if (buffer.length >= needed) {
				// Complete the chunk: merge carry + needed bytes from buffer
				const out = new Uint8Array(chunkSize);
				out.set(carryBuffer.subarray(0, carryLength), 0);
				out.set(buffer.subarray(0, needed), carryLength);
				yield out;
				carryLength = 0;
				offset = needed;
			} else {
				// Accumulate into fixed carry buffer (avoids O(n²) from repeated reallocations)
				// Safe: buffer.length < needed implies carryLength + buffer.length < chunkSize
				carryBuffer.set(buffer, carryLength);
				carryLength += buffer.length;
				continue;
			}
		}

		// Emit direct slices from current buffer
		for (; offset + chunkSize <= buffer.length; offset += chunkSize) {
			yield buffer.subarray(offset, offset + chunkSize);
		}

		// Save remainder in carry buffer
		if (offset < buffer.length) {
			carryBuffer ||= new Uint8Array(chunkSize);

			const remainder = buffer.length - offset;
			carryBuffer.set(buffer.subarray(offset), 0);
			carryLength = remainder;
		}
	}

	if (carryLength > 0) {
		yield carryBuffer.subarray(0, carryLength);
	}
}

export async function * chunkFromAsync(iterable, chunkSize) {
	if (typeof iterable?.[Symbol.asyncIterator] !== 'function' && typeof iterable?.[Symbol.iterator] !== 'function') {
		throw new TypeError('Expected iterable to be an async iterable or iterable');
	}

	if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
		throw new TypeError('Expected chunkSize to be a positive integer');
	}

	let carryBuffer;
	let carryLength = 0;

	for await (const part of iterable) {
		if (!ArrayBuffer.isView(part)) {
			throw new TypeError('Expected iterable chunks to be Uint8Array or ArrayBufferView');
		}

		const buffer = toUint8Array(part);

		// Skip empty buffers
		if (buffer.length === 0) {
			continue;
		}

		let offset = 0;

		// Fill carry buffer to a full chunk if present
		if (carryLength > 0) {
			const needed = chunkSize - carryLength;
			if (buffer.length >= needed) {
				// Complete the chunk: merge carry + needed bytes from buffer
				const out = new Uint8Array(chunkSize);
				out.set(carryBuffer.subarray(0, carryLength), 0);
				out.set(buffer.subarray(0, needed), carryLength);
				yield out;
				carryLength = 0;
				offset = needed;
			} else {
				// Accumulate into fixed carry buffer (avoids O(n²) from repeated reallocations)
				// Safe: buffer.length < needed implies carryLength + buffer.length < chunkSize
				carryBuffer.set(buffer, carryLength);
				carryLength += buffer.length;
				continue;
			}
		}

		// Emit direct slices from current buffer
		for (; offset + chunkSize <= buffer.length; offset += chunkSize) {
			yield buffer.subarray(offset, offset + chunkSize);
		}

		// Save remainder in carry buffer
		if (offset < buffer.length) {
			carryBuffer ||= new Uint8Array(chunkSize);

			const remainder = buffer.length - offset;
			carryBuffer.set(buffer.subarray(offset), 0);
			carryLength = remainder;
		}
	}

	if (carryLength > 0) {
		yield carryBuffer.subarray(0, carryLength);
	}
}
