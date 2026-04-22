type Option<T> = T | null;

type U<const T> = T | undefined;
type N<const T> = T | null;
type UN<const T> = T | undefined | null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DistributiveOmit<T, K extends keyof T> = T extends any
  ? Omit<T, K>
  : never

type Expect<A, B> = (<T>() => T extends A ? 1 : 2) extends
                    (<T>() => T extends B ? 1 : 2) ? true : never;

type UniqueMembers<A, B> = A extends B ? never : A;

type ExpectNever<T> = Expect<T, never>;

type JSONAble = {
	toJSON() : string;
}

type DeepReadonly<T> = T extends (infer R)[] ? DeepReadonlyArray<R> :
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	T extends Function ? T :
	T extends string ? T
	: T extends object ? DeepReadonlyObject<T> :
	T;

type DeepReadonlyArray<T> = ReadonlyArray<DeepReadonly<T>>

type DeepReadonlyObject<T> = {
	readonly [P in keyof T]: DeepReadonly<T[P]>;
};

type MaybeArray<T> = T | T[];

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

  type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

/** Used to denote an unknown type but the T allows documented suggestions as to what the type should be. Often used for caught unknowns */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Unknown<T> = unknown;

type MergeUnion<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in T extends any ? keyof T : never]?:
    T extends { [P in K]?: infer V } ? V : never;
};

type ValidProp<T extends object> = {
  [K in keyof Required<T>]: T[K] extends unknown ? NonNullable<T[K]>: never
};



type HasKey<T, K extends keyof MergeUnion<T>> =
  T extends unknown
    ? K extends keyof T
      ? T
      : never
    : never;

type NonNullableProps<T> =
  T extends unknown
    ? { [K in keyof T]: NonNullable<T[K]> }
    : never;
