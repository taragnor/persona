// type Cons<T extends abstract new (...args: any) => any> = { new: (...args: any[]) => InstanceType<T>;}
// }

interface Constructor<T = {}> {
  new (...args: any[]): T;
}

type Mixin<T extends Constructor<T>, G ={}> = Constructor<InstanceType<T> & G>;

class X { x: number;};
const Y = {
	y: 5,
};


function Mixing<A extends Constructor<any>,B extends {}>(a: A, b: B) : Mixin<A,B> {
	//@ts-ignore
	return class extends a implements B {
		constructor (...args: any[]) {
			super(...args);
		}
	};
}


const x = Mixing(X, Y);
const y = new x();


//APP v2 testing


const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api

class TestApp extends HandlebarsApplicationMixin(ApplicationV2) {

}

const test = new TestApp();

