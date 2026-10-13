import { EventEmitter } from 'node:events';
import { type ClientRequest, type IncomingMessage } from 'node:http';
import http2, { type ClientHttp2Session, type ClientHttp2Stream } from 'node:http2';
import { type RequestOptions as HttpsRequestOptions } from 'node:https';
import tls from 'node:tls';
import { type Socket } from 'node:net';
type RequestCallback = (response: IncomingMessage) => void;
type RequestHeaders = Record<string, string | string[] | number | undefined>;
type Http2AgentOptions = {
    timeout?: number;
    maxSessions?: number;
    maxEmptySessions?: number;
};
type Http2Session = ClientHttp2Session & {
    currentStreamCount?: number;
    reservedStreamCount?: number;
    emptySessionCounted?: boolean;
    gracefullyClosing?: boolean;
};
type QueueEntry = {
    origin: URL;
    options: NormalizedRequestOptions;
    reserveStream: boolean;
    resolve: (result: AgentSessionResult) => void;
    reject: (error: Error) => void;
};
type AgentSessionResult = {
    session: Http2Session;
    reusedSocket: boolean;
};
type AgentRequestResult = {
    stream: ClientHttp2Stream;
    reusedSocket: boolean;
};
type NormalizedRequestOptions = Omit<HttpsRequestOptions, 'agent' | 'createConnection'> & {
    agent?: any;
    createConnection?: any;
    ALPNProtocols?: string[];
    secureContext?: tls.ConnectionOptions['secureContext'];
    secureProtocol?: tls.ConnectionOptions['secureProtocol'];
    settings?: http2.Settings;
    h2session?: ClientHttp2Session;
    _reuseSocket?: Socket;
    _reuseSocketShouldPool?: boolean;
    _alpnSocket?: Socket;
    _cancelSessionSetup?: () => void;
    _socketTimeout?: number;
};
export declare class Http2Agent extends EventEmitter {
    readonly timeout: number;
    readonly maxSessions: number;
    readonly maxEmptySessions: number;
    readonly sessions: Map<string, Http2Session[]>;
    readonly pendingSessions: Set<Http2Session>;
    readonly pendingSessionKeys: Set<string>;
    readonly queue: QueueEntry[];
    emptySessionCount: number;
    sessionCount: number;
    settings: http2.Settings;
    constructor({ timeout, maxSessions, maxEmptySessions }?: Http2AgentOptions);
    get protocol(): 'https:';
    request(origin: URL, options: NormalizedRequestOptions, headers: RequestHeaders, streamOptions?: http2.ClientSessionRequestOptions): Promise<AgentRequestResult>;
    getSession(origin: string | URL, options?: NormalizedRequestOptions): Promise<Http2Session>;
    private getSessionWithMetadata;
    normalizeOptions(origin: URL, options?: NormalizedRequestOptions): string;
    closeEmptySessions(maxCount?: number): number;
    destroy(reason?: Error): void;
    private getAvailableSession;
    private processQueue;
    private reserveStream;
    private releaseStream;
    private createSession;
}
export declare const globalAgent: Http2Agent;
export declare const request: (input: string | URL | NormalizedRequestOptions, options?: NormalizedRequestOptions | RequestCallback, callback?: RequestCallback) => ClientRequest;
export declare const auto: (input: string | URL | NormalizedRequestOptions, options?: NormalizedRequestOptions | RequestCallback, callback?: RequestCallback) => Promise<ClientRequest>;
declare const http2Client: {
    Agent: typeof Http2Agent;
    auto: (input: string | URL | NormalizedRequestOptions, options?: NormalizedRequestOptions | RequestCallback, callback?: RequestCallback) => Promise<ClientRequest>;
    globalAgent: Http2Agent;
    request: (input: string | URL | NormalizedRequestOptions, options?: NormalizedRequestOptions | RequestCallback, callback?: RequestCallback) => ClientRequest;
};
export default http2Client;
