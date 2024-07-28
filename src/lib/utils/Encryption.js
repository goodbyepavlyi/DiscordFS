const crypto = require("crypto");
const Config = require("../Config");

module.exports = class Encryption {
    static _encryptionMethod = "aes-256-cbc";

    static get key() {
        if (this._key) return this._key;
        if (!Config.encryptionEnabled) return null;

        this._key = crypto.createHash("sha512").update(Config.encryptionKey).digest("hex").substring(0, 32);
    }

    static get iv() {
        if (this._iv) return this._iv;
        if (!Config.encryptionEnabled) return null;

        this._iv = crypto.createHash("sha512").update(Config.encryptionIV).digest("hex").substring(0, 16);
    }

    static get cipher() {
        if (this._cipher) return this._cipher;
        if (!this.key || !this.iv) return null;

        return crypto.createCipheriv(this._encryptionMethod, this.key, this.iv);
    }

    static get decipher() {
        if (this._decipher) return this._decipher;
        if (!this.key || !this.iv) return null;

        return crypto.createDecipheriv(this._encryptionMethod, this.key, this.iv);
    }

    static encrypt(data) {
        return this.cipher.update(data, "utf8", "hex") + this.cipher.final("hex");
    }

    static decrypt(data) {
        return this.decipher.update(data, "hex", "utf8") + this.decipher.final("utf8");
    }
}