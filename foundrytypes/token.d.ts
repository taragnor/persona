class TokenDocument<T extends Actor<any, any>> extends FoundryDocument<never>
	{
		actorId: string;
		actorLink: boolean;
		actor?: T;
		parent: Scene;
		name: string;
		baseActor: T;
		_object: Token<T>;
		override get documentName(): "token";
		get inCombat(): boolean;
		get combatant(): Combatant;
		get isLinked(): boolean;
		sight: SightObject;



}

 type SightObject = Record < string, any>;


//this is canvas stuff so I've ignored it for now
class Token<Act extends Actor<any, any>> extends PlaceableObject {
	actor: Act;
}


//this is canvas stuff so I've ignored it for now
class PlaceableObject {}


