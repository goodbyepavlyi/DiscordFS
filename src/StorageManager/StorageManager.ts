import { Message } from 'discord.js';

import VolumeExDatabase from './Models/VolumeExDatabase';
import VolumeEx from './Models/VolumeEx';
import DiscordBot from '../Discord/DiscordBot';
import Logger from '../Logger';

export default class StorageManager {
    public static Instance: StorageManager;

    private DatabaseMessage: Message|null = null;
    private DatabaseUploadTimeout: NodeJS.Timeout|null = null;

    constructor() {
        StorageManager.Instance = this;
    }

    public async Start() {
        try {
            VolumeEx.CreateInstance(await this.FetchDatabase());
        } catch (Error) {
            Logger.Error(Logger.Type.StorageManager, 'An error occured while &cstarting StorageManager&r, error:', Error);
            process.exit(1);
        }
    }

    public MarkDatabaseUpload() {
        if (this.DatabaseUploadTimeout) clearTimeout(this.DatabaseUploadTimeout);

        this.DatabaseUploadTimeout = setTimeout(async () => {
            await this.SaveDatabase();
            this.DatabaseUploadTimeout = null;
        }, 30_000);
    }

    public async SaveDatabase(DB?: VolumeExDatabase) {
        const Attachments = (DB ?? new VolumeExDatabase(VolumeEx.Instance.toJSON())).ToDiscord();
        if (!this.DatabaseMessage) {
            Logger.Debug(Logger.Type.StorageManager, 'Database message not found, creating new one...');
            this.DatabaseMessage = await DiscordBot.Instance.SendMessage({ files: Attachments }, 'Database');
            return;
        }

        Logger.Debug(Logger.Type.StorageManager, 'Database message found, editing...');
        await this.DatabaseMessage.edit({ files: Attachments });
    }

    private async FetchDatabaseMessage(): Promise<Message|null> {
        Logger.Debug(Logger.Type.StorageManager, 'Fetching Database message...');
        if (!DiscordBot.Instance.DatabaseChannel) {
            Logger.Error(Logger.Type.StorageManager, 'Database channel is not set');
            return null;
        }

        const Message = (await DiscordBot.Instance.DatabaseChannel.messages.fetch({ limit: 1 })).filter(x => x.author.id === DiscordBot.Instance.user?.id);
        if (!Message || Message.size === 0) return null;
        return Message.first() ?? null;
    }

    private async FetchDatabase(): Promise<VolumeExDatabase> {
        Logger.Debug(Logger.Type.StorageManager, 'Fetching database...');

        this.DatabaseMessage = await this.FetchDatabaseMessage();
        if (!this.DatabaseMessage) {
            const FileDB = new VolumeExDatabase({});
            await this.SaveDatabase(FileDB);
            return FileDB;
        }
        
        return await VolumeExDatabase.FromDiscord(this.DatabaseMessage.attachments);
    }
}

export const MaxChunkSize = 25 * 1000 * 1000; // 25MB Discord limit