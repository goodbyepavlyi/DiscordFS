import { Attachment, AttachmentPayload, Collection, Snowflake } from 'discord.js';
import Logger from '../../Logger';
import Crypto from '../../Utils/Crypto';
import { MaxChunkSize } from '../StorageManager';

export default class VolumeExDatabase {
    public static async FromDiscord(Attachments: Collection<Snowflake, Attachment>): Promise<VolumeExDatabase> {
        const Data = await Promise.all(Attachments.map(x => fetch(x.url).then(x => x.json())))
            .then((x: IDataFile[]) => JSON.parse(x
                .sort((a, b) => a.Order - b.Order)
                .map(x => VolumeExDatabase.ReadData(x.Data))
                .join('')));

        Logger.Trace(Logger.Type.StorageManager, '=> VolumeExDatabase.FromDiscord - Data:', Data);
        return new VolumeExDatabase(Data);
    }

    public static ReadData(Data: string) {
        return process.env.ENCRYPTION_KEY 
            ? Crypto.Decrypt(Data) 
            : Buffer.from(Data, 'base64').toString('utf-8');
    }

    public static WriteData(Order: number, Data: Buffer) {
        return Buffer.from(JSON.stringify({
            Order,
            Data: process.env.ENCRYPTION_KEY ? Crypto.Encrypt(Data) : Data.toString('base64')
        }));
    }

    public Data: object;

    constructor(Data: object) {
        this.Data = Data;
    }

    public ToJSON() {
        return this.Data;
    }

    public ToDiscord(): AttachmentPayload[] {
        const Data = Buffer.from(JSON.stringify(this.Data), 'utf-8');
        const Chunks = [];
        for (let i = 0; i < Data.length; i += MaxChunkSize) 
            Chunks.push(Data.subarray(i, i + MaxChunkSize));

        return Chunks.map((Data, Order) => ({
            name: `db-${Order}.json`,
            attachment: VolumeExDatabase.WriteData(Order, Data)
        }));
    }
}

interface IDataFile {
    Order: number;
    Data: string;
}