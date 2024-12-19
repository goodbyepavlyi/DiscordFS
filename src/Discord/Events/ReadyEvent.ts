import { ActivityType, Events, PermissionFlagsBits } from 'discord.js';

import Logger from '../../Logger';
import DiscordEvent from '../Models/DiscordEvent';
import DiscordBot from '../DiscordBot';

export default class ReadyEvent extends DiscordEvent {
    constructor(DiscordBot: DiscordBot) {
        super(DiscordBot, 'ReadyEvent', Events.ClientReady, true);
    }

    async Run() {
        const requiredPermissions = PermissionFlagsBits.AttachFiles|PermissionFlagsBits.ManageMessages|PermissionFlagsBits.SendMessages;
        
        Logger.Info(Logger.Type.Discord, `Connected to &cDiscord API&r as &c${this.DiscordBot.user?.tag}&r!`);
        Logger.Info(Logger.Type.Discord, `Invite link: &chttps://discord.com/oauth2/authorize?client_id=${this.DiscordBot.user?.id}&permissions=${requiredPermissions}&scope=bot&r`);
        
        this.DiscordBot.user?.setPresence({ activities: [ { type: ActivityType.Playing, name: `DiscordFS v${process.Version}` } ] });
    }
}