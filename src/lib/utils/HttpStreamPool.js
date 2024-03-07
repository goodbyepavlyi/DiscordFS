/**
 * Class that combines list of urls into a single Readable stream. 
 */

const { PassThrough } = require("stream");
const Logger = require("../Logger");
const axiosClient = require("./AxiosInstance");

module.exports = class HttpStreamPool {
    /**
     * @param {import("../file/IFile").IChunkInfo[]} info 
     * @param {number} totalSize 
     * @param {string} filename 
     */
    constructor(info, totalSize, filename) {
        /**
         * @type {import("../file/IFile").IChunkInfo[]}
         */
        this.urls = info;

        /**
         * @type {number}
         */
        this.totalSize = totalSize;

        /**
         * @type {string}
         */
        this.downloadingFileName = filename;

        /**
         * @private
         */
        this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36"

        /**
         * @private
         */
        this.gotSize = 0;

        /**
         * @private
         */
        this.currentUrlIndex = 0;
    }

    /**
	 * Combines list of urls into a single Readable stream, where data readen sequentially.
	 * Warning! After returning stream, since it promise-based function, it will start downloading data from urls in the background.
	 * Not tested much and may !crash or leak your memory! 
	 * @returns {Promise<Readable>} Readable stream that emits data from all urls sequentially. 
	 */
	async getDownloadStream() {
        if (this.urls.length == 0) {
			Logger.warn(Logger.Type.HTTPStreamPool, "No urls to download, returning empty stream");
			return Readable.from([]);
		}

        const stream = new PassThrough();
        const self = this;

        let next = async () => {
			if (self.currentUrlIndex >= self.urls.length) {
				stream.once("unpipe", () => {
					Logger.debug(Logger.Type.HTTPStreamPool, `Downloaded &c${self.downloadingFileName}&r (&c${self.gotSize}&r/&c${self.totalSize}&r)`);
					stream.end(null);
				});

				return;
			}

			if (stream.closed || stream.destroyed) {
				Logger.error(Logger.Type.HTTPStreamPool, "Stream closed or destroyed, stopping download...");
				return;
			}

			let url = self.urls[self.currentUrlIndex];
			let res;

			try {
				Logger.debug(Logger.Type.HTTPStreamPool, `Downloading &c${self.downloadingFileName}&r from &c${url.url}&r (&c${self.currentUrlIndex + 1}&r/&c${self.urls.length}&r)`);
                
                res = await axiosClient.get(url.url, {
					responseType: "stream",
                    headers: {
                        "User-Agent": self.userAgent,
                    },
                    timeout: 10000,
                });
			} catch (error) {
				Logger.error(Logger.Type.HTTPStreamPool, `Failed to download &c${self.downloadingFileName}&r from &c${url.url}&r (&c${self.currentUrlIndex + 1}&r/&c${self.urls.length}&r)`, error);
				return stream.emit("error", error);
			}

			res.data.on("data", (chunk) => {
				self.gotSize += chunk.length;
				stream.emit("progress", self.gotSize, self.totalSize);
			});

			res.data.on("end", () => {
				self.currentUrlIndex++;
				next();
			});

			res.data.on("error", (error) => {
                Logger.error(Logger.Type.HTTPStreamPool, `Failed to download &c${self.downloadingFileName}&r from &c${url.url}&r (&c${self.currentUrlIndex + 1}&r/&c${self.urls.length}&r)`, error);
				stream.emit("error", error);
			});

			res.data.pipe(stream, { end: false });
		}

		next();
		return stream;
    }
}