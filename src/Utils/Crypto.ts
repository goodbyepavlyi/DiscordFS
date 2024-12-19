import crypto from 'node:crypto';

export default class Crypto {
    public static Encrypt(Data: any): string {
        const IV = crypto.randomBytes(16);
        const Cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(process.env.ENCRYPTION_KEY, 'utf-8'), IV);

        let EncryptedData = Cipher.update(Data, 'utf-8', 'hex');
        EncryptedData += Cipher.final('hex');

        return IV.toString('hex') + ':' + EncryptedData;
    }

    public static Decrypt(Data: any): string {
        const [ iv, EncryptedData ] = Data.split(':');
        const IV = Buffer.from(iv, 'hex');

        const Decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(process.env.ENCRYPTION_KEY, 'utf-8'), IV);

        let DecryptedData = Decipher.update(EncryptedData, 'hex', 'utf-8');
        DecryptedData += Decipher.final('utf-8');

        return DecryptedData;
    }
}
