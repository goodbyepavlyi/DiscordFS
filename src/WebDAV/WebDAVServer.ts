import { v2 as webdav } from 'webdav-server';

import Logger from '../Logger';
import Utils from '../Utils';
import WebDAVFileSystem from '../StorageManager/Models/WebDAVFileSystem';

export default class WebDAVServer {
    public static Instance: WebDAVServer;

    private Server: webdav.WebDAVServer;

    constructor() {
        WebDAVServer.Instance = this;

        const ServerOptions: webdav.WebDAVServerOptions = {
            port: process.env.WEBSERVER_PORT,
            rootFileSystem: new WebDAVFileSystem()
        };

        if (process.env.WEBSERVER_ENABLE_HTTPS === 'true') {
            const Cert = Utils.ReadFileOrNull('./Data/cert.crt');
            const Key = Utils.ReadFileOrNull('./Data/cert.key');
            if (!Cert || !Key) {
                Logger.Error(Logger.Type.WebDAV, 'Certificate or Key not found');
                process.exit(1);
            }

            ServerOptions.https = { cert: Cert, key: Key };
            Logger.Info(Logger.Type.WebDAV, 'HTTPS enabled');
        }

        if (process.env.WEBSERVER_USERS) {
            const UserManager = new webdav.SimpleUserManager();
            for (const User of process.env.WEBSERVER_USERS.split(',')) {
                const [Username, Password] = User.split(':');
                UserManager.addUser(Username, Password);
            }

            ServerOptions.requireAuthentification = true;
            ServerOptions.httpAuthentication = new webdav.HTTPBasicAuthentication(UserManager);
            Logger.Info(Logger.Type.WebDAV, 'Authentication enabled');
        }

        this.Server = new webdav.WebDAVServer(ServerOptions);
    }

    Start() {
        this.Server.start(() => Logger.Info(Logger.Type.WebDAV, `Listening on port &c${process.env.WEBSERVER_PORT}&r`));
    }
}