/* eslint-disable @typescript-eslint/member-ordering, @typescript-eslint/naming-convention, @typescript-eslint/no-restricted-types, @typescript-eslint/no-deprecated, promise/prefer-await-to-then */
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import http, { validateHeaderName, validateHeaderValue, } from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import { Writable, Readable } from 'node:stream';
import tls from 'node:tls';
import { urlToHttpOptions } from 'node:url';
import net from 'node:net';
import { TimeoutError } from '../timed-out.js';
const { HTTP2_HEADER_AUTHORITY, HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH, HTTP2_HEADER_SCHEME, HTTP2_HEADER_STATUS, HTTP2_METHOD_CONNECT, NGHTTP2_CANCEL, } = http2.constants;
const maxProtocolCacheSize = 100;
const protocolCache = new Map();
const referenceIds = new WeakMap();
let nextReferenceId = 0;
const connectionSpecificHeaders = new Set([
    'connection',
    'http2-settings',
    'keep-alive',
    'proxy-connection',
    'transfer-encoding',
    'upgrade',
]);
const normalizeRequestHeaderName = (name) => name.toLowerCase() === 'host' ? HTTP2_HEADER_AUTHORITY : name.toLowerCase();
const getConnectionHeaderTokens = (value) => {
    if (value === undefined) {
        return [];
    }
    const values = Array.isArray(value) ? value : [value];
    const tokens = [];
    for (const item of values) {
        for (const token of String(item).split(',')) {
            const normalizedToken = token.trim().toLowerCase();
            if (normalizedToken.length > 0) {
                tokens.push(normalizedToken);
            }
        }
    }
    return tokens;
};
const isTrailersTeHeader = (value) => {
    if (value === undefined) {
        return true;
    }
    if (Array.isArray(value)) {
        return value.length === 1 && value[0].toLowerCase() === 'trailers';
    }
    return String(value).trim().toLowerCase() === 'trailers';
};
const setProtocolCache = (key, value) => {
    if (!protocolCache.has(key) && protocolCache.size >= maxProtocolCacheSize) {
        protocolCache.delete(protocolCache.keys().next().value);
    }
    protocolCache.set(key, value);
};
const getReferenceId = (value) => {
    let referenceId = referenceIds.get(value);
    if (referenceId === undefined) {
        referenceId = nextReferenceId++;
        referenceIds.set(value, referenceId);
    }
    return referenceId;
};
const isPlainObject = (value) => {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};
const serializeSessionOption = (value) => {
    if (value === undefined) {
        return ['undefined'];
    }
    if (value === null) {
        return ['null'];
    }
    if (typeof value === 'function') {
        return ['function', getReferenceId(value)];
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return [typeof value, value];
    }
    if (typeof value === 'bigint') {
        return ['bigint', value.toString()];
    }
    if (typeof value === 'symbol') {
        return ['symbol', value.description];
    }
    if (Array.isArray(value)) {
        return ['array', value.map(item => serializeSessionOption(item))];
    }
    if (typeof value === 'object') {
        if (ArrayBuffer.isView(value)) {
            return ['bytes', Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64')];
        }
        if (isPlainObject(value)) {
            return ['object', Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, serializeSessionOption(item)])];
        }
        return ['object-reference', getReferenceId(value)];
    }
    return [typeof value];
};
const serializeSessionOptions = (values) => JSON.stringify(values.map(value => serializeSessionOption(value)));
const getTlsSessionOptions = (options) => [
    options.ca,
    options.cert,
    options.key,
    options.pfx,
    options.rejectUnauthorized,
    options.servername,
    options.localAddress,
    options.lookup,
    options.family,
    options.minVersion,
    options.maxVersion,
    options.ciphers,
    options.honorCipherOrder,
    options.checkServerIdentity,
    options.passphrase,
    options.sigalgs,
    options.sessionTimeout,
    options.dhparam,
    options.ecdhCurve,
    options.crl,
    options.secureOptions,
    options.secureContext,
    options.secureProtocol,
];
const destroyReuseSocket = (options) => {
    options._reuseSocket?.destroy();
    delete options._reuseSocket;
    delete options._reuseSocketShouldPool;
};
const normalizeInput = (input, options, callback) => {
    let normalizedOptions;
    if (typeof input === 'string') {
        normalizedOptions = urlToHttpOptions(new URL(input));
    }
    else if (input instanceof URL) {
        normalizedOptions = urlToHttpOptions(input);
    }
    else {
        normalizedOptions = { ...input };
    }
    if (typeof options === 'function' || options === undefined) {
        callback = options;
    }
    else {
        normalizedOptions = {
            ...normalizedOptions,
            ...options,
        };
    }
    return { options: normalizedOptions, callback };
};
const getAuthority = (options) => {
    const protocol = options.protocol ?? 'https:';
    const defaultPort = protocol === 'https:' ? 443 : 80;
    if (options.hostname === undefined && options.host !== undefined) {
        try {
            const authority = new URL(`${protocol}//${options.host}`);
            const port = options.port ?? authority.port;
            authority.port = String(port === '' ? defaultPort : port);
            return authority;
        }
        catch {
            // Fall back to hostname normalization for values like bare IPv6 addresses.
        }
    }
    const hostname = options.hostname ?? options.host ?? 'localhost';
    const port = options.port ?? defaultPort;
    const hostnameString = String(hostname);
    const normalizedHostname = hostnameString.startsWith('[') && hostnameString.endsWith(']')
        ? hostnameString.slice(1, -1)
        : hostnameString;
    const formattedHostname = net.isIP(normalizedHostname) === 6 ? `[${normalizedHostname}]` : normalizedHostname;
    const authority = new URL(`${protocol}//${formattedHostname}`);
    authority.port = String(port);
    return authority;
};
const getAuthorityPort = (authority) => {
    if (authority.port !== '') {
        return Number(authority.port);
    }
    return authority.protocol === 'https:' ? 443 : 80;
};
const getConnectionHostname = (authority) => {
    const { hostname } = authority;
    return hostname.startsWith('[') && hostname.endsWith(']')
        ? hostname.slice(1, -1)
        : hostname;
};
const hasCustomHttpsAgent = (agent) => typeof agent === 'object'
    && 'https' in agent
    && agent.https !== undefined
    && agent.https !== false;
