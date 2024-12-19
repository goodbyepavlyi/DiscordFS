import dotenv from 'dotenv';
dotenv.config();

import { description, version } from '../package.json';
process.DevMode = process.argv.includes('-dev');
process.Version = version;
process.Description = description;

import Bootstrapper from './Bootstrapper';
import Config from './Config';
import Logger from './Logger';

let Exiting = false;
const Shutdown = (Code: number) => {
    if (Exiting) return;
    Exiting = true;

    Bootstrapper.Stop();

    Logger.Info(Logger.Type.Application, `Exiting with code &c${Code}&r...`);
    process.exit(Code);
};

// Error handling
process.on('uncaughtException', Error => Logger.Error(Logger.Type.Application, 'An uncaught exception occured, error:', Error));
process.on('unhandledRejection', Reason => Logger.Error(Logger.Type.Application, 'An unhandled promise rejection occured, error:', Reason));

// do something when app is closing
process.on('exit', (Code) => Shutdown(Code));

// catches ctrl+c event
process.on('SIGINT', () => Shutdown(0));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', Shutdown);
process.on('SIGUSR2', Shutdown);

Logger.Init({
    LogLevel: process.argv.includes('-trace') ? 'Trace' : process.DevMode ? 'Debug' : Config.LogLevel,
    LogToFile: Config.LogToFile
});

Bootstrapper.Start();