/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-return */
//Start of fix for actors directory and private names

//NOTE: To implement class for an actor the actor must have a getter for property directoryName
declare global {
	interface HOOKS {
		"encryptionEnable": () => void;
	}
}

const ActorDirectory = foundry.applications.sidebar.tabs.ActorDirectory;

export class EnhancedActorDirectory {

	static init(systemPath: string) {
		try {
			this._init(systemPath);
		} catch (e) {
			if (e instanceof Error) {
				console.log(e.stack);
				throw new Error(`Problem with Active Directory init : ${e.message}`);
			}
		}

	}

	private static _init (systemPath: string) {
		Hooks.on( "encryptionEnable", () => {
			ui.actors.render(true);
		});

		const oldRender = ActorDirectory.prototype.render;
		if (!oldRender) {
			console.warn("Error setting up active directory");
			return;
		}

		// @ts-expect-error doing some monkeypatching stuff
		ActorDirectory.prototype.render = async function (...args) {
			// console.log("Decrypting All");
			const promises = game.actors.contents.map( async (actor: Actor) => {
				if ("decryptData" in actor && typeof actor.decryptData == "function"){
					await actor.decryptData();
				}
			});
			await Promise.all(promises);
			await oldRender.call(this, ...args);
		};

		Hooks.on("updateActor", async (actor, _diff) => {
			//NOTE: There's probably a better way to just re-render the actor instead of drawing the whole sidebar, but I don't know what that is right now
			if ("decryptData" in actor && typeof actor.decryptData == "function") {
				await actor.decryptData();
			}
			/*
			////@ts-ignore
			//if (diff?.system?.mythos) {
			//	//compabitlity with TaragnorSecurity Module
			//	ui.actors.render(true);
			//	return true;
			//}
			////@ts-ignore
			//if (!actor.isToken && diff?.prototypeToken?.name) { ui.actors.render(true); }
			//return true;
*/
		});



		const _getEntryContextOptionsOldCity = ActorDirectory.prototype._getEntryContextOptions;

		//Sets window title to directory Name on character sheets
		Object.defineProperty(ActorSheet.prototype, 'title', {
			get: function() { return this.actor.directoryName; }
		});

		//Default Value if it hasn't been defined
		Object.defineProperty(Actor.prototype, 'directoryName', {
			get: function() { return this.name; }
		});


		ActorDirectory.prototype._getEntryContextOptions = function() {
			const options = _getEntryContextOptionsOldCity.call(this);
			for (const option of options) {
				switch (option.name) {
					case "SIDEBAR.CharArt":
						option.callback = (htmlE: HTMLElement) => {
							const li = $(htmlE);
							const id = li ? li.data("documentId") : undefined;
							if (!id) {return;}

							const actor = game.actors.get(id) as DirectoryActor;
							if (!actor) {return;}

							new ImagePopout(actor.img, {
								title: actor.directoryName || actor.name,
								// shareable: true,
								uuid: actor.uuid
							}).render(true);
						};
						break;
					case "SIDEBAR.TokenArt":
						option.callback = (htmlE : HTMLElement) => {
							const li = $(htmlE);
							const id = li ? li.data("documentId") : undefined;
							if (!id) {return;}
							const actor = game.actors.get(id);
							if (!actor) {return;}
							new ImagePopout(actor.prototypeToken?.texture?.src ?? actor.img, {
								title: "directoryName" in actor ? actor.directoryName as string : actor.name,
								shareable: true,
								uuid: actor.uuid
							}).render(true);
						};
						break;
					default:
						break;
				}
			}
			// Debug(options);
			return options;
		};

		/// @ts-expect-error doing crazy monkeypatching
		ActorDirectory._entryPartial =  `${systemPath}/module/enhanced-directory/enhanced-template.hbs`;
		// ActorDirectory._entryPartial =  "systems/city-of-mist/module/enhanced-directory/enhanced-template.hbs";

		//@ts-expect-error monkeypatching
		ActorDirectory.prototype._matchSearchEntries = function(query : string, entryIds : EntryId[], folderIds: string[], autoExpandIds: boolean, _options={}) {
			//@ts-expect-error monkeypatching
    const nameOnlySearch = this.collection.searchMode === CONST.DIRECTORY_SEARCH_MODES.NAME;
    const entries = this.collection.index ?? this.collection.contents;

    // Copy the folderIds to a new set, so that we can add to the original set without incorrectly adding child entries.
    const matchedFolderIds = new Set(folderIds);

    for ( const entry of entries ) {
      const entryId = entry._id;

		 // If we matched a folder, add its child entries.
		 if ( matchedFolderIds.has(entry.folder?._id ?? entry.folder) ) {
			 //@ts-expect-error monkeypatch
			 entryIds.add(entryId);
		 }

      // Otherwise, if we are searching by name, match the entry name.
		 const moddedName = entry?.directoryName ?? entry.name;
		 //@ts-expect-error monkeypatch
      if ( nameOnlySearch && query.test(foundry.applications.ux.SearchFilter.cleanQuery(moddedName)) ) {
		 //@ts-expect-error monkeypatch
        entryIds.add(entryId);
        this.onMatchFolder(entry.folder, folderIds, autoExpandIds);
      }
    }

    if ( nameOnlySearch ) {return;}

			// Full text search.
			//@ts-expect-error monkeypatch
			const matches = this.collection.search({ query: query.source, exclude: Array.from(entryIds) });
			for ( const match of matches ) {
				//@ts-expect-error monkeypatch
				if ( entryIds.has(match._id) ) {continue;}
				//@ts-expect-error monkeypatch
				entryIds.add(match._id);
				//@ts-expect-error monkeypatch
				this.onMatchFolder(entry.folder, folderIds, autoExpandIds);
			}
		};

		//@ts-expect-error monkeypatch
		ActorDirectory.prototype.onMatchFolder= function(folder: Folder, folderIds: string[], autoExpandIds: boolean, { autoExpand=true }={}) {
			//@ts-expect-error monkeypatch
			if ( typeof folder === "string" ) {folder = game.packs.folders.get(folder);}
			if ( !folder ) {return;}
			//@ts-expect-error monkeypatch
			const folderId = folder._id;
			//@ts-expect-error monkeypatch
			const visited = folderIds.has(folderId);
			//@ts-expect-error monkeypatch
			folderIds.add(folderId);
			//@ts-expect-error monkeypatch
			if ( autoExpand ) {autoExpandIds.add(folderId);}
			if ( !visited && folder.folder ) {
				this.onMatchFolder(folder.folder, folderIds, autoExpandIds);
			}
		};

		ActorDirectory._sortAlphabetical = function (a: DirectoryActor, b: DirectoryActor) {
			if (a?.directoryName && b?.directoryName)
				{return a.directoryName.localeCompare(b.directoryName);}
			else {return a.name.localeCompare(b.name);}
		};

		console.log("Enhanced directory applied");
	}

		static refresh() {
			ui.actors.render(true);
		}

} //end of class


type EntryId = {
	add(str: string): void
}

type DirectoryActor = Actor & {
	directoryName ?: string;
};