const getProtocolCacheKey = (options) => {
    const authority = getAuthority(options);
    const protocols = (options.ALPNProtocols ?? ['h2', 'http/1.1']).join(',');
    return serializeSessionOptions([
        authority.host,
        protocols,
        ...getTlsSessionOptions(options),
    ]);
};
const resolveProtocol = async (options, sourceOptions) => {
    const cacheKey = getProtocolCacheKey(options);
    const cachedProtocol = options.createConnection ? undefined : protocolCache.get(cacheKey);
    if (cachedProtocol !== undefined) {
        return { alpnProtocol: cachedProtocol };
    }
    const authority = getAuthority(options);
    const { path: _path, agent: _agent, h2session: _h2session, _reuseSocket, _reuseSocketShouldPool, _alpnSocket, _socketTimeout, timeout, createConnection, checkServerIdentity, ...connectionOptions } = options;
    const port = getAuthorityPort(authority);
    const hostname = getConnectionHostname(authority);
    const servername = options.servername ?? (net.isIP(hostname) === 0 ? hostname : undefined);
    const tlsOptions = {
        ...connectionOptions,
        ALPNProtocols: options.ALPNProtocols ?? ['h2', 'http/1.1'],
        host: hostname,
        port,
        servername,
    };
    if (checkServerIdentity) {
        tlsOptions.checkServerIdentity = checkServerIdentity;
    }
    const socket = createConnection
        ? createConnection(tlsOptions, () => { })
        : tls.connect(port, hostname, tlsOptions);
    options._alpnSocket = socket;
    sourceOptions._alpnSocket = socket;
    return new Promise((resolve, reject) => {
        let settled = false;
        let timeoutId;
        let removeAbortListener;
        let socketTimeoutApplied = false;
        const cleanup = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            removeAbortListener?.();
            socket.off('secureConnect', onSecureConnect);
            socket.off('error', onError);
            socket.off('close', onClose);
            socket.off('connect', applySocketTimeout);
            socket.off('timeout', onSocketTimeout);
            if (socketTimeoutApplied) {
                socket.setTimeout(0);
            }
            delete options._alpnSocket;
            delete sourceOptions._alpnSocket;
        };
        const rejectOnce = (error) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            socket.destroy();
            reject(error);
        };
        const onSecureConnect = () => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            const alpnProtocol = socket.alpnProtocol ?? false;
            if (!options.createConnection) {
                setProtocolCache(cacheKey, alpnProtocol);
            }
            resolve({ alpnProtocol, socket });
        };
        const onError = (error) => {
            rejectOnce(error);
        };
        const onTimeout = () => {
            rejectOnce(new TimeoutError(Number(timeout), 'request'));
        };
        const onSocketTimeout = () => {
            rejectOnce(new TimeoutError(_socketTimeout, 'socket'));
        };
        const applySocketTimeout = () => {
            socketTimeoutApplied = true;
            socket.setTimeout(_socketTimeout);
            socket.once('timeout', onSocketTimeout);
        };
        const onClose = () => {
            const error = new Error('The HTTP/2 ALPN socket closed before negotiation completed');
            error.code = 'ECONNRESET';
            rejectOnce(error);
        };
        const onAbort = () => {
            const error = new Error('This operation was aborted.');
            error.name = 'AbortError';
            error.code = 'ERR_ABORTED';
            rejectOnce(error);
        };
        if (options.signal?.aborted) {
            onAbort();
            return;
        }
        socket.once('secureConnect', onSecureConnect);
        socket.once('error', onError);
        socket.once('close', onClose);
        if (_socketTimeout !== undefined) {
            if (socket.connecting) {
                socket.once('connect', applySocketTimeout);
            }
            else {
                applySocketTimeout();
            }
        }
        if (options.signal) {
            options.signal.addEventListener('abort', onAbort, { once: true });
            removeAbortListener = () => {
                options.signal?.removeEventListener('abort', onAbort);
            };
        }
        if (timeout !== undefined) {
            timeoutId = setTimeout(onTimeout, Number(timeout));
            timeoutId.unref();
        }
    });
};
const toRawHeaders = (headers) => {
    const rawHeaders = [];
    for (const [key, value] of Object.entries(headers)) {
        if (key.startsWith(':') || value === undefined) {
            continue;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                rawHeaders.push(key, item);
            }
        }
        else {
            rawHeaders.push(key, String(value));
        }
    }
    return rawHeaders;
};
const filterRawHeaders = (rawHeaders) => {
    const filteredHeaders = [];
    for (let index = 0; index < rawHeaders.length; index += 2) {
        const key = rawHeaders[index];
        if (key.startsWith(':')) {
            continue;
        }
        filteredHeaders.push(key, rawHeaders[index + 1]);
    }
    return filteredHeaders;
};
const filterHeaders = (headers) => {
    const filteredHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
        if (key.startsWith(':') || value === undefined) {
            continue;
        }
        filteredHeaders[key] = value;
    }
    return filteredHeaders;
};
const createSocketProxy = (stream) => new Proxy(stream.session.socket, {
    get(target, property, receiver) {
        if (property === 'destroy') {
            return stream.destroy.bind(stream);
        }
        if (property === 'destroyed') {
            return stream.destroyed;
        }
        if (property === 'setTimeout') {
            return stream.setTimeout.bind(stream);
        }
        return Reflect.get(target, property, receiver);
    },
});
class Http2IncomingMessage extends Readable {
    stream;
    req;
    constructor(stream, request_, highWaterMark) {
        super({
            autoDestroy: true,
            emitClose: false,
            highWaterMark,
        });
        this.stream = stream;
        this.req = request_;
        this.socket = request_.socket;
    }
    aborted = false;
    httpVersion = '2.0';
    httpVersionMajor = 2;
    httpVersionMinor = 0;
    complete = false;
    rawHeaders = [];
    rawTrailers = [];
    headers = {};
    trailers = {};
    statusCode;
    statusMessage;
    socket;
    url = '';
    method;
    upgrade = false;
    get connection() {
        return this.socket;
    }
    set connection(value) {
        this.socket = value;
    }
    setTimeout(ms, callback) {
        this.req.setTimeout(ms, callback);
        return this;
    }
    _destroy(error, callback) {
        if (!this.readableEnded) {
            this.aborted = true;
        }
        this.stream.destroy(error ?? undefined);
        callback();
    }
    _read() {
        this.stream.resume();
    }
    _dump() {
        this.removeAllListeners('data');
        this.resume();
    }
}
export class Http2Agent extends EventEmitter {
    timeout;
    maxSessions;
    maxEmptySessions;
    sessions = new Map();
    pendingSessions = new Set();
    pendingSessionKeys = new Set();
    queue = [];
    emptySessionCount = 0;
    sessionCount = 0;
    settings = {
        enablePush: false,
        initialWindowSize: 1024 * 1024 * 32,
    };
    constructor({ timeout = 0, maxSessions = Number.POSITIVE_INFINITY, maxEmptySessions = 10 } = {}) {
        super();
        this.timeout = timeout;
        this.maxSessions = maxSessions;
        this.maxEmptySessions = maxEmptySessions;
    }
    get protocol() {
        return 'https:';
    }
    async request(origin, options, headers, streamOptions) {
        const { session, reusedSocket } = await this.getSessionWithMetadata(origin, options, true);
        return {
            stream: session.request(headers, streamOptions),
            reusedSocket,
        };
    }
    async getSession(origin, options = {}) {
        const { session } = await this.getSessionWithMetadata(origin, options);
        return session;
    }
    async getSessionWithMetadata(origin, options = {}, reserveStream = false) {
        const normalizedOrigin = typeof origin === 'string' ? new URL(origin) : origin;
        const key = this.normalizeOptions(normalizedOrigin, options);
        const canUsePooledSession = options._reuseSocket === undefined || options._reuseSocketShouldPool === true;
        const session = canUsePooledSession ? this.getAvailableSession(key) : undefined;
        if (session) {
            if (reserveStream) {
                this.reserveStream(session);
            }
            destroyReuseSocket(options);
            return {
                session,
                reusedSocket: true,
            };
        }
        return new Promise((resolve, reject) => {
            const entry = {
                origin: normalizedOrigin,
                options,
                reserveStream,
                resolve,
                reject,
            };
            options._cancelSessionSetup = () => {
                const index = this.queue.indexOf(entry);
                if (index !== -1) {
                    this.queue.splice(index, 1);
                    delete options._cancelSessionSetup;
                    destroyReuseSocket(options);
                    reject(new Error('HTTP/2 session setup canceled'));
                }
            };
            this.queue.push(entry);
            this.processQueue();
        });
    }
    normalizeOptions(origin, options = {}) {
        return serializeSessionOptions([
            origin.origin,
            ...getTlsSessionOptions(options),
        ]);
    }
    closeEmptySessions(maxCount = Number.POSITIVE_INFINITY) {
        let closedCount = 0;
        for (const sessions of this.sessions.values()) {
            for (const session of sessions) {
                if ((session.currentStreamCount ?? 0) === 0) {
                    closedCount++;
                    session.close();
                    if (closedCount >= maxCount) {
                        return closedCount;
                    }
                }
            }
        }
        return closedCount;
    }
    destroy(reason) {
        for (const sessions of this.sessions.values()) {
            for (const session of sessions) {
                session.destroy(reason);
            }
        }
        for (const session of this.pendingSessions) {
            session.destroy(reason);
        }
        this.sessions.clear();
        this.pendingSessionKeys.clear();
        while (this.queue.length > 0) {
            const entry = this.queue.shift();
            delete entry.options._cancelSessionSetup;
            destroyReuseSocket(entry.options);
            entry.reject(reason ?? new Error('Agent has been destroyed'));
        }
    }
    getAvailableSession(key) {
        const sessions = this.sessions.get(key);
        if (!sessions) {
            return;
        }
        return sessions.find(session => !session.destroyed
            && !session.closed
            && !session.gracefullyClosing
            && (session.currentStreamCount ?? 0) < (session.remoteSettings.maxConcurrentStreams ?? 100));
    }
    processQueue() {
        let index = 0;
        while (index < this.queue.length) {
            const entry = this.queue[index];
            const key = this.normalizeOptions(entry.origin, entry.options);
            const canUsePooledSession = entry.options._reuseSocket === undefined || entry.options._reuseSocketShouldPool === true;
            const session = canUsePooledSession ? this.getAvailableSession(key) : undefined;
            if (session) {
                this.queue.splice(index, 1);
                delete entry.options._cancelSessionSetup;
                if (entry.reserveStream) {
                    this.reserveStream(session);
                }
                destroyReuseSocket(entry.options);
                entry.resolve({
                    session,
                    reusedSocket: true,
                });
                continue;
            }
            if (canUsePooledSession && this.pendingSessionKeys.has(key)) {
                index++;
                continue;
            }
            if (this.sessionCount >= this.maxSessions) {
                this.closeEmptySessions(this.sessionCount - this.maxSessions + 1);
                if (this.sessionCount >= this.maxSessions) {
                    index++;
                    continue;
                }
            }
            this.queue.splice(index, 1);
            if (canUsePooledSession) {
                this.pendingSessionKeys.add(key);
            }
            this.createSession(entry, key);
        }
    }
    reserveStream(session) {
        session.ref();
        if (session.currentStreamCount === 0 && session.emptySessionCounted) {
            this.emptySessionCount--;
            session.emptySessionCounted = false;
        }
        session.currentStreamCount = (session.currentStreamCount ?? 0) + 1;
        session.reservedStreamCount = (session.reservedStreamCount ?? 0) + 1;
    }
    releaseStream(session, shouldPoolSession) {
        session.currentStreamCount = session.currentStreamCount - 1;
        if (session.currentStreamCount === 0) {
            if (!shouldPoolSession) {
                session.close();
                this.processQueue();
                return;
            }
            this.emptySessionCount++;
            session.emptySessionCounted = true;
            session.unref();
            if (this.emptySessionCount > this.maxEmptySessions || session.gracefullyClosing) {
                session.close();
                return;
            }
        }
        this.processQueue();
    }
    createSession(entry, key) {
        this.sessionCount++;
        const { path: _path, agent: _agent, h2session: _h2session, _reuseSocketShouldPool, _socketTimeout, timeout: setupTimeout, ...sessionOptions } = entry.options;
        const options = {
            ...sessionOptions,
            settings: entry.options.settings ?? this.settings,
            ALPNProtocols: ['h2'],
        };
        const reuseSocket = options._reuseSocket;
        const shouldPoolSession = reuseSocket === undefined || _reuseSocketShouldPool === true;
        if (options._reuseSocket) {
            options.createConnection = () => reuseSocket;
            delete options._reuseSocket;
        }
        let session;
        try {
            session = http2.connect(entry.origin, options);
        }
        catch (error) {
            this.sessionCount--;
            this.pendingSessionKeys.delete(key);
            delete entry.options._cancelSessionSetup;
            reuseSocket?.destroy();
            entry.reject(error);
            this.processQueue();
            return;
        }
        this.pendingSessions.add(session);
        session.currentStreamCount = 0;
        session.reservedStreamCount = 0;
        session.emptySessionCounted = false;
        session.gracefullyClosing = false;
        let settled = false;
        let sessionSetupTimeout;
        let socketTimeoutApplied = false;
        const sessionSocket = session.socket;
        const removeSessionSocketListener = sessionSocket.removeListener.bind(sessionSocket);
        const clearSessionSetupTimeout = () => {
            if (sessionSetupTimeout) {
                clearTimeout(sessionSetupTimeout);
                sessionSetupTimeout = undefined;
            }
        };
        const clearSocketTimeout = () => {
            removeSessionSocketListener('connect', applySocketTimeout);
            if (!socketTimeoutApplied) {
                return;
            }
            socketTimeoutApplied = false;
            session.off('timeout', onSocketTimeout);
            if (!session.closed && !session.destroyed) {
                session.setTimeout(this.timeout);
            }
        };
        const clearSessionSetup = () => {
            clearSessionSetupTimeout();
            clearSocketTimeout();
            this.pendingSessions.delete(session);
            this.pendingSessionKeys.delete(key);
            delete entry.options._cancelSessionSetup;
        };
        const rejectSessionSetup = (error) => {
            if (settled) {
                return;
            }
            settled = true;
            clearSessionSetup();
            entry.reject(error);
            queueMicrotask(() => {
                session.destroy(error);
            });
        };
        const onSocketTimeout = () => {
            rejectSessionSetup(new TimeoutError(_socketTimeout, 'socket'));
        };
        const applySocketTimeout = () => {
            socketTimeoutApplied = true;
            session.setTimeout(_socketTimeout, onSocketTimeout);
        };
        if (this.timeout > 0) {
            session.setTimeout(this.timeout, () => {
                session.destroy();
            });
        }
        if (_socketTimeout !== undefined) {
            if (sessionSocket.connecting) {
                sessionSocket.once('connect', applySocketTimeout);
            }
            else {
                applySocketTimeout();
            }
        }
        if (setupTimeout !== undefined) {
            sessionSetupTimeout = setTimeout(() => {
                rejectSessionSetup(new TimeoutError(Number(setupTimeout), 'request'));
            }, Number(setupTimeout));
            sessionSetupTimeout.unref();
        }
        const removeSession = () => {
            if (session.emptySessionCounted) {
                this.emptySessionCount--;
                session.emptySessionCounted = false;
            }
            const sessions = this.sessions.get(key);
            if (sessions) {
                const index = sessions.indexOf(session);
                if (index !== -1) {
                    sessions.splice(index, 1);
                }
                if (sessions.length === 0) {
                    this.sessions.delete(key);
                }
            }
        };
        session.once('remoteSettings', () => {
            if (settled) {
                return;
            }
            settled = true;
            clearSessionSetup();
            if (shouldPoolSession) {
                const sessions = this.sessions.get(key) ?? [];
                sessions.push(session);
                this.sessions.set(key, sessions);
            }
            this.emit('session', session);
            if (entry.reserveStream) {
                this.reserveStream(session);
            }
            entry.resolve({
                session,
                reusedSocket: false,
            });
            this.processQueue();
        });
        session.once('error', error => {
            clearSessionSetup();
            if (!settled) {
                settled = true;
                entry.reject(error);
            }
            removeSession();
        });
        session.once('goaway', () => {
            session.gracefullyClosing = true;
            if (session.currentStreamCount === 0) {
                session.close();
            }
        });
        session.once('close', () => {
            clearSessionSetup();
            this.sessionCount--;
            if (!settled) {
                settled = true;
                entry.reject(new Error('The HTTP/2 session closed before settings were received'));
            }
            removeSession();
            this.processQueue();
        });
        entry.options._cancelSessionSetup = () => {
            if (settled) {
                return;
            }
            settled = true;
            clearSessionSetup();
            entry.reject(new Error('HTTP/2 session setup canceled'));
            session.destroy();
        };
        const request = session.request.bind(session);
        session.request = (headers, streamOptions) => {
            const hasReservedStream = (session.reservedStreamCount ?? 0) > 0;
            if (hasReservedStream) {
                session.reservedStreamCount = session.reservedStreamCount - 1;
            }
            if (session.gracefullyClosing) {
                if (hasReservedStream) {
                    this.releaseStream(session, shouldPoolSession);
                }
                throw new Error('The session is gracefully closing. No new streams are allowed.');
            }
            if (!hasReservedStream) {
                this.reserveStream(session);
            }
            let stream;
            try {
                stream = request(headers, streamOptions);
            }
            catch (error) {
                this.releaseStream(session, shouldPoolSession);
                throw error;
            }
            stream.once('close', () => {
                this.releaseStream(session, shouldPoolSession);
            });
            return stream;
        };
    }
}
class Http2ClientRequest extends Writable {
    constructor(input, options, callback) {
        super({
            autoDestroy: false,
            emitClose: false,
        });
        const normalized = normalizeInput(input, options, callback);
        this.options = normalized.options;
        this.callback = normalized.callback;
        this.method = (this.options.method ?? 'GET').toUpperCase();
        this.path = this.method === HTTP2_METHOD_CONNECT ? String(this.options.path ?? '') : String(this.options.path ?? '/');
        this.protocol = String(this.options.protocol ?? 'https:');
        this.headers = Object.create(null);
        if (this.protocol !== 'https:' && !this.options.h2session) {
            throw new Error(`Protocol "${this.protocol}" not supported. Expected "https:"`);
        }
        const headers = this.options.headers;
        if (headers) {
            for (const [key, value] of Object.entries(headers)) {
                this.setHeader(key, value);
            }
        }
        if (this.options.auth && !this.hasHeader('authorization')) {
            this.setHeader('authorization', `Basic ${Buffer.from(this.options.auth).toString('base64')}`);
        }
        if (this.callback) {
            this.once('response', this.callback);
        }
        const authority = getAuthority(this.options);
        this.origin = authority;
        if (!this.hasHeader(HTTP2_HEADER_AUTHORITY)) {
            this.headers[HTTP2_HEADER_AUTHORITY] = this.method === HTTP2_METHOD_CONNECT ? this.path : authority.host;
        }
        this.headers[HTTP2_HEADER_METHOD] = this.method;
        if (this.method !== HTTP2_METHOD_CONNECT) {
            this.headers[HTTP2_HEADER_SCHEME] = this.protocol.slice(0, -1);
            this.headers[HTTP2_HEADER_PATH] = this.path;
        }
    }
    agent;
    aborted = false;
    reusedSocket = false;
    res;
    socket;
    connection;
    method;
    path;
    protocol;
    host;
    headersSent = false;
    maxHeadersCount;
    options;
    callback;
    headers;
    origin;
    stream;
    pendingJobs = [];
    pendingAgentPromise;
    connectionHeaderNames = new Set();
    trailers;
    get isGotHttp2Request() {
        return true;
    }
    _write(chunk, encoding, callback) {
        const write = () => {
            this.stream.write(chunk, encoding, callback);
        };
        if (this.stream) {
            write();
        }
        else {
            this.pendingJobs.push({
                run: write,
                cancel: callback,
            });
        }
        void this.flushHeaders();
    }
    _final(callback) {
        const end = () => {
            if (this.trailers) {
                this.stream.once('wantTrailers', () => {
                    this.stream.sendTrailers(this.trailers);
                });
            }
            this.stream.end(callback);
        };
        if (this.stream) {
            end();
        }
        else {
            this.pendingJobs.push({
                run: end,
                cancel: callback,
            });
        }
        void this.flushHeaders();
    }
    _destroy(error, callback) {
        if (this.res && typeof this.res._dump === 'function') {
            this.res._dump();
        }
        if (this.stream) {
            this.stream.close(NGHTTP2_CANCEL);
        }
        else {
            this.options._cancelSessionSetup?.();
            if (error === null) {
                queueMicrotask(() => {
                    this.emit('close');
                });
            }
        }
        if (this.pendingAgentPromise) {
            void this.pendingAgentPromise.catch(() => { });
        }
        if (!this.stream) {
            this.cancelPendingJobs(error ?? new Error('The HTTP/2 request was destroyed before a stream was created'));
        }
        callback(error);
    }
    abort() {
        if (this.res?.complete) {
            return;
        }
        if (!this.aborted) {
            queueMicrotask(() => {
                this.emit('abort');
            });
        }
        this.aborted = true;
        this.destroy();
    }
    async flushHeaders() {
        if (this.headersSent || this.destroyed) {
            return;
        }
        this.headersSent = true;
        try {
            if (this.options.h2session) {
                this.reusedSocket = true;
                this.onStream(this.options.h2session.request(this.headers, {
                    endStream: false,
                    waitForTrailers: this.trailers !== undefined,
                }));
                return;
            }
            this.agent = this.options.agent === false ? new Http2Agent({ maxEmptySessions: 0 }) : this.options.agent ?? globalAgent;
            const streamPromise = this.agent.request(this.origin, this.options, this.headers, {
                endStream: false,
                waitForTrailers: this.trailers !== undefined,
            });
            this.pendingAgentPromise = streamPromise;
            const { stream, reusedSocket } = await streamPromise;
            this.reusedSocket = reusedSocket;
            this.onStream(stream);
            this.pendingAgentPromise = undefined;
        }
        catch (error) {
            this.pendingAgentPromise = undefined;
            this.destroy(error);
        }
    }
    addTrailers(headers) {
        if (this.headersSent) {
            throw new Error('Cannot add trailers after the HTTP/2 stream has been created');
        }
        const trailers = Object.create(null);
        const connectionHeaderNames = new Set();
        for (const [name, value] of Object.entries(headers)) {
            validateHeaderName(name);
            validateHeaderValue(name, value);
            const lowercasedName = name.toLowerCase();
            if (lowercasedName === 'connection' || lowercasedName === 'proxy-connection') {
                for (const token of getConnectionHeaderTokens(value)) {
                    connectionHeaderNames.add(token);
                    Reflect.deleteProperty(trailers, token);
                }
                continue;
            }
            if (connectionSpecificHeaders.has(lowercasedName)) {
                continue;
            }
            if (connectionHeaderNames.has(lowercasedName)) {
                continue;
            }
            if (lowercasedName === 'te' && !isTrailersTeHeader(value)) {
                continue;
            }
            trailers[lowercasedName] = value;
        }
        this.trailers = trailers;
    }
    setHeader(name, value) {
        if (this.headersSent) {
            throw new Error('Cannot set headers after they are sent to the client');
        }
        validateHeaderName(name);
        validateHeaderValue(name, value);
        const lowercasedName = name.toLowerCase();
        if (lowercasedName === 'connection' || lowercasedName === 'proxy-connection') {
            for (const token of getConnectionHeaderTokens(value)) {
                this.connectionHeaderNames.add(token);
                Reflect.deleteProperty(this.headers, normalizeRequestHeaderName(token));
            }
            return this;
        }
        if (connectionSpecificHeaders.has(lowercasedName)) {
            return this;
        }
        if (this.connectionHeaderNames.has(lowercasedName)) {
            return this;
        }
        if (lowercasedName === 'te' && !isTrailersTeHeader(value)) {
            return this;
        }
        this.headers[normalizeRequestHeaderName(name)] = value;
        return this;
    }
    getHeader(name) {
        return this.headers[normalizeRequestHeaderName(name)];
    }
    getHeaders() {
        return { ...this.headers };
    }
    getHeaderNames() {
        return Object.keys(this.headers);
    }
    hasHeader(name) {
        return this.getHeader(name) !== undefined;
    }
    removeHeader(name) {
        if (this.headersSent) {
            throw new Error('Cannot remove headers after they are sent to the client');
        }
        Reflect.deleteProperty(this.headers, normalizeRequestHeaderName(name));
    }
    setNoDelay() { }
    setSocketKeepAlive() { }
    setTimeout(ms, callback) {
        const applyTimeout = () => {
            this.stream.setTimeout(ms, callback);
        };
        if (this.stream) {
            applyTimeout();
        }
        else {
            this.pendingJobs.push({ run: applyTimeout });
        }
        return this;
    }
    cancelPendingJobs(error) {
        const jobs = this.pendingJobs;
        this.pendingJobs = [];
        for (const job of jobs) {
            job.cancel?.(error);
        }
    }
    onStream(stream) {
        this.stream = stream;
        this.socket = createSocketProxy(stream);
        this.connection = this.socket;
        if (this.destroyed) {
            stream.destroy();
            return;
        }
        stream.once('error', error => {
            if (this.destroyed) {
                return;
            }
            this.destroy(error);
        });
        stream.once('aborted', () => {
            if (this.res) {
                this.res.aborted = true;
                this.res.emit('aborted');
                this.res.destroy();
            }
            else {
                this.destroy(new Error('The server aborted the HTTP/2 stream'));
            }
        });
        stream.once('response', (headers, _flags, rawHeaders) => {
            const response = new Http2IncomingMessage(stream, this, stream.readableHighWaterMark);
            const incomingResponse = response;
            response.statusCode = Number(headers[HTTP2_HEADER_STATUS]);
            response.headers = filterHeaders(headers);
            response.rawHeaders = rawHeaders ? filterRawHeaders(rawHeaders) : toRawHeaders(headers);
            response.url = `${this.origin.origin}${this.path}`;
            incomingResponse.req = this;
            this.res = incomingResponse;
            stream.on('data', chunk => {
                if (!response.push(chunk)) {
                    stream.pause();
                }
            });
            stream.once('end', () => {
                if (!this.aborted) {
                    response.complete = true;
                    response.push(null);
                }
            });
            if (!this.emit('response', incomingResponse)) {
                response._dump();
            }
        });
        stream.on('headers', (headers, _flags, rawHeaders) => {
            this.emit('information', {
                statusCode: Number(headers[HTTP2_HEADER_STATUS]),
                statusMessage: '',
                httpVersion: '2.0',
                httpVersionMajor: 2,
                httpVersionMinor: 0,
                headers: filterHeaders(headers),
                rawHeaders: rawHeaders ? filterRawHeaders(rawHeaders) : toRawHeaders(headers),
            });
        });
        stream.once('trailers', (trailers, _flags, rawTrailers) => {
            if (!this.res) {
                return;
            }
            this.res.trailers = trailers;
            this.res.rawTrailers = Array.isArray(rawTrailers) ? rawTrailers : toRawHeaders(trailers);
        });
        stream.once('close', () => {
            if (this.res) {
                if (this.aborted) {
                    this.res.aborted = true;
                    this.res.emit('aborted');
                    this.res.destroy();
                }
                const finish = () => {
                    this.res.emit('close');
                    this.destroy();
                    this.emit('close');
                };
                if (this.res.readable) {
                    this.res.once('end', finish);
                }
                else {
                    finish();
                }
                return;
            }
            if (!this.destroyed) {
                this.destroy(new Error('The HTTP/2 stream has been early terminated'));
                queueMicrotask(() => {
                    this.emit('close');
                });
                return;
            }
            this.destroy();
            this.emit('close');
        });
        for (const job of this.pendingJobs) {
            job.run();
        }
        this.pendingJobs = [];
        this.emit('socket', this.socket);
    }
}
export const globalAgent = new Http2Agent();
export const request = (input, options, callback) => new Http2ClientRequest(input, options, callback);
const getSourceOptions = (input, options) => {
    if (typeof input === 'object' && !(input instanceof URL)) {
        return input;
    }
    return typeof options === 'object' ? options : {};
};
const requestHttp1 = (options, agent, callback) => {
    if (typeof agent === 'object' && 'https' in agent) {
        options.agent = agent.https;
    }
    options.ALPNProtocols = ['http/1.1'];
    delete options.timeout;
    delete options._socketTimeout;
    if (options.headers) {
        const headers = { ...options.headers };
        Reflect.deleteProperty(headers, HTTP2_HEADER_METHOD);
        Reflect.deleteProperty(headers, HTTP2_HEADER_SCHEME);
        Reflect.deleteProperty(headers, HTTP2_HEADER_PATH);
        if (headers[HTTP2_HEADER_AUTHORITY] && !headers.host) {
            headers.host = headers[HTTP2_HEADER_AUTHORITY];
        }
        Reflect.deleteProperty(headers, HTTP2_HEADER_AUTHORITY);
        options.headers = headers;
    }
    return https.request(options, callback);
};
const requestWithCustomHttpsAgent = (options, agent, callback) => {
    options.agent = agent.https;
    options.ALPNProtocols = ['http/1.1'];
    delete options.timeout;
    delete options._socketTimeout;
    return https.request(options, callback);
};
const requestHttp2 = (options, agent, socket, callback) => {
    options.agent = typeof agent === 'object' && 'http2' in agent ? agent.http2 : agent;
    if (socket) {
        options._reuseSocket = socket;
        options._reuseSocketShouldPool = options.createConnection === undefined;
    }
    return request(options, callback);
};
export const auto = async (input, options, callback) => {
    const sourceOptions = getSourceOptions(input, options);
    const normalized = normalizeInput(input, options, callback);
    options = normalized.options;
    callback = normalized.callback;
    options.ALPNProtocols ??= ['h2', 'http/1.1'];
    options.protocol ??= 'https:';
    if (options.h2session) {
        return request(options, callback);
    }
    const isHttps = options.protocol === 'https:';
    if (!isHttps) {
        options.agent = options.agent?.http;
        return http.request(options, callback);
    }
    const agent = options.agent;
    if (hasCustomHttpsAgent(agent) && options.createConnection === undefined) {
        return requestWithCustomHttpsAgent(options, agent, callback);
    }
    const { alpnProtocol, socket } = await resolveProtocol(options, sourceOptions);
    if (alpnProtocol === 'h2') {
        return requestHttp2(options, agent, socket, callback);
    }
    socket?.destroy();
    return requestHttp1(options, agent, callback);
};
const http2Client = {
    Agent: Http2Agent,
    auto,
    globalAgent,
    request,
};
export default http2Client;
