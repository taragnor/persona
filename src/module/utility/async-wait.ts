export async function waitUntilTrue( fn: () => boolean, intervalinMS = 500) : Promise<void> {
	return await new Promise( (res, _rej) => {
		const interval = setInterval( () =>{
			if (fn())  {
				clearInterval(interval);
				res();
			}
		}, intervalinMS);
	});
}


export async function sleep(ms: number) : Promise<void> {
	return await new Promise( ( res, _rej) => {
		setTimeout( ()=> res(), ms);
	});


}

