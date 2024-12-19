import path from 'node:path';
import { Client, Guild, MessageCreateOptions, Partials, Snowflake, TextChannel } from 'discord.js';

import Logger from '../Logger';
import Utils from '../Utils';
import DiscordEvent from './Models/DiscordEvent';

export default class DiscordBot extends Client {
    static Instance: DiscordBot;

    private BotGuild: Guild|undefined;
    public DatabaseChannel: TextChannel|undefined;
    public StorageChannel: TextChannel|undefined;

    constructor() {
        super({
            intents: [ 'Guilds', 'GuildMessages' ],
            partials: [ Partials.Channel, Partials.Message ]
        });

        DiscordBot.Instance = this;

        this.Init();
    }

    private async Init() {
        if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_GUILD_ID || !process.env.DISCORD_CHANNEL_DATABASE || !process.env.DISCORD_CHANNEL_STORAGE) {
            Logger.Error(Logger.Type.Discord, 'Discord environment variables are not set, exiting...');
            process.exit(1);
        }

        await this.LoadEvents();
    }

    public async Start() {
        await this.Login();
        await this.FetchChannels();
    }

    private async LoadEvents() {
        Logger.Debug(Logger.Type.Discord, 'Loading events...');

        let RegisteredEvents: string[] = [];
        for (const FilePath of Utils.ReadDirRecursive(path.join(__dirname, 'Events'))) {
            try {
                const Event: DiscordEvent = new (await import(FilePath)).default(this);
                if (!(Event instanceof DiscordEvent)) continue;

                Logger.Debug(Logger.Type.Discord, `Loading event &c${Event.Name} &r(&c${Event.Once ? 'once' : 'on'}&r)`);
                this[Event.Once ? 'once' : 'on'](Event.EventName, (...args) => Event.Run(...args));
                RegisteredEvents.push(Event.Name);
            } catch (Error) {
                Logger.Error(Logger.Type.Discord, `An error occured while &cloading event "${FilePath}"&r, error:`, Error);
                throw Error;
            }
        }

        Logger.Info(Logger.Type.Discord, `Loaded events (&c${RegisteredEvents.length}&r): &c${RegisteredEvents.join('&r, &c')}&r`);
    }

    private Login() {
        return new Promise((Resolve, Reject) => {
            Logger.Debug(Logger.Type.Discord, 'Connecting to &cDiscord API&r...');
    
            this.login(process.env.DISCORD_TOKEN)
                .then(Resolve)
                .catch(Error => {
                    Logger.Error(Logger.Type.Discord, 'An error occured while &cconnecting to Discord API&r, error:', Error);
                    return Reject(Error);
                });
        });
    }

    private async FetchChannels() {
        if (this.BotGuild instanceof Guild && this.DatabaseChannel instanceof TextChannel && this.StorageChannel instanceof TextChannel) return;

        try {
            Logger.Debug(Logger.Type.Discord, 'Fetching guild');
            this.BotGuild = await this.guilds.fetch(process.env.DISCORD_GUILD_ID);

            Logger.Debug(Logger.Type.Discord, 'Fetching channels');
            this.DatabaseChannel = await this.BotGuild.channels.fetch(process.env.DISCORD_CHANNEL_DATABASE) as TextChannel;
            this.StorageChannel = await this.BotGuild.channels.fetch(process.env.DISCORD_CHANNEL_STORAGE) as TextChannel;

            Logger.Info(Logger.Type.Discord, 'Fetched guild and channels!');
        } catch (Error) {
            Logger.Error(Logger.Type.Discord, 'An error occured while &cfetching guild or channels&r, error:', Error);
            process.exit(1);
        }
    }

    private GetChannel(ChannelType: ChannelType) {
        if (!ChannelType) throw new Error('Channel option is required!');

        let Channel: TextChannel|undefined;
        if (ChannelType === 'Database') Channel = this.DatabaseChannel;
        if (ChannelType === 'Storage') Channel = this.StorageChannel;
        return Channel ?? null;
    }

    public async SendMessage(Data: MessageCreateOptions, ChannelType: ChannelType) {
        const Channel = this.GetChannel(ChannelType);
        if (!Channel) throw new Error('Channel not found!');
        return Channel.send(Data);
    }

    public async DeleteMessage(MessageID: Snowflake, ChannelType: ChannelType) {
        const Channel = this.GetChannel(ChannelType);
        if (!Channel) throw new Error('Channel not found!');
        return Channel.messages.delete(MessageID);
    }
}

type ChannelType = 'Database'|'Storage';