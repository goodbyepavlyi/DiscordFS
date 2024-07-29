const Config = require("../Config");
const { MaxRealChunkSize } = require("../storage/DiscordFileProvider");
const Encryption = require("../utils/Encryption");

module.exports = class FileDatabase {
    /**
     * @param {object} data 
     */
    constructor(data) {
        if (typeof data !== "object") throw new Error("data must be an object");
        this.data = data;
    }

    getData() {
        return this.data;
    }

    static from(data) {
        return new FileDatabase(data);
    }

    static _encryptData(data) {
        if (!Config.encryptionEnabled) throw new Error("Encryption is not enabled");
        if (!data) throw new Error("data is required");
        return Buffer.from(Encryption.encrypt(data));
    }

    static _decryptData(data) {
        if (!Config.encryptionEnabled) throw new Error("Encryption is not enabled");
        if (!data) throw new Error("data is required");
        return Encryption.decrypt(data);
    }

    /**
     * @param {{ dbVersion: number, order: number, data: any }[]} dbs
     * @returns {FileDatabase}
     */
    static fromDiscordMessage(dbs) {
        const dbVersions = dbs.map(db => db.dbVersion);
        const areAllDbVersionsSame = dbVersions.every(version => version === dbVersions[0]);
        if (!areAllDbVersionsSame) throw new Error("All dbVersions must be the same");
        
        try {
            const data = dbs.sort((a, b) => a.order - b.order).map(db => {
                if (Config.encryptionEnabled) 
                    return FileDatabase._decryptData(db.data);

                return db.data;
            }).join("");

            return new FileDatabase(JSON.parse(data));
        } catch (error) {
            if (error instanceof SyntaxError) 
                throw new Error("Failed to parse JSON data from discord message, database may be corrupted", error);

            throw error;
        }
    }

    /**
     * @returns {import("discord.js").AttachmentData[]}
     */
    toDiscordFiles() {
        let dataBuffer = Buffer.from(JSON.stringify(this.data));
        if (Config.encryptionEnabled) 
            dataBuffer = FileDatabase._encryptData(dataBuffer);

        return FileDatabase._splitBuffer(dataBuffer).map((chunk, index) => ({
            name: `discordfs-${index}.json`,
            attachment: chunk
        }));
    }

    /**
     * @param {Buffer} buffer 
     * @returns {Buffer[]}
     */
    static _splitBuffer(buffer) {
        const chunks = [];
        for (let i = 0; i < buffer.length; i += MaxRealChunkSize) 
            chunks.push(buffer.slice(i, i + MaxRealChunkSize));

        return chunks;
    }
}