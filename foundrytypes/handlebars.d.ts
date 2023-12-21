declare class Handlebars {
	static registerHelper(name: string, fn: (...args: any[])=> any): void;

}

declare function loadTemplates(templatePaths: readonly string[]);


