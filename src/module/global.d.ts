type Option<T> = T | null;

type U<const T> = T | undefined;
type N<const T> = T | null;
type UN<const T> = T | undefined | null;

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


