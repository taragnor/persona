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


export class MultiTierCache<
  CacheType extends CacheFactory<FullArgs, CacheBase<unknown>>,
  FullArgs extends unknown[] = Parameters<CacheType>,
  ValueList extends unknown[] = FullArgs,
  val extends FirstArg<ValueList> = FirstArg<ValueList>,
  restArgs extends RestArgs<ValueList> = RestArgs<ValueList>
  > {

    CacheConstructor: CacheType;
    map: Map<val, CacheOr<FullArgs, CacheType, restArgs>> = new Map();

    constructor (cacheConstructor: CacheType) {
      this.CacheConstructor = cacheConstructor;
    }

    private _get(fullArgs: FullArgs, args: restArgs): LastArg<ValueList> {
      const key = args.pop() as val;
      let v= this.map.get(key);
      if (!v) {
        const dataElement = ((args.length > 0)
          ? new MultiTierCache<CacheType, FullArgs, ValueList>(this.CacheConstructor)
          : this.CacheConstructor(...fullArgs)
        ) as CacheOr<FullArgs, CacheType, restArgs>;
        this.map.set(key, dataElement);
        v = dataElement;
      }
      if (v instanceof MultiTierCache) {
        //@ts-expect-error too complicated for TS
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        return v._get(fullArgs, args as any);
      } else {
        return (v as ReturnType<CacheType>).value as LastArg<ValueList>;
      }
    }

    get(...args: FullArgs) : LastArg<ValueList> {
      return this._get(args, args.slice() as restArgs);
    }


  }



export interface CacheI<T> {
  value: T;
  clear(): void;
}

type FirstArg<T extends unknown[]> =
  T extends [infer First, ...unknown[]] ? First : never;

type RestArgs<T extends unknown[]> =
  T extends [unknown, ...infer Rest] ? Rest : [];


type CacheOr<fullArgs extends unknown[],
  SingleCacheType extends CacheFactory<fullArgs, CacheBase<unknown>>,
  args extends unknown[] = RestArgs<fullArgs>,
  restArgs extends RestArgs<args> = RestArgs<args> >  =
  FirstArg<restArgs> extends never
  ? (ReturnType<SingleCacheType>)
  : MultiTierCache< SingleCacheType, fullArgs,restArgs>

type CacheFactory<ConsArgs extends unknown[], T extends CacheBase<unknown>>= (...args: ConsArgs) => T;

type LastArg<T extends unknown[]> =
  T extends [...unknown[], infer Last] ? Last : never;

type DropLast<T extends unknown[]> =
  T extends [...infer Rest, unknown] ? Rest : [];


//@ts-expect-error adding to global
window.testCache= function () {
  const x = new MultiTierCache( (name: {x:number}, val: number) => new TimedCache( () => name.x + val  )
  );
  return x;
};
