class X {
	static instance: InstanceType<typeof this> = new X();
}

class Y extends X {
	static override instance: InstanceType<typeof this> = new Y();

}

