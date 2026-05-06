import Request from '../core/index.js';
import { type RequestPromise } from './types.js';
export default function asPromise<T>(firstRequest?: Request): RequestPromise<T>;
