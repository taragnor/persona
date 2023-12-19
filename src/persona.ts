
function registerDataModels () {
	CONFIG.Actor.dataModels.pc = testSchema;
}


class testSchema extends window.foundry.abstract.DataModel {
	static override defineSchema() {
		const fields = window.foundry.data.fields;
		const ret = {
			description: new fields.StringField(),
			test : new fields.NumberField(),
		} as const;
		return ret;

		type X = SystemDataObject <typeof ret>



	}
}

type Y = ReturnType<(typeof testSchema)['defineSchema']>;
type Z = SystemDataObject<Y>;
type ZZ = SystemDataObjectFromDM<typeof testSchema>;

class MyActor extends Actor<typeof testSchema> {

}

let x = new MyActor();

