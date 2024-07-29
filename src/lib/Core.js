const fs = require("fs");
const path = require("path");
const { Client, IntentsBitField, ChannelType } = require("discord.js");
const Config = require("./Config");
const Logger = require("./Logger");
const VolumeEx = require("./file/VolumeEx");
const { DiscordFileProvider } = require("./storage/DiscordFileProvider");
const WebDAVServer = require("./webdav/WebDAVServer");
const FileDatabase = require("./file/FileDatabase");

class Core extends Client {
    constructor() {
        super({
            intents: [
                IntentsBitField.Flags.Guilds,
                IntentsBitField.Flags.GuildMessages
            ],
            rest: { timeout: 60_000 }
        });

        this.on("warn", (info) => Logger.warn(Logger.Type.Discord, info));

        this.provider = new DiscordFileProvider(this);

        this.tickIntervalTime = 1000;

        /** @type {NodeJS.Timeout} */
        this.tickInterval = null;

        /** @type {import("discord.js").Guild} */
        this._guild = null;

        /** @type {import("discord.js").TextChannel} */
        this._metaChannel = null;
        
        /** @type {import("discord.js").TextChannel} */
        this._filesChannel = null;

        /** @type {VolumeEx} */
        this.fs = null;

        /** @type {import("discord.js").Message} */
        this.metadataMessage = null;

        this.init();
    }

    async init() {
        Logger.info(Logger.Type.Discord, `Connecting to &cDiscord&r API...`);

        try {
            await super.login(Config.discordToken);
        } catch (error) {
            Logger.error(Logger.Type.Discord, `An &cunknown error&r has &coccured&r while trying to &clogin to Discord`, error);
            await this.shutdown();
        }

        Logger.info(Logger.Type.Discord, `Connected to &cDiscord&r API! &c${this.user.tag}&r (&c${this.user.id}&r)`);
        
        await this._loadGuild();
        await this._loadFileDatabase();

        this.tickInterval = setInterval(() => this._tick(), this.tickIntervalTime);

        this.webdavServer = new WebDAVServer(this);
        this.webdavServer.start();
    }

    /**
     * @private
     */
    async _loadGuild() {
        Logger.debug(Logger.Type.Discord, "Loading guild...");

        try {
            this._guild = await this.guilds.fetch(Config.discordGuildId);
            await this._guild.fetch();
            Logger.debug(Logger.Type.Discord, `Guild &c${this._guild.name}&r (&c${this._guild.id}&r) loaded!`);
        } catch (error) {
            Logger.error(Logger.Type.Discord, `An &cunknown error&r has &coccured&r while trying to &cfetch the guild&r`, error);
            await this.shutdown();
            return;
        }

        try {
            await this._guild.channels.fetch();
            Logger.debug(Logger.Type.Discord, "Channels fetched!");
        } catch (error) {
            Logger.error(Logger.Type.Discord, `An &cunknown error&r has &coccured&r while trying to &cfetch the channels&r`, error);
            await this.shutdown();
            return;
        }
    
        let _channels = () => this._guild.channels.cache.filter(channel => channel.type == ChannelType.GuildText);
        for (const channel of [ Config.discordChannelMeta, Config.discordChannelFiles ]) {
            if (_channels().some(c => c.name == channel)) continue;

            Logger.info(Logger.Type.Discord, `Creating channel &c${channel}&r`);
            await this._guild.channels.create({ name: channel, type: ChannelType.GuildText });
        }

        this._metaChannel = _channels().find(channel => channel.name == Config.discordChannelMeta);
        this._filesChannel = _channels().find(channel => channel.name == Config.discordChannelFiles);
        if (!this._metaChannel || !this._filesChannel) {
            Logger.error(Logger.Type.Discord, "Failed to find meta or files channel, shutting down...");
            await this.shutdown();
            return;
        }

        Logger.info(Logger.Type.Discord, `Meta channel: &c${this._metaChannel.name}&r (&c${this._metaChannel.id}&r)`);
        Logger.info(Logger.Type.Discord, `Files channel: &c${this._filesChannel.name}&r (&c${this._filesChannel.id}&r)`);
    }

