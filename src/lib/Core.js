const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client, IntentsBitField, ChannelType } = require("discord.js");
const Config = require("./Config");
const Logger = require("./Logger");
const VolumeEx = require("./file/VolumeEx");
const { DiscordFileProvider, MAX_REAL_CHUNK_SIZE } = require("./storage/DiscordFileProvider");
const WebDAVServer = require("./webdav/WebDAVServer");

class Core extends Client {
    constructor() {
        super({
            intents: [
                IntentsBitField.Flags.Guilds, 
                IntentsBitField.Flags.GuildMessages
            ],
            rest: {
                timeout: 60_000
            }
        });

        this.on("warn", (info) => Logger.warn(Logger.Type.Discord, info));

        this.guildId = Config.discordGuildId;
        this.provider = new DiscordFileProvider(this);

        this.tickIntervalTime = 1000;

        /** @type {NodeJS.Timeout} */
        this.tickInterval = null;

        /** @type {import("discord.js").Guild} */
        this.guild = null;

        /** @type {import("discord.js").TextChannel} */
        this.metaChannel = null;
        
        /** @type {import("discord.js").TextChannel} */
        this.filesChannel = null;

        /** @type {VolumeEx} */
        this.fs = null;

        /** @type {import("discord.js").Message} */
        this.metadataMessage = null;

        this._login();
    }

    /**
     * @private
     */
    async _login() {
        Logger.info(Logger.Type.Discord, `Connecting to &cDiscord&r API...`);

        try {
            await super.login(Config.discordToken);
        } catch (error) {
            Logger.error(Logger.Type.Discord, `An unknown error has occured while trying to login to Discord`, error);
            await this.shutdown();
        }

        Logger.info(Logger.Type.Discord, `Connected to &cDiscord&r API!`);
        Logger.info(Logger.Type.Discord, `User: &c${this.user.tag}&r`);
        Logger.info(Logger.Type.Discord, `ID: &c${this.user.id}&r`);

        this.init();
    }

    async init() {
        await this._preload();
        await this._loadFiles();

        this.tickInterval = setInterval(() => this._tick(), this.tickIntervalTime);

        Logger.info(Logger.Type.WebDAV, "Starting WebDAV server...");
        this.webdavServer = new WebDAVServer(this);
        await this.webdavServer.start();
    }

    /**
     * @private
     */
    async _preload() {
        Logger.info(Logger.Type.Discord, "Fetching guilds...");
        await this.guilds.fetch();

        if (!this.guilds.cache.has(this.guildId)) {
            Logger.error(Logger.Type.Discord, `Guild with ID &c${this.guildId}&r not found. Is the bot in the guild?`);
            await this.shutdown();
        }

        const guild = await this.guilds.cache.get(this.guildId)?.fetch();
        if (!guild) {
            Logger.error(Logger.Type.Discord, `Error fetching Guild with ID &c${this.guildId}&r.`);
            await this.shutdown();
        }

        this.guild = guild;
        Logger.info(Logger.Type.Discord, `Guild: &c${this.guild.name}&r (&c${this.guild.id}&r)`);

        Logger.info(Logger.Type.Discord, "Fetching channels...");
        await this.guild.channels.fetch();
    
        let channels = this.guild.channels.cache.filter(channel => channel.type == ChannelType.GuildText);
        let wasChannelCreated = false;

        for (const channel of [ Config.discordChannelMeta, Config.discordChannelFiles ]) {
            if (channels.some(c => c.name == channel)) {
                continue;
            }

            Logger.info(Logger.Type.Discord, `Creating channel &c${channel}&r`);
            await this.guild.channels.create({ name: channel, type: ChannelType.GuildText });
            wasChannelCreated = true;
        }

        // Caching again, because we created new ones
        if (wasChannelCreated) {
            Logger.debug(Logger.Type.Discord, "Re-fetching channels...");
            await this.guild.channels.fetch();
            channels = this.guild.channels.cache.filter(channel => channel.type == ChannelType.GuildText);
        }

        this.metaChannel = channels.find(channel => channel.name == Config.discordChannelMeta);
        this.filesChannel = channels.find(channel => channel.name == Config.discordChannelFiles);

        Logger.info(Logger.Type.Discord, `Meta Channel: &c${this.metaChannel.name}&r (&c${this.metaChannel.id}&r)`);
        Logger.info(Logger.Type.Discord, `Files Channel: &c${this.filesChannel.name}&r (&c${this.filesChannel.id}&r)`);
    }

    /**
     * @param {string} channelId 
     * @returns {Promise<import("discord.js").Message[]>}
     */
    async getAllMessages(channelId) {
        const channel = await this.guild.channels.fetch(channelId);
        let messages = [];
        let last;

        while (true) {
            const options = { limit: 100 };
            if (last) {
                options.before = last;
            }

            const channelMessages = [ ...(await channel.messages.fetch(options)).values() ];
            messages = messages.concat(channelMessages);
            Logger.debug(Logger.Type.Discord, `Fetched &c${channelMessages.length}&r messages from channel &c${channel.name}&r`);

            if (channelMessages.length < 100) {
                break;
            }

            last = channelMessages.pop().id;
        }

        return messages;
    }

