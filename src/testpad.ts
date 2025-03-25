const testO = {
	xxxx: "hello",
};

type RR = typeof testO;

interface X {
	j: number;
}

interface Y extends RR {
	x: number;
}

interface Y extends X  {
	b: number;
}



//@ts-ignore
let x: Y = window;


//interesting develpment here
