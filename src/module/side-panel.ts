import {PersonaError} from "./persona-error.js";

export abstract class SidePanel {
	panelName: string;
	HTMLPanel: U<JQuery<HTMLElement>>;
	iterations : number = 0;

	get CSSClassName() : string {
		return `.${this.panelName}`;
	}

	abstract get templatePath() : string;

	constructor (panelName: string) {
		if (panelName.startsWith(".")) {
			throw new PersonaError(`Can't start Sidepanel name ${panelName} with period.`);
		}
		this.panelName = panelName;
	}

	clearPanel() {
		const infoPanel = $(document).find(this.CSSClassName);
		if (infoPanel.length) {
			infoPanel.remove();
		}
		this.HTMLPanel = undefined;
	}

	doesPanelExist() : boolean {
		if (!this.HTMLPanel) {return false;}
		const infoPanel = $(document).find(this.CSSClassName);
		return infoPanel.length > 0;
	}

	async updatePanel(templateData: Record<string, unknown> = {}) : Promise<void> {
		if (!this.doesPanelExist()) {
			this.createContainer();
		}
		const panel = this.HTMLPanel;
		if (!panel) {
			throw new PersonaError(`Can't find side panel for ${this.panelName}: This shoudl be impossible`);
		}
		panel.empty();
		templateData = {
			...await this.getData(),
			...templateData,
			_iteration : this.iterations,
		};
		this.iterations++;
		const html = await foundry.applications.handlebars.renderTemplate(this.templatePath, templateData);
		panel.html(html);
		this.activateListeners($(panel));
	}

	activateListeners(_html: JQuery<HTMLElement>): void {
	}

	getData () : Promise<Record<string, unknown>> | Record<string, unknown> {
		return {};
	}

	private createContainer() : SidePanel["HTMLPanel"] {
		// console.log("Creating Container");
		const infoPanel = $("<section>").addClass(this.panelName);
		const chatNotifications = $(document).find("#interface #ui-right-column-1 #chat-notifications");
		const chatContainer= $("<div>")
			.addClass("custom-side-panel-chat-container");
		$(document).find("#interface #ui-right-column-1").prepend(chatContainer);
		const chatNotificationsContainer = $("<div>").addClass("chat-notifications-container");
		chatNotificationsContainer.append(chatNotifications);
		chatContainer.append(infoPanel)
			.append(chatNotificationsContainer);
		this.HTMLPanel = infoPanel;
		return this.HTMLPanel;
	}

}
