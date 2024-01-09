interface Notifications {
	warn(msg: string): void;
	notify(msg: string): void;
	error(msg: string): void;
};

declare const ui : {
	notifications: Notifications,
}


