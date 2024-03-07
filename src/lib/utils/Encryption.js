const crypto = require("crypto");
const Config = require("../Config");

module.exports = class Encryption {
    static _encryptionMethod = "aes-256-cbc";
    static key = crypto.createHash("sha512").update(Config.encryptionKey).digest("hex").substring(0, 32);
    static iv = crypto.createHash("sha512").update(Config.encryptionIV).digest("hex").substring(0, 16);
    static cipher = crypto.createCipheriv(this._encryptionMethod, this.key, this.iv);
    static decipher = crypto.createDecipheriv(this._encryptionMethod, this.key, this.iv);

    static encrypt(data) {
        return this.cipher.update(data, "utf8", "hex") + this.cipher.final("hex");
    }

    static decrypt(data) {
        return this.decipher.update(data, "hex", "utf8") + this.decipher.final("utf8");
    }
}