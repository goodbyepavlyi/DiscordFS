const fs = require("fs");
const Logger = require("./Logger");

/**
 * @typedef {Object} ConfigData
 * @property {Object} discord
 * @property {string} discord.token
 * @property {import("discord.js").Snowflake} discord.guildId
 * @property {string} discord.channelMeta
 * @property {string} discord.channelFiles
 * @property {Object} webserver
 * @property {number} webserver.port
 * @property {boolean} webserver.enableHttps
 * @property {Object[]} webserver.users
 * @property {string} webserver.users.username
 * @property {string} webserver.users.password
 * @property {object} encryption
 * @property {boolean} encryption.enabled
 * @property {string} encryption.key
 * @property {string} encryption.iv
 * @property {number} saveTimeout
 * @property {boolean} saveToDisk
*/
class Config {
    static configDirectory = "./data";
    static configPath = `${this.configDirectory}/config.json`;

    /**
     * @returns {ConfigData} 
     */
    static getConfig() {
        if (this._config) return this._config;

        this._config = this.loadConfig();
        return this._config;
    }

    static saveConfig() {
        try {
            Logger.debug(Logger.Type.Config, "Saving config to disk...");
            if (!fs.existsSync(this.configDirectory)) {
                Logger.debug(Logger.Type.Config, "Config directory not found, creating it...");
                fs.mkdirSync(this.configDirectory);
            }

            fs.writeFileSync(this.configPath, JSON.stringify(this._config, null, 4));
            Logger.info(Logger.Type.Config, "Config saved to disk");
        } catch (error) {
            Logger.error(Logger.Type.Config, "An error occured while saving the config to disk, error:", error);
        }
    }

    /**
     * @returns {ConfigData} 
     */
    static getDefaultConfig = () => ({
        version: 1,
        discord: {
            token: "CHANGE_ME",
            guildId: "CHANGE_ME",
            channelMeta: "discordfs-meta",
            channelFiles: "discordfs-files"
        },
        webserver: {
            port: 3000,
            enableHttps: false,
            users: [
                {
                    username: "admin",
                    password: "admin"
                }
            ]
        },
        encryption: {
            enable: false,
            key: null,
            iv: null
        },
        saveTimeout: 10000,
        saveToDisk: true
    });

    /**
     * @returns {ConfigData} 
     */
    static loadConfig() {
        if (!fs.existsSync(this.configPath)) {
            this._config = this.getDefaultConfig();
            this.saveConfig();
            return this._config;
        }

        try {
            const config = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
            return config;
        } catch (error) {
            if (error instanceof SyntaxError) 
                Logger.error(Logger.Type.Config, "An error occured while parsing the config file, error:", error);

            return null;
        }
    }

    static get discordToken() { return this.getConfig().discord.token; }
    static get discordGuildId() { return this.getConfig().discord.guildId; }
    static get discordChannelMeta() { return this.getConfig().discord.channelMeta; }
    static get discordChannelFiles() { return this.getConfig().discord.channelFiles; }

    static get webserverPort() { return this.getConfig().webserver.port; }
    static get webserverEnableHttps() { return this.getConfig().webserver.enableHttps; }
    static get webserverUsers() { return this.getConfig().webserver.users; }

    static get saveTimeout() { return this.getConfig().saveTimeout; }
    static get saveToDisk() { return this.getConfig().saveToDisk; }

    static get encryptionEnabled() { return this.encryptionKey && this.encryptionIV; }
    static get encryptionKey() { return this.getConfig().encryption.key; }
    static get encryptionIV() { return this.getConfig().encryption.iv; }
}

Config.loadConfig();
module.exports = Config;