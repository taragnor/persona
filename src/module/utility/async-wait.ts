export async function waitUntilTrue( fn: () => boolean) : Promise<void> {
	return await new Promise( (res, _rej) => {
		const interval = setInterval( () =>{
			if (fn())  {
				clearInterval(interval)
				res();
			}
		}, 500);
	});
}


export async function sleep(ms: number) : Promise<void> {
	return await new Promise( ( res, _rej) => {
		setTimeout( ()=> res(), ms);
	});


}
