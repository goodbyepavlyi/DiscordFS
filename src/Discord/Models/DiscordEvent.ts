import { Events } from 'discord.js';
import DiscordBot from '../DiscordBot';

export default class DiscordEvent {
    public DiscordBot: DiscordBot;

    public Name: string;
    public EventName: string;
    public Once: boolean;

    constructor(DiscordBot: DiscordBot, Name: string, EventName: Events, Once: boolean) {
        this.DiscordBot = DiscordBot;
        this.Name = Name;
        this.EventName = EventName;
        this.Once = Once;
    }

    Run(...Args: any[]) {
        throw new Error('Event must implement Run method');
    }
}