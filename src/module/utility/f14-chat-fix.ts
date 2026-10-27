/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
const MODULE_ID = "persona";

export function chatFix() {

  Hooks.once("ready", () => {
    //@ts-expect-error trying chatGPT fix code
    libWrapper.register(
      MODULE_ID,
      "ChatLog.prototype.processMessage",
      function (wrapped: (arg0: any, arg1: {}) => any, message: string, options = {}) {
        // Leave empty messages and explicit slash commands alone.
        if (!message?.trim()) {
          return wrapped(message, options);
        }

        const [command] = this.constructor.parse(message);

        // Explicit commands such as /ooc retain their normal behavior.
        if (command !== "none") {
          return wrapped(message, options);
        }

        // A selected token means character chat; otherwise use GM chat.
        const mode = canvas.tokens.controlled.length > 0
          ? "ic"
          : "ooc";

        const settings = game.settings;
        const originalGet = settings.get;

        // Override only the message-mode lookup during synchronous setup.
        settings.get = function (namespace, key) {
          if (namespace === "core" && key === "messageMode") {
            return mode;
          }

          return originalGet.call(this, namespace, key);
        };

        try {
          // Foundry reads messageMode before its first await.
          // Restore the original setting getter immediately afterward.
          return wrapped(message, options);
        } finally {
          settings.get = originalGet;
        }
      },
      "WRAPPER"
    );

    console.info(`${MODULE_ID} | V13-style GM chat behavior enabled.`);
  });

}
