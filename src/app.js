const Logger = require("./lib/Logger");
const core = require("./lib/Core");

async function shutdown() {
    try {
        await core.shutdown();

        // Need to exit here because otherwise the process would stay open
        process.exit(0);
    } catch (error) {
        Logger.error(Logger.Type.Watchdog, "An &cunknown error&r occured while &cshutting down&r, error:", error);
        process.exit(1);
    }
}

// Signal termination handler - used if the process is killed
process.on("SIGTERM", shutdown);

// Signal interrupt handler - if the process is aborted by Ctrl + C (during dev)
process.on("SIGINT", shutdown);

process.on("uncaughtException", (error, origin) => {
    Logger.error(Logger.Type.Watchdog, "An &cuncaught exception&r occured, error:", error);

    shutdown().catch(() => { /* intentional */ });
});

process.on("unhandledRejection", (reason, promise) => Logger.error(Logger.Type.Watchdog, "An &cunhandled promise rejection&r occured, error:", reason?.stack));
process.on("exit", (code) => Logger.info(Logger.Type.Watchdog, `&cExiting&r with &ccode ${code}&r...`));