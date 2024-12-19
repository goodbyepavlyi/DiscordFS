import fs from 'node:fs';

import Logger, { LogLevel } from './Logger';

const DefaultConfig: ConfigData = {
    Log: {
        Level: 'Info',
        LogToFile: true
    }
};

export default class Config {
    private static readonly ConfigPath: string = './Data/Config.json';
    private static _Config: ConfigData;

    public static get Config(): ConfigData {
        return this._Config || this.LoadConfig();
    }

    public static LoadConfig(): ConfigData {
        if (!fs.existsSync(this.ConfigPath)) {
            this._Config = DefaultConfig;
            this.SaveConfig();
            return this._Config;
        }

        this._Config = JSON.parse(fs.readFileSync(this.ConfigPath, 'utf8'));
        return this._Config;
    }

    public static SaveConfig() {
        if (!this._Config) return;
        Logger.Debug(Logger.Type.Config, 'Saving Config to disk');
        fs.writeFileSync(this.ConfigPath, JSON.stringify(this._Config, null, 4), 'utf8');
    }

    public static get LogLevel() { return this.Config.Log.Level; }
    public static get LogToFile() { return this.Config.Log.LogToFile; }
}

type ConfigData = {
    Log: {
        Level: LogLevel;
        LogToFile: boolean;
    };
};
