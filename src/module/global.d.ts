type Option<T> = T | null;

type U<const T extends unknown> = T | undefined;

type Expect<A, B> = (<T>() => T extends A ? 1 : 2) extends
                    (<T>() => T extends B ? 1 : 2) ? true : never;

type UniqueMembers<A, B> = A extends B ? never : A;

type ExpectNever<T> = Expect<T, never>;

type JSONAble = {
	toJSON() : string;
}