    async _encryptDatabase(data = {}) {
        const key = crypto.createHash('sha512').update(Config.encryptionKey).digest('hex').substring(0, 32);
        const encryptionIV = crypto.createHash('sha512').update(Config.encryptionIV).digest('hex').substring(0, 16);
        
        const cipher = crypto.createCipheriv("aes-256-cbc", key, encryptionIV);
        const buffer = Buffer.from(cipher.update(JSON.stringify(data), 'utf8', 'hex') + cipher.final('hex'));

        return buffer;
    }

    _decryptDatabase(buffer) {
        const key = crypto.createHash('sha512').update(Config.encryptionKey).digest('hex').substring(0, 32);
        const encryptionIV = crypto.createHash('sha512').update(Config.encryptionIV).digest('hex').substring(0, 16);

        const decipher = crypto.createDecipheriv("aes-256-cbc", key, encryptionIV);
        return decipher.update(buffer.toString('utf8'), 'hex', 'utf8') + decipher.final('utf8');
    }

    /**
     * @private
     */
    async _loadFiles() {
        const messages = await this.getAllMessages(this.metaChannel.id);
        let message;

        // TODO: Read databases from more than one message
        // Check if there is a message with the metadata info. If not, create one.
        if (messages.length == 0) {
            Logger.info(Logger.Type.Discord, "No metadata message found, creating one...");

            const db = Config.shouldEncrypt ? await this._encryptDatabase({}) : Buffer.from("{}");
            message = await this.metaChannel.send({
                files: [{
                    attachment: db,
                    name: "discordfs.json"
                }],
                content: `# DiscordFS metadata file
\`\`\`ansi
[2;31mDO NOT DELETE THIS MESSAGE[0m\`\`\``
            });
        } else if (messages.length == 1) {
            message = messages[0];
        } else {
            throw new Error("Invalid amount of messages in metadata channel, there should only be one message. Maybe wrong channel is provided?");
        }

        if (message.attachments.size != 1) {
            throw new Error("Invalid amount of attachments in metadata message");
        }

        const attachment = message.attachments.first();
        if (attachment.name != "discordfs.json") {
            throw new Error(`Invalid attachment name in metadata message, expected discordfs.json, got: ${attachment.name}`);
        }

        // TODO: Make this better
        const response = await fetch(attachment.url);
        try {
            const data = await response.text();
            const database = JSON.parse(Config.shouldEncrypt ? this._decryptDatabase(data) : data);

            this.fs = VolumeEx.fromJSON(database);
            this.metadataMessage = message;

            Logger.info(Logger.Type.Discord, "Files loaded successfully!");
        } catch (error) {
            Logger.error(Logger.Type.Discord, "Failed to parse JSON file. Is the file corrupted?", error);
            return await this.shutdown();
        }
    }
    
    /**
     * @param {boolean} saveToDriveOnly 
     * @param {boolean} driveSaveForce 
     */
    async saveFiles(saveToDriveOnly = false, driveSaveForce = false) {
        if (!this.fs) {
            Logger.error(Logger.Type.Discord, "Filesystem not initialized, cannot save files.");
            return;
        }

        Logger.info(Logger.Type.Discord, "Saving files...");

        if (Config.saveToDisk || driveSaveForce) {
            this._saveToDrive();

            if (saveToDriveOnly) {
                return;
            }
        }

        const json = this.fs.toJSON();
        const file = JSON.stringify(json);
        const buffer = Config.shouldEncrypt ? await this._encryptDatabase(json) : Buffer.from(file);

        // TODO: Save databases into more messages if it's too big
        await this.metadataMessage.edit({
            files: [{
                name: "discordfs.json",
                attachment: buffer
            }],
            content: `# DiscordFS metadata file
**Last saved:** ${new Date().toLocaleString()}
**Files:** ${Object.keys(json).length} files
**Database size:** ${file.length} bytes (${Math.floor(file.length / MAX_REAL_CHUNK_SIZE * 100)} %)
**Total Size:** ${Math.floor(this.fs.getTreeSizeRecursive("/") / 1000 / 1000)} MB
\`\`\`ansi
[2;31mDO NOT DELETE THIS MESSAGE[0m\`\`\``
        }).catch((error) => {
            Logger.error(Logger.Type.Discord, "Failed to save metadata message:", error);
            this._saveToDrive();
        });
    }

    /**
     * @private
     */
    _saveToDrive() {
        const dbPath = path.join(__dirname, "../data/files.json");
        Logger.info(Logger.Type.Discord, `Saving files to disk... (${dbPath})`);
        fs.writeFileSync(dbPath, JSON.stringify(this.fs.toJSON()));
    }

    /**
     * Method that indicates that files were changed and should be saved to the provider.
    */
    markForUpload() {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = undefined;
        }

        this.debounceTimeout = setTimeout(() => {
            this.debounceTimeout = undefined;
            this.saveFiles();
        }, Config.saveTimeout);
    }
    
    /**
     * Handler for the tick interval. This will delete messages from the deletion queue.
     * Queue is used to prevent ratelimiting and blocking the bot from doing other things.
     * @private
     */
    async _tick() {
        await this.provider.processDeletionQueue();
    }

    async shutdown() {
        Logger.info(Logger.Type.Discord, "Shutting down...");
        await this.saveFiles(false, true);

        if (this.tickInterval) {
            clearInterval(this.tickInterval);
        }
        
        return process.exit(0);
    }
}

module.exports = new Core();