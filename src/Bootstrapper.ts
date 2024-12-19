import Logger from './Logger';
import DiscordBot from './Discord/DiscordBot';
import WebDAVServer from './WebDAV/WebDAVServer';
import StorageManager from './StorageManager/StorageManager';

export default class Bootstrapper {
    private static DiscordBot: DiscordBot;
    private static WebDAVServer: WebDAVServer;
    private static StorageManager: StorageManager;

    private static Init() {

    }

    public static async Start() {
        let StartupTime = Date.now();

        this.Init();
        
        // Discord
        this.DiscordBot = new DiscordBot();
        await this.DiscordBot.Start();

        // Storage Manager
        this.StorageManager = new StorageManager();
        await this.StorageManager.Start();

        // WebDAV Server
        this.WebDAVServer = new WebDAVServer();
        this.WebDAVServer.Start();

        StartupTime = Date.now() - StartupTime;
        Logger.Info(Logger.Type.Application, `Started &c${process.Description} v${process.Version}&r in &c${StartupTime}&rms!`);
    }

    public static async Stop() {
        await this.StorageManager.SaveDatabase();
    }
}