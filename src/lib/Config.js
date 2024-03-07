const fs = require("fs");
const Logger = require("./Logger");

/**
 * @typedef {Object} ConfigData
 * @property {string} fileEncryptionKey
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
 * @property {string} encryption.key
 * @property {string} encryption.iv
 * @property {number} saveTimeout
 * @property {boolean} saveToDisk
*/
class Config {
    static configDirectory = "./data";
    static configPath = `${this.configDirectory}/config.json`

    /**
     * @returns {ConfigData} 
     */
    static getConfig() {
        if (this._config) {
            return this._config;
        }

        this._config = this.load();
        return this._config;
    }

    static saveConfig() {
        Logger.info(Logger.Type.Config, "Saving config..");

        if (!fs.existsSync(this.configDirectory)) {
            fs.mkdirSync(this.configDirectory);
        }

        fs.writeFileSync(this.configPath, JSON.stringify(this._config, null, 4));
    }

    /**
     * @returns {ConfigData} 
     */
    static getDefaultConfig = () => ({
        discord: {
            token: "CHANGE_ME",
            guildId: "CHANGE_ME",
            channelMeta: "discordfs-meta",
            channelFiles: "discordfs-files"
        },
        webserver: {
            port: 3000,
            enableHttps: true,
            users: [
                {
                    username: "admin",
                    password: "admin"
                }
            ]
        },
        encryption: {
            key: "LEAVE_EMPTY_IF_YOU_DONT_WANT_TO_ENCRYPT",
            iv: "LEAVE_EMPTY_IF_YOU_DONT_WANT_TO_ENCRYPT"
        },
        saveTimeout: 10000,
        saveToDisk: true
    });

    /**
     * @returns {ConfigData} 
     */
    static load() {
        if (!fs.existsSync(this.configPath)) {
            this._config = this.getDefaultConfig();
            this.saveConfig();
            return this._config;
        }

        const config = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        return config;
    }

    static get discordToken() {
        return this.getConfig().discord.token;
    }

    static get discordGuildId() {
        return this.getConfig().discord.guildId;
    }

    static get discordChannelMeta() {
        return this.getConfig().discord.channelMeta;
    }

    static get discordChannelFiles() {
        return this.getConfig().discord.channelFiles;
    }

    static get fileEncryptionKey() {
        return this.getConfig().fileEncryptionKey;
    }

    static get webserverPort() {
        return this.getConfig().webserver.port;
    }

    static get webserverEnableHttps() {
        return this.getConfig().webserver.enableHttps;
    }

    static get webserverUsers() {
        return this.getConfig().webserver.users;
    }

    static get saveTimeout() {
        return this.getConfig().saveTimeout;
    }

    static get saveToDisk() {
        return this.getConfig().saveToDisk;
    }

    static get encryptionKey() {
        return this.getConfig().encryption.key;
    }

    static get encryptionIV() {
        return this.getConfig().encryption.iv;
    }

    static get shouldEncrypt() {
        return this.encryptionKey && this.encryptionIV;
    }
}

Config.load();
module.exports = Config;