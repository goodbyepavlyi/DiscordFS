const { MutableBuffer } = require("mutable-buffer");
const { Writable } = require("stream");
const { AttachmentBuilder } = require("discord.js");
const crypto = require("crypto");
const Logger = require("../Logger");
const BaseProvider = require("./BaseProvider");
const HttpStreamPool = require("../utils/HttpStreamPool");
const Config = require("../Config");

const MaxRealChunkSize = 25 * 1000 * 1000; // Looks like 25 mb is a new discord limit from 13.04.23 instead of old 8 MB. 

class DiscordFileProvider extends BaseProvider {
    /**
     * @param {import("../Core")} core 
     */
    constructor(core) {
        super(core);
    }

    /**
     * @private
     * @param {Buffer} buffer 
     * @param {string} chunkName 
     * @param {number} chunkNumber 
     * @returns {AttachmentBuilder}
     */
    getAttachmentBuilderFromBuffer(buffer, chunkName, chunkNumber = 0) {
        let name = `${chunkName}_${chunkNumber}`;
        if (Config.encryptionEnabled) name = `${crypto.randomBytes(16).toString("hex")}.enc`;

        return new AttachmentBuilder(buffer, { name });
    }

    /**
     * Uploads a chunk to discord with a given naming and adds the chunk to the file object.
     * FLUSHES THE MUTABLE BUFFER!
     * @param {MutableBuffer} chunk Buffer to upload
     * @param {number} chunkNumber Chunk number (starts at 1)
     * @param {number} totalChunks Total chunks, used only for logging, looks like is broken anyway at the moment
     * @param {import("discord.js").TextBasedChannel} filesChannel Channel to upload the chunk to
     * @param {import("../DocTypes").IFile} file File that the chunk belongs to and will be added to after upload. 
     */
    async uploadChunkToDiscord(chunk, chunkNumber, totalChunks, filesChannel, file) {
        Logger.info(Logger.Type.FileProvider, `Uploading chunk &c${chunkNumber}&r of &c${totalChunks}&r chunks from file &c${file.name}&r to &cDiscord&r...`);
        
        const startTime = Date.now();
        const message = await filesChannel.send({
            files: [ this.getAttachmentBuilderFromBuffer(chunk.flush(), file.name, chunkNumber, false, "") ]
        }).catch(error => {
            Logger.error(Logger.Type.FileProvider, `Failed to upload chunk &c${chunkNumber}&r of &c${totalChunks}&r chunks from file &c${file.name}&r to &cDiscord&r!`, error);
            throw error;
        });

        const elapsedTimeMs = Date.now() - startTime;
        const transferSpeed = (file.size / (1024 * 1024)) / (elapsedTimeMs / 1000); // Calculate transfer speed in KB/s
    
        Logger.info(Logger.Type.FileProvider, `Chunk &c${chunkNumber}&r of &c${totalChunks}&r chunks from file &c${file.name}&r uploaded to &cDiscord&r in &c${elapsedTimeMs}ms&r (&c${transferSpeed.toFixed(2)}MB/s&r).`);

        file.chunks.push({
            id: message.id,
            url: message.attachments.first().url,
            size: chunk.size
        });
    }

    /**
     * @param {import("../DocTypes").IFile} file 
     * @returns {Promise<import("stream").Readable>} 
     */
    async createRawReadStream(file) {
        return (await (new HttpStreamPool(structuredClone(file.chunks), file.size, file.name)).getDownloadStream());
    }

    /**
     * @param {import("../DocTypes").IFile} file 
     * @param {IWriteStreamCallbacks} callbacks 
     * @returns {Promise<Writable>}
     */
    async createRawWriteStream(file, callbacks) {
        const totalChunks = Math.ceil(file.estimatedSize / MaxRealChunkSize);
        const buffer = new MutableBuffer(MaxRealChunkSize);
        let chunkId = 1;

        Logger.debug(Logger.Type.FileProvider, `Total chunks: &c${totalChunks}&r - file.estimatedSize: &c${file.estimatedSize}&r - file.size: &c${file.size}&r - file.name: &c${file.name}&r`);

        return new Writable({
            write: async (chunk, encoding, callback) => {
                if (buffer.size + chunk.length > MaxRealChunkSize) {
                    await this.uploadChunkToDiscord(buffer, chunkId, totalChunks, this.core._filesChannel, file);
                    
                    Logger.debug(Logger.Type.FileProvider, `Chunk &c${chunkId}&r of &c${totalChunks}&r chunks uploaded, clearing buffer...`);
                    chunkId++;
                    buffer.clear();
                }

                file.size += chunk.length;
                buffer.write(chunk, encoding);
                
                if (callbacks.onWrite) {
                    callbacks.onWrite(chunk);
                }

                callback();
            },
            final: async (callback) => {
                if (buffer.size > 0) {
                    await this.uploadChunkToDiscord(buffer, chunkId, totalChunks, this.core._filesChannel, file);
                }

                if (callbacks.onFinished) {
                    await callbacks.onFinished();
                }
                
                Logger.info(Logger.Type.FileProvider, `Uploaded all &c${totalChunks}&r chunks of file &c${file.name}&r to &cDiscord&r.`);
                callback();
            },
            destroy: (err, callback) => {
                if (buffer.destroy) {
                    buffer.destory();
                }

                if (callbacks.onAbort) {
                    callbacks.onAbort(err);
                }

                callback(err);
            }
        });
    }   

    /**
     * @returns {Promise<void>}
     */
    async processDeletionQueue() {
        if (this.fileDeletionQueue.length <= 0) return;

        const file = this.fileDeletionQueue.shift();
        const channel = this.core.channels.cache.get(file.channelId);
        if (!channel) {
            Logger.error(Logger.Type.FileProvider, `Failed to find channel &c${file.channelId}&r`);
            throw new Error(`Can't delete file from channel ${file.channelId} - channel not found!`);
        }

        Logger.debug(Logger.Type.FileProvider, `Deleting message &c${file.messageId}&r from channel &c${file.channelId}&r`);
        await channel.messages.delete(file.messageId)
            .catch(error => {
                if (error.code == "10008") return;
                
                Logger.error(Logger.Type.FileProvider, `Failed to delete message &c${file.messageId}&r from channel &c${file.channelId}&r`, error);
                throw error;
            });
    }
}

module.exports = {
    DiscordFileProvider,
    MaxRealChunkSize
}