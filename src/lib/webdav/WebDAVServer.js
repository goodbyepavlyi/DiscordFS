const fs = require("fs");
const path = require("path");
const webdav = require("webdav-server").v2;
const Logger = require("../Logger");
const DiscordFilesystem = require("../storage/DiscordFilesystem");
const Config = require("../Config");

module.exports = class WebDAVServer {
    /**
     * @param {import("../Core")} core 
     */
    constructor(core) {
        this.core = core;

        this.serverOptions = {
            port: Config.webserverPort,
            rootFileSystem: new DiscordFilesystem(this.core)
        };

        if (Config.webserverEnableHttps) {
            if (!fs.existsSync(path.resolve(__dirname, "../../data/certs/privkey.pem"))) {
                Logger.error(Logger.Type.WebDAV, `No private key found at &c./data/certs/privkey.pem&r, please &cgenerate a self-signed certificate&r or &cdisable HTTPS&r.`);
                return process.exit(1);
            }

            if (!fs.existsSync(path.resolve(__dirname, "../../data/certs/cert.pem"))) {
                Logger.error(Logger.Type.WebDAV, `No certificate found at &c./data/certs/cert.pem&r, please &cgenerate a self-signed certificate&r or &cdisable HTTPS&r.`);
                return process.exit(1);
            }

            this.serverOptions.https = {
                key: fs.readFileSync(path.resolve(__dirname, "../../data/certs/privkey.pem")),
                cert: fs.readFileSync(path.resolve(__dirname, "../../data/certs/cert.pem"))
            }
        }

        if (Config.webserverUsers && Object.keys(Config.webserverUsers).length > 0) {
            Logger.info(Logger.Type.WebDAV, "Enabling authentication..");

            this.userManager = new webdav.SimpleUserManager();
            for (const user of Config.webserverUsers) 
                this.userManager.addUser(user.username, user.password);
            
            this.serverOptions.requireAuthentification = true;
            this.serverOptions.httpAuthentication = new webdav.HTTPBasicAuthentication(this.userManager);
        }

        this.server = new webdav.WebDAVServer(this.serverOptions);
    }

    start() {
        this.server.start(() => Logger.info(Logger.Type.WebDAV, `WebDAV server started on port ${this.serverOptions.port}`));
    }
}