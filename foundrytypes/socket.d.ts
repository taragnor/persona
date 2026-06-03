interface Socket {
	connected: boolean
	on(socketname: string, handler: Function): void;
	emit(socketname: string, payload: unknown): void;
}

// type StripTypes<T, Removed> =
//   T extends Removed ? never :
//   T extends (...args: any[]) => any ? never :
//   T extends readonly (infer U)[] ? StripTypes<U, Removed>[] :
//   T extends object ? {
//     [K in keyof T as
//       T[K] extends Removed
//       ? never
//       : T[K] extends (...args: any[]) => any
//       ? never
//       : K
//     ]: StripTypes<T[K], Removed>
//   }
//   : T;

// type StripFunctions<T> = StripTypes<T, Function>;


// type Functionless =
//   | string
//   | number
//   | boolean
//   | null
//   | undefined
//   | Functionless[]
//   |symbol
//   | { [key: string]: Functionless };