    /**
     * @private
     */
    async _loadFileDatabase() {
        const messages = (await this.getAllMessages(this._metaChannel.id)).filter(message => message.author.id == this.user.id);

        if (messages.length == 0) {
            Logger.debug(Logger.Type.Discord, "No metadata message found, creating one...");

            await this._metaChannel.send({
                files: FileDatabase.from({}).toDiscordFiles(),
                content: JSON.stringify({ dbVersion: 1 })
            }).then((message) => this.metadataMessage = message);
        } else if (messages.length > 1) throw new Error("Multiple metadata messages found, this is not supported");
        else this.metadataMessage = messages[0];

        const dbs = [];
        try {
            const { dbVersion } = JSON.parse(this.metadataMessage.content);
            if (!dbVersion) throw new Error("Invalid database version");

            for (const attachment of this.metadataMessage.attachments.values()) {
                const order = attachment.name.match(/discordfs-(\d+)\.json/)[1];
                await fetch(attachment.url)
                    .then((response) => response.text())
                    .then((data) => dbs.push({ dbVersion, order, data }));
            }
        } catch (error) {
            if (error instanceof SyntaxError) {
                Logger.info(Logger.Type.Discord, `Migrating message ${this.metadataMessage.id} to new format...`);

                await this.metadataMessage.edit({
                        files: [{
                            name: "discordfs-0.json",
                            attachment: this.metadataMessage.attachments.first().url
                        }],
                        content: JSON.stringify({ dbVersion: 1 })
                    }).then(() => Logger.info(Logger.Type.Discord, "Migrated old metadata message to new format."))
                    .catch((error) => Logger.error(Logger.Type.Discord, "Failed to migrate old metadata message to new format:", error));
                
                return;
            }

            Logger.error(Logger.Type.Discord, "Failed to load metadata message:", error);
        }

        try {
            this.fs = VolumeEx.fromJSON(FileDatabase.fromDiscordMessage(dbs).getData());
            Logger.info(Logger.Type.Discord, "File database loaded successfully!");
        } catch (error) {
            Logger.error(Logger.Type.Discord, "Failed to load file database:", error);
            return await this.shutdown();
        }
    }

    
    /**
     * @returns {Promise<import("discord.js").Message[]>}
     */
    async getAllMessages(channelId) {
        const channel = await this._guild.channels.fetch(channelId);
        let messages = [];
        let lastMessageId;

        while (true) {
            const options = { limit: 100 };
            if (lastMessageId) options.before = lastMessageId;

            const channelMessages = [ ...(await channel.messages.fetch(options)).values() ];
            messages = messages.concat(channelMessages);
            Logger.debug(Logger.Type.Discord, `Fetched &c${channelMessages.length}&r messages from channel &c${channel.name}&r`);

            if (channelMessages.length < 100) break;
            lastMessageId = channelMessages.pop().id;
        }

        return messages;
    }
    
    /**
     * @param {boolean} [saveToDriveOnly = false]
     * @param {boolean} [driveSaveForce = false]
     */
    async saveFiles(saveToDriveOnly = false, driveSaveForce = false) {
        if (!this.fs) {
            Logger.error(Logger.Type.Discord, "Filesystem not initialized, cannot save files.");
            return;
        }

        Logger.debug(Logger.Type.Discord, "Saving file database...");
        try {
            if (Config.saveToDisk || driveSaveForce) {
                this._saveFileDatabaseToDrive();
    
                if (saveToDriveOnly) return;
            }
    
            const filedb = FileDatabase.from(this.fs.toJSON())
            await this.metadataMessage.edit({ files: filedb.toDiscordFiles() })
                .catch((error) => {
                    Logger.error(Logger.Type.Discord, "Failed to save file database to Discord:", error);
                    this._saveFileDatabaseToDrive();
                });

            Logger.info(Logger.Type.Discord, "File database saved successfully!");
        } catch (error) {
            Logger.error(Logger.Type.Discord, "Failed to save file database:", error);
        }
    }

    /**
     * @private
     */
    _saveFileDatabaseToDrive() {
        try {
            fs.writeFileSync(path.join(__dirname, "../data/files.json"), JSON.stringify(this.fs.toJSON()));
            Logger.info(Logger.Type.Discord, "File database saved to drive!");
        } catch (error) {
            Logger.error(Logger.Type.Discord, "Failed to save file database to drive:", error);
        }
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

        if (this.tickInterval) clearInterval(this.tickInterval);
        return process.exit(0);
    }
}

module.exports = new Core();