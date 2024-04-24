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
