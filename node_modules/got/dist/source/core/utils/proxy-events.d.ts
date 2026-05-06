import type { EventEmitter } from 'node:events';
export default function proxyEvents(from: EventEmitter, to: EventEmitter, events: readonly string[]): () => void;
