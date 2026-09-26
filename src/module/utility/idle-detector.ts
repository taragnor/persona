export class IdleDetector {
  private timer?: number;
  private lastActivity = Date.now();

  constructor(
    private idleTime: number,
    private onIdle?: () => void,
    private onActive?: () => void,
    private heartbeat?: (isActive: boolean) => void,
  ) {}

  start(): void {
    $(document).on(
      "mousemove.idleDetector " +
      "mousedown.idleDetector " +
      "keydown.idleDetector " +
      "touchstart.idleDetector " +
      "scroll.idleDetector " +
      "wheel.idleDetector " +
      "pointerdown.idleDetector " +
      "pointermove.idleDetector",
      () => this.activity()
    );

    this.resetTimer();
  }

  stop(): void {
    $(document).off(".idleDetector");

    if (this.timer !== undefined) {
      window.clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private activity(): void {
    const wasIdle = Date.now() - this.lastActivity >= this.idleTime;

    this.lastActivity = Date.now();
    this.resetTimer();

    if (wasIdle) {
      this.onActive?.();
    }
    this.heartbeat?.(true);
  }

  private resetTimer(): void {
    if (this.timer !== undefined) {
      window.clearTimeout(this.timer);
    }
    this.timer = window.setTimeout(() => {
      this.onIdle?.();
      this.heartbeat?.(false);
    }, this.idleTime);
  }
}

