const crypto = require("crypto");
const { Writable, Readable } = require("stream");
const Logger = require("../Logger");
const Config = require("../Config");

module.exports = class BaseProvider {
    /**
     * @param {import("../Core")} core 
     */
    constructor(core) {
        this.core = core;

        /** @type {{ channelId: import("discord.js").Snowflake, messageId: import("discord.js").Snowflake }[]} */
        this.fileDeletionQueue = [];
    }

    /**
     * @param {import("discord.js").Snowflake} channelId
     * @param {import("discord.js").Snowflake} messageId
     */
    addToDeletionQueue(channelId, messageId) {
        if (!channelId || !messageId) throw new Error("channelId and messageId are required");
        this.fileDeletionQueue.push({ channelId, messageId });
    }
    
    /**
     * @private
     * @param {boolean} autoDestroy 
     */
    createEncryptor(autoDestroy = true) {
        // This is probably bad idea, but I don't know how to fix it.
        const cipher = crypto.createCipher("chacha20-poly1305", Config.encryptionKey+Config.encryptionIV, { autoDestroy, authTagLength: 16 });
        cipher.once("error", (error) => Logger.error(Logger.Type.FileProvider, "An error occurred while encrypting file", error));

        return cipher;
    }

    /**
     * @private
     * @param {boolean} autoDestroy 
     */
    createDecryptor(autoDestroy = true) {
        // This is probably bad idea, but I don't know how to fix it.
        const decipher = crypto.createDecipher("chacha20-poly1305", Config.encryptionKey+Config.encryptionIV, { autoDestroy, authTagLength: 16 });
        decipher.once("error", (error) => Logger.error(Logger.Type.FileProvider, "An error occurred while decrypting file", error));

        // backport to nodejs 16.14.2
        if (decipher.setAuthTag) {
            decipher.setAuthTag(Buffer.alloc(16, 0));
        }

        return decipher;
    }

    /**
     * @private
     * @param {import("../DocTypes").IFile} file 
     * @returns {Promise<Readable>}
     */
    async createReadStreamWithDecryption(file) {
        Logger.debug(Logger.Type.FileProvider, `Creating read stream for file ${file.name} with decryption...`);
        const stream = await this.createRawReadStream(file);
        const decipher = this.createDecryptor();

        // calling .end on decipher stream will throw an error and not emit end event. so we need to do this manually. 
        decipher.once("unpipe", () => {
            setImmediate(() => { // idk if this work as it should... but looks like it does.
                decipher.emit("end");
                decipher.destroy();
            });
        });

        return stream.pipe(decipher, { end: false });
    }

    /**
     * @param {import("../DocTypes").IFile} file 
     * @param {IWriteStreamCallbacks} callbacks 
     * @returns {Promise<Writable>}
     */
    async createWriteStreamWithEncryption(file, callbacks) {
        Logger.debug(Logger.Type.FileProvider, `Creating write stream for file ${file.name} with encryption...`);
        const stream = await this.createRawWriteStream(file, callbacks);
        const cipher = this.createEncryptor(false);

        // The problem is that the encryption stream is closing before the write stream is flushed all its data.
        // Since we give the encryption stream back and it closes too early, the write stream stream is not flushed all its data in provider, what results in a corrupted file or telling client at wrong time that the file is uploaded, when it is not. 
        // this is why we need to wait for the write stream to finish before we close the encryption stream.
        cipher.pipe(stream);

        const pt = new Writable({
            write: (chunk, encoding, callback) => {
                cipher.write(chunk, encoding, callback);
            },
            final: (callback) => {
                cipher.end();
                stream.once("finish", () => {
                    callback();
                });
            }
        });

        stream.on("error", (error) => {
            Logger.error(Logger.Type.FileProvider, "An error occurred while uploading file", error);
            pt.destroy(error);
            cipher.emit("end");
            cipher.destroy();
        });

        stream.on("finish", () => {
            pt.end();
            cipher.emit("end");
            cipher.destroy();
        });

        return pt;
    }

    /**
     * Main method that should be used to download files from provider.
     * Creates read stream for downloading files from provider. Handles decryption if enabled.
     * Does not handle with any fs operations, only downloads from provider.
     * @param {import("../DocTypes").IFile} file 
     * @returns {Promise<Readable>} 
     */
    createReadStream(file) {
        if (Config.encryptionEnabled) return this.createReadStreamWithDecryption(file);
        return this.createRawReadStream(file);
    }

    /**
     * @param {import("../DocTypes").IFile} file 
     * @param {IWriteStreamCallbacks} callbacks 
     * @returns {Promise<Writable>}
     */
    createWriteStream(file, callbacks) {
        if (Config.encryptionEnabled) return this.createWriteStreamWithEncryption(file, callbacks);
        return this.createRawWriteStream(file, callbacks);
    }

    /**
     * @param {string} name 
     * @param {number} size 
     * @returns {import("../DocTypes").IFile}
     */
    createVFile = (name, size) => ({
        name,
        size,
        chunks: [],
        created: new Date(),
        modified: new Date()
    });
    
    /**
     * Method that should be used to implement queue for deleting files from provider. Queue is used to prevent ratelimiting and other blocking issues.
     * @abstract
     */
    async processDeletionQueue() {
        throw new Error("Abstract method not implemented.");
    }

    /**
     * Method that should provide raw read stream for downloading files from provider. Only basic read stream from provider, no decryption or anything else.
     * @abstract
     * @param {import("../DocTypes").IFile} file - File which should be downloaded.
     */
    async createRawReadStream(file) {
        throw new Error("Abstract method not implemented.");
    }

    /**
     * Method that should provide raw write stream for uploading files to provider. Only basic write stream to provider, no encryption or anything else.
     * @abstract
     * @param {import("../DocTypes").IFile} file - File which should be uploaded.
     * @param {IWriteStreamCallbacks} callbacks - Callbacks for write stream.
     */
    async createRawWriteStream(file, callbacks) {
        throw new Error("Abstract method not implemented.");
    }
}