import { Buffer } from 'node:buffer';
import { RequestError } from './errors.js';
import stripUrlAuth from './utils/strip-url-auth.js';
const decodedBodyCache = new WeakMap();
// Intentionally uses TextDecoder so the UTF-8 path strips a leading BOM.
const textDecoder = new TextDecoder();
export const isUtf8Encoding = (encoding) => encoding === undefined || encoding.toLowerCase().replace('-', '') === 'utf8';
export const decodeUint8Array = (data, encoding) => {
    if (isUtf8Encoding(encoding)) {
        return textDecoder.decode(data);
    }
    return Buffer.from(data).toString(encoding);
};
export const isResponseOk = (response) => {
    const { statusCode } = response;
    const { followRedirect } = response.request.options;
    const shouldFollow = typeof followRedirect === 'function' ? followRedirect(response) : followRedirect;
    const limitStatusCode = shouldFollow ? 299 : 399;
    return (statusCode >= 200 && statusCode <= limitStatusCode) || statusCode === 304;
};
/**
An error to be thrown when server response code is 2xx, and parsing body fails.
Includes a `response` property.
*/
export class ParseError extends RequestError {
    name = 'ParseError';
    code = 'ERR_BODY_PARSE_FAILURE';
    constructor(error, response) {
        const { options } = response.request;
        super(`${error.message} in "${stripUrlAuth(options.url)}"`, error, response.request);
    }
}
export const cacheDecodedBody = (response, decodedBody) => {
    decodedBodyCache.set(response, decodedBody);
};
export const parseBody = (response, responseType, parseJson, encoding) => {
    const { rawBody } = response;
    const cachedDecodedBody = decodedBodyCache.get(response);
    try {
        if (responseType === 'text') {
            if (cachedDecodedBody !== undefined) {
                return cachedDecodedBody;
            }
            return decodeUint8Array(rawBody, encoding);
        }
        if (responseType === 'json') {
            if (rawBody.length === 0) {
                return '';
            }
            const text = cachedDecodedBody ?? decodeUint8Array(rawBody, encoding);
            return parseJson(text);
        }
        if (responseType === 'buffer') {
            return rawBody;
        }
    }
    catch (error) {
        throw new ParseError(error, response);
    }
    throw new ParseError({
        message: `Unknown body type '${responseType}'`,
        name: 'Error',
    }, response);
};
