export class CreateToken {
	// Ensure the user has permission to drop the actor and create a Token
	static async create<T extends Actor>(actor: T,  positionData: {x: number, y:number} & Partial<TokenDocument["position"]>, scene: Scene = canvas.scene): Promise<U<TokenDocument<T>>> {
		if (scene != canvas.scene) {
			throw new Error("This scene isn't the canvas scene");
		}
		if ( !game.user.can("TOKEN_CREATE") ) {
			ui.notifications.warn("You do not have permission to create new Tokens!");
			return undefined;
		}

    // Validate the drop position
    if ( !canvas.dimensions.rect.contains(positionData.x, positionData.y) ) {return undefined;}

    if ( !actor.isOwner ) {
      ui.notifications.warn(`You do not have permission to create a new Token for the ${actor.name} Actor.`);
		 return undefined;
    }
    if ( actor.inCompendium ) {
      const actorData = game.actors.fromCompendium(actor);
		 //@ts-expect-error doing weird stuff with constructor
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      actor = await actor.constructor.implementation.create(actorData, {fromCompendium: true});
    }

		// Prepare the Token document
		const tokenLayer = game.canvas.tokens;
		const token = await actor.getTokenDocument({
			hidden: false,
			sort: Math.max(tokenLayer.getMaxSort() + 1, 0)
		}, {parent: scene}) as TokenDocument<T>;

    // Set the position of the Token such that its center point is the drop position before snapping
    // const position = CONFIG.Token.objectClass._getDropActorPosition(token, {x: data.x, y: data.y,
    //   elevation: data.elevation}, {snap: !event.shiftKey});
		const position : typeof token["position"] = {
			x: positionData.x,
			y: positionData.y,
			elevation: positionData.elevation ?? 0,
			width: positionData.width ?? token._source.width as number,
			height: positionData.height ?? token._source.height as number,
			shape: token._source.shape,
		};
    await token.updateSource(position);

    // Submit the Token creation request and activate the Tokens layer (if not already active)
    tokenLayer.activate();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
    return (token.constructor as (typeof TokenDocument<T>)).create(token as any, {parent: scene});
  }

}
