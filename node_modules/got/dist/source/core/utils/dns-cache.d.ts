import { type LookupOptions } from 'node:dns';
import { type LookupFunction } from 'node:net';
type DnsFamily = 4 | 6;
type DnsLookupOptions = Omit<LookupOptions, 'verbatim'> & {
    verbatim?: boolean;
};
type ResolverRecord = {
    address: string;
    ttl: number;
};
type Resolver = {
    resolve4(hostname: string, options: {
        ttl: true;
    }): Promise<ResolverRecord[]> | ResolverRecord[];
    resolve6(hostname: string, options: {
        ttl: true;
    }): Promise<ResolverRecord[]> | ResolverRecord[];
};
type DnsLookupResult = {
    address: string;
    family: DnsFamily;
};
type DnsCacheEntry = DnsLookupResult & {
    expires?: number;
};
type CachedFamily = {
    entries: DnsCacheEntry[];
    expires: number;
    clearVersion: number;
};
type MaybePromise<T> = T | Promise<T>;
type DnsCacheStore = {
    get(key: string): MaybePromise<CachedFamily | undefined>;
    set(key: string, value: CachedFamily): MaybePromise<unknown>;
    delete(key: string): boolean;
};
export type DnsCacheOptions = {
    cache?: DnsCacheStore;
    maxTtl?: number;
    fallbackDuration?: number;
    errorTtl?: number;
    resolver?: Resolver;
    lookup?: LookupFunction | false;
};
export type DnsCacheLookup = {
    lookup: LookupFunction;
    clear?(hostname?: string): void;
};
export default class DnsCache implements DnsCacheLookup {
    #private;
    readonly lookup: LookupFunction;
    constructor({ cache, maxTtl, fallbackDuration, errorTtl, resolver, lookup, }?: DnsCacheOptions);
    lookupAsync(hostname: string, options?: number | DnsLookupOptions): Promise<DnsLookupResult | DnsLookupResult[]>;
    clear(hostname?: string): void;
}
export {};
