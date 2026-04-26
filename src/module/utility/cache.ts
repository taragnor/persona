export abstract class CacheBase<T> implements CacheI<T> {
  private genFn : () => T;
  private _value : U<T> = undefined;
  private _testModeEqualityTest: U<((oldVal: T, newVal: T) => boolean)>;

  clear() : void {
    this._value = undefined;
    this.onClear();
  }

  setTestMode(equalityTest : CacheBase<T>["_testModeEqualityTest"]) {
    this._testModeEqualityTest = equalityTest;
  }

  abstract onClear():void;

  constructor (genFn: () => T) {
    this.genFn = genFn;
  }

  protected regenerateCache() : T {
    return this._value = this.genFn();
  }

  protected abstract cacheInvalid(val: T) : boolean;

  get value() : T {
    if (this._testModeEqualityTest != undefined && this._value != undefined) {
      const oldValue = this._value;
      const newValue = this.regenerateCache();
      if (!this._testModeEqualityTest(oldValue, newValue)) {
        console.warn("Cache Equality Test: Cache Doesn't match");
        console.log(oldValue);
        console.log(newValue);
      }
    }
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


export interface CacheI<T> {
  value: T;
  clear(): void;
}
