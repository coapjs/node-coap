import { BlockCacheMap } from '../models/models';
declare class BlockCache<T> {
    _retentionPeriod: number;
    _cache: BlockCacheMap<T>;
    _factory: () => T;
    /**
     *
     * @param retentionPeriod
     * @param factory Function which returns new cache objects
     */
    constructor(retentionPeriod: number | null | undefined, factory: () => T);
    private clearTimeout;
    reset(): void;
    /**
     * @param key
     * @param payload
     */
    add(key: string, payload: T): void;
    remove(key: string): boolean;
    contains(key: string): boolean;
    get(key: string): T | undefined;
    getWithDefaultInsert(key: string | null): T;
}
export default BlockCache;
