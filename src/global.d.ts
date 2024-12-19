import express from 'express';

type NodeCache = import('node-cache');
type Snowflake = import('discord.js').Snowflake;

declare global {
    namespace NodeJS {
        interface Process {
            CacheDirectory: string;
            DevMode: boolean;
            Version: string;
            Description: string;
            Cache: NodeCache;
        }

        interface ProcessEnv {
            DISCORD_TOKEN: string;
            DISCORD_GUILD_ID: Snowflake;
            DISCORD_CHANNEL_DATABASE: Snowflake;
            DISCORD_CHANNEL_STORAGE: Snowflake;

            WEBSERVER_PORT: number;
            WEBSERVER_ENABLE_HTTPS: string;
            WEBSERVER_USERS: string;

            ENCRYPTION_KEY: string;
        }
    }

    interface RouteResponse extends express.Response {
        // Utils
        SendJson(Data: any, Code?: number): void;
        SendError(Code: number, Error: string, Data?: any): void;

        // 5xx
        InternalError(Error?: string|null): void;

        // 4xx
        NotFound(error?: string|null): void;
        BadRequest(error?: string|null): void;
        Unauthorized(error?: string|null): void;

        OK(Message?: string, Data?: any): void;
        FAIL(Message?: string, Data?: any): void;
        DATA(Data: any): void;
    }

    interface RouteHandler {
        name: string;
        method: string;
        required?: string[];
        middleware?: RouteCallback[];
        run: RouteCallback;
    }

    type ExpressAPIResponse = {
        Passed: boolean;
        Status: string;
        Message: string;
        Data?: any;
    };

    type RouteCallback = (req: express.Request, res: RouteResponse, next: express.NextFunction) => void;
}

export { }