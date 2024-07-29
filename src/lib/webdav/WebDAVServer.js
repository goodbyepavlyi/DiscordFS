const fs = require("fs");
const path = require("path");
const webdav = require("webdav-server").v2;
const Logger = require("../Logger");
const DiscordFilesystem = require("../storage/DiscordFilesystem");
const Config = require("../Config");
const Utils = require("../utils/Utils");

module.exports = class WebDAVServer {
    /**
     * @param {import("../Core")} core 
     */
    constructor(core) {
        this.core = core;
        this.port = Config.webserverPort

        this.serverOptions = {
            port: this.port,
            rootFileSystem: new DiscordFilesystem(this.core)
        };

        if (Config.webserverEnableHttps) {
            Logger.info(Logger.Type.WebDAV, "Enabling HTTPS");

            if (!fs.existsSync(path.resolve(__dirname, "../../data/certs/privkey.pem"))) {
                Logger.error(Logger.Type.WebDAV, `No private key found at &c./data/certs/privkey.pem&r. Please generate a self-signed certificate or disable HTTPS.`);
                Logger.info(Logger.Type.WebDAV, `You can generate a self-signed certificate using &copenssl req -x509 -newkey rsa:4096 -keyout privkey.pem -out cert.pem -days 365&r`);
                return process.exit(1);
            }

            if (!fs.existsSync(path.resolve(__dirname, "../../data/certs/cert.pem"))) {
                Logger.error(Logger.Type.WebDAV, `No certificate found at &c./data/certs/cert.pem&r. Please generate a self-signed certificate or disable HTTPS.`);
                Logger.info(Logger.Type.WebDAV, `You can generate a self-signed certificate using &copenssl req -x509 -newkey rsa:4096 -keyout privkey.pem -out cert.pem -days 365&r`);
                return process.exit(1);
            }

            this.serverOptions.https = {
                key: Utils.readFileSyncOrUndefined(path.resolve(__dirname, "../../data/certs/privkey.pem")),
                cert: Utils.readFileSyncOrUndefined(path.resolve(__dirname, "../../data/certs/cert.pem"))
            }
        }

        if (Config.webserverUsers && Object.keys(Config.webserverUsers).length > 0) {
            Logger.info(Logger.Type.WebDAV, "Enabling authentication..");

            this.userManager = new webdav.SimpleUserManager();
            for (const user of Config.webserverUsers) {
                this.userManager.addUser(user.username, user.password);
            }
            
            this.serverOptions.requireAuthentification = true;
            this.serverOptions.httpAuthentication = new webdav.HTTPBasicAuthentication(this.userManager, "Default realm");
        }

        this.server = new webdav.WebDAVServer(this.serverOptions);
    }

    async start() {
        this.server.start(() => Logger.info(Logger.Type.WebDAV, `WebDAV server started on port ${this.port}`));
    }
}