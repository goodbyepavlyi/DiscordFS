const crypto = require("crypto");
const Config = require("../Config");

module.exports = class Encryption {
    static _encryptionMethod = "aes-256-cbc";
    /**
     * @private
     * @type {string}
     */
    static _key = null;
    /**
     * @private
     * @type {string}
     */
    static _iv = null;

    static get key() {
        if (this._key) return this._key;
        if (!Config.encryptionEnabled) return null;

        this._key = crypto.createHash("sha512").update(Config.encryptionKey).digest("hex").substring(0, 32);
        return this._key;
    }

    static get iv() {
        if (this._iv) return this._iv;
        if (!Config.encryptionEnabled) return null;

        this._iv = crypto.createHash("sha512").update(Config.encryptionIV).digest("hex").substring(0, 16);
        return this._iv;
    }

    static createCipher() {
        if (!this.key || !this.iv) return null;

        return crypto.createCipheriv(this._encryptionMethod, this.key, this.iv);
    }

    static createDecipher() {
        if (!this.key || !this.iv) return null;

        return crypto.createDecipheriv(this._encryptionMethod, this.key, this.iv);
    }

    static encrypt(data) {
        const cipher = this.createCipher();
        return cipher.update(data, "utf8", "hex") + cipher.final("hex");
    }

    static decrypt(data) {
        const decipher = this.createDecipher();
        return decipher.update(data, "hex", "utf8") + decipher.final("utf8");
    }
}