export abstract class CacheBase<T> implements Cache<T> {
  private genFn : () => T;
  private _value : U<T> = undefined;

  clear() : void {
    this._value = undefined;
    this.onClear();
  }

  abstract onClear():void;

  constructor (genFn: () => T) {
    this.genFn = genFn;
  }

  regenerateCache() : T {
    return this._value = this.genFn();
  }

  abstract cacheInvalid(val: T) : boolean;

  get value() : T {
    if (!this._value || this.cacheInvalid(this._value)) {
      return this.regenerateCache();
    }
    return this._value;
  }

}


export class TimedCache<T> extends CacheBase<T> {
  private expirationTime: number;
  private lastAccessTime: number;

  static CACHE_EXPIRATION_THRESHOLD_TIME = 1000;

  constructor (genFn: () => T, expTime =TimedCache.CACHE_EXPIRATION_THRESHOLD_TIME ) {
    super(genFn);
    this.lastAccessTime = 0;
    this.expirationTime= expTime;

  }

  override cacheInvalid(_val: T): boolean {
    const now = Date.now();
    return (now - this.lastAccessTime > this.expirationTime);
  }

  override regenerateCache() : T {
    this.lastAccessTime = Date.now();
    return super.regenerateCache();
  }

  override onClear(): void {
    this.lastAccessTime = 0;
  }

}

export class PermanentCache<T> extends CacheBase<T> {
  override onClear(): void {
  }

  override cacheInvalid(_val: T): boolean {
    return false;
  }


}


interface Cache<T> {
  value: T;
  clear(): void;
}
