const path = require('path');
const mime = require('mime-types');
const { v2, Errors, ResourceType } = require('webdav-server');
const Logger = require('../Logger');
const { Readable } = require('stream');

class DiscordFileSerializer {
    uid = () => "virtual-discord-file-system@1.0.0";

    /**
     * @param {v2.FileSystem} fs 
     * @param {v2.ReturnCallback<any>} callback 
     */
    serialize = (fs, callback) => new Error("Method not implemented.");

    /**
     * @param {any} serializedData 
     * @param {v2.ReturnCallback<v2.FileSystem>} callback 
     */
    unserialize = (serializedData, callback) => new Error("Method not implemented.");
}

module.exports = class DiscordFilesystem extends v2.FileSystem {
    /**
     * @param {import("../Core")} core 
     */
    constructor(core) {
        super(new DiscordFileSerializer());

        this.core = core;
        this.provider = this.core.provider;
        this.fs = this.core.fs;
        this.cLockManager = new v2.LocalLockManager();
        this.cPropertyManager = new v2.LocalPropertyManager();
    }

    /**
     * @param {v2.IContextInfo} ctx 
     */
    _getContext = (ctx) => ({
        host: ctx.context.headers.host,
        contentLength: ctx.context.headers.contentLength,
        useragent: ctx.context.headers.find("user-agent", "unkown useragent"),
        uri: ctx.context.requested.uri
    })

    /**
     * @param {string} rPath 
     * @returns {string} 
     */
    getMimeType = (rPath) => mime.lookup(path.parse(rPath).base) || "application/octet-stream";
    
    /**
     * @param {v2.Path} path 
     * @param {v2.PropertyManagerInfo} ctx 
     * @param {v2.ReturnCallback<v2.IPropertyManager>} callback 
     */
    _lockManager = (path, ctx, callback) => callback(undefined, this.cLockManager);

    /**
     * @param {v2.Path} path 
     * @param {v2.LockManagerInfo} ctx 
     * @param {v2.ReturnCallback<v2.ILockManager>} callback 
     */
    _propertyManager = (path, ctx, callback) => callback(undefined, this.cPropertyManager);

    /**
     * @param {v2.Path} path 
     * @param {v2.AvailableLocksInfo} ctx 
     * @param {v2.ReturnCallback<v2.LockKind[]>} callback 
     */
    _availableLocks = (path, ctx, callback) => callback(undefined, []);

    /**
     * @param {v2.RequestContext} ctx 
     * @param {v2.Path} path 
     * @param {void} callback 
     */
    _fastExistCheck = (ctx, path, callback) => callback(this.fs.existsSync(path.toString()));

    /**
     * @param {v2.Path} path 
     * @param {v2.SizeInfo} ctx 
     * @param {v2.ReturnCallback<number>} callback 
     */
    _size(path, ctx, callback) {
        Logger.debug(Logger.Type.Filesystem, `&c_size&r`, {
            path: path.toString(), ctx: this._getContext(ctx)
        });
        
        const stat = this.fs.statSync(path.toString());
        if (stat.isFile()) {
            Logger.debug(Logger.Type.Filesystem, `Size of file &c${path.toString()}&r is &c${this.fs.getFile(path.toString()).size}&r.`);
            return callback(undefined, this.fs.getFile(path.toString()).size);
        }

        return callback(undefined, this.fs.getTreeSizeRecursive(path.toString()));
    }

    /**
     * @param {v2.Path} path 
     * @param {v2.ReadDirInfo} ctx 
     * @param {v2.ReturnCallback<string[] | v2.Path[]>} callback 
     */
    _readDir(path, ctx, callback) {
        Logger.debug(Logger.Type.Filesystem, `&c_readDir&r`, {
            path: path.toString(), ctx: this._getContext(ctx)
        });

        const stat = this.fs.statSync(path.toString());
        if (stat.isDirectory()) {
            return callback(undefined, this.fs.readdirSync(path.toString()));
        }

        return callback(Errors.ResourceNotFound);
    }

    /**
     * @param {v2.Path} path 
     * @param {v2.TypeInfo} ctx 
     * @param {v2.ReturnCallback<v2.ResourceType>} callback 
     */
    _type(path, ctx, callback) {
        Logger.debug(Logger.Type.Filesystem, `&c_type&r`, {
            path: path.toString(), ctx: this._getContext(ctx)
        });

        const stat = this.fs.statSync(path.toString());
        if (stat.isFile()) {
            Logger.debug(Logger.Type.Filesystem, `Resource type of &c${path.toString()}&r is &cFile&r.`);
            return callback(undefined, ResourceType.File);
        }
        
        if (stat.isDirectory()) {
            Logger.debug(Logger.Type.Filesystem, `Resource type of &c${path.toString()}&r is &cDirectory&r.`);
            return callback(undefined, ResourceType.Directory);
        }

        Logger.debug(Logger.Type.Filesystem, `Resource type of &c${path.toString()}&r is &cUnknown&r.`);
        return callback(Errors.ResourceNotFound);
    }

    /**
     * @param {v2.Path} path 
     * @param {v2.TypeInfo} ctx 
     * @param {v2.ReturnCallback<v2.ResourceType>} callback 
     */
    _mimeType(path, ctx, callback) {
        Logger.debug(Logger.Type.Filesystem, `&c_mimeType&r`, {
            path: path.toString(), ctx: this._getContext(ctx)
        });

        const stat = this.fs.statSync(path.toString());
        if (stat.isFile()) {
            Logger.debug(Logger.Type.Filesystem, `Mime type of &c${path.toString()}&r is &c${this.getMimeType(path.toString())}&r.`);
            return callback(undefined, this.getMimeType(path.toString()));
        }

        return callback(Errors.NoMimeTypeForAFolder);
    }

    /**
     * @param {v2.Path} path 
     * @param {v2.CreateInfo} ctx 
     * @param {v2.SimpleCallback} callback 
     */
    _create(path, ctx, callback) {
        Logger.debug(Logger.Type.Filesystem, `&c_create&r`, {
            path, ctx: this._getContext(ctx)
        });

        const exists = this.fs.existsSync(path.toString());
        if (exists) {
            Logger.debug(Logger.Type.Filesystem, `Resource already exists &c${path.toString()}&r.`);
            return callback(Errors.ResourceAlreadyExists);
        }

        if (ctx.type.isDirectory) {
            Logger.info(Logger.Type.Filesystem, `Creating directory &c${path.toString()}&r...`);
            this.fs.mkdirSync(path.toString(), { recursive: true });
        }

        if (ctx.type.isFile) {
            Logger.info(Logger.Type.Filesystem, `Creating file &c${path.toString()}&r...`);
            this.fs.setFile(path.toString(), this.provider.createVFile(path.fileName(), 0));
        }

        this.core.markForUpload();
        return callback();
    }

    /**
     * @param {v2.Path} path 
     * @param {v2.OpenReadStreamInfo} ctx 
     * @param {v2.ReturnCallback<Readable>} callback 
     */
    async _openReadStream(path, ctx, callback) {
        Logger.debug(Logger.Type.Filesystem, `&c_openReadStream&r`, {
            path: path.toString(), estimatedSize: ctx.estimatedSize
        });

        const stat = this.fs.statSync(path.toString());
        if (!stat.isFile()) {
            return callback(Errors.ResourceNotFound);
        }

        const file = this.fs.getFile(path.toString());
        if (file.chunks.length == 0) {
            return callback(undefined, Readable.from(Buffer.from([])));
        }

        const readStream = await this.provider.createReadStream(file);
        Logger.debug(Logger.Type.Filesystem, `Stream opened for path &c${path.toString()}&r`);

        return callback(undefined, readStream);
    }

    /**
     * @param {v2.Path} path 
     * @param {v2.OpenWriteStreamInfo} ctx 
     * @param {v2.ReturnCallback<Writable>} callback 
     * @returns {Promise<void>}
     */
    async _openWriteStream(path, ctx, callback) {
        const { targetSource, estimatedSize, mode } = ctx;

        Logger.debug(Logger.Type.Filesystem, `&c_openWriteStream&r`, {
            path: path.toString(), estimatedSize, mode, targetSource
        });

        const stat = this.fs.statSync(path.toString());
        if (!stat.isFile()) {
            return callback(Errors.InvalidOperation);
        }

        const file = this.fs.getFile(path.toString());
        for (const chunk of file.chunks) {
            Logger.debug(Logger.Type.Filesystem, `Deleting chunk &c${chunk.id}&r for file &c${file.name}&r...`);

            this.provider.addToDeletionQueue({
                channel: this.core.filesChannel.id,
                message: chunk.id
            });
        }

        file.chunks = [];
        file.modified = new Date();
        file.estimatedSize = estimatedSize;
        this.fs.setFile(path.toString(), file);
        this.core.markForUpload();

        const writeStream = await this.provider.createWriteStream(file, {
            onFinished: async () => {
                Logger.info(Logger.Type.Filesystem, `Stream finished for path &c${path.toString()}&r`);
                this.fs.setFile(path.toString(), file);
                this.core.markForUpload();
            },
            onWrite: (chunk) => {
                file.size += chunk.length;
                file.modified = new Date();
                this.fs.setFile(path.toString(), file);
            },
            onAbort: (error) => {
                if (!error) {
                    return;
                }

                Logger.error(Logger.Type.Filesystem, `Stream aborted for path &c${path.toString()}&r due to an error`, error);
                this.fs.rmSync(path.toString(), { recursive: true });
            }
        });

        Logger.debug(Logger.Type.Filesystem, `Stream opened for path &c${path.toString()}&r with estimated size &c${estimatedSize}&r...`);
        return callback(undefined, writeStream);
    }

    /**
     * @param {v2.Path} path
     * @param {v2.CopyInfo} ctx
     * @param {v2.SimpleCallback} callback
     * @returns {Promise<void>}
     */
    async _delete(path, ctx, callback) {
        Logger.debug(Logger.Type.Filesystem, `&c_delete&r`, {
            path: path.toString(), ctx: this._getContext(ctx)
        });

        const stat = this.fs.statSync(path.toString());
        const filesToDelete = [];

        if (stat.isFile()) {
            filesToDelete.push(path.toString());
        }

        if (stat.isDirectory()) {
            filesToDelete.push(...this.fs.getPathsRecursive(path.toString()));
        }

        for (const fileToDelete of filesToDelete) {
            for (const chunk of this.fs.getFile(fileToDelete).chunks) {
                Logger.debug(Logger.Type.Filesystem, `Deleting chunk &c${chunk.id}&r for file &c${fileToDelete}&r...`);

                this.provider.addToDeletionQueue({
                    channel: this.core.filesChannel.id,
                    message: chunk.id
                });
            }
        }

        this.fs.rmSync(path.toString(), { recursive: true });
        this.core.markForUpload();
        return callback();
    }
    
    /**
     * Copies a file from pathFrom to pathTo. Automatically marks the client as dirty and updates the file system.
     * @param {v2.Path} pathFrom
     * @param {v2.Path} pathTo
     * @returns {Promise<boolean>} 
     */
    copyFile = (pathFrom, pathTo) => new Promise(async (resolve, reject) => {
        Logger.debug(Logger.Type.Filesystem, `&ccopyFile&r`, {
            pathFrom: pathFrom.toString(), pathTo: pathTo.toString()
        });

        if (!this.fs.existsSync(pathFrom.toString()) || pathFrom.toString() == pathTo.toString()) {
            Logger.debug(Logger.Type.Filesystem, "copyFile - Source does not exist or target is the same as source.");
            return resolve(false);
        }

        this.fs.mkdirSync(path.parse(pathTo.toString()).dir, { recursive: true });

        const oldFile = this.fs.getFile(pathFrom.toString());
        const newFile = this.provider.createVFile(pathTo.fileName(), oldFile.size);

        const readStream = await this.provider.createReadStream(oldFile);
        const writeStream = await this.provider.createWriteStream(newFile, {
            onFinished: async () => {
                this.fs.setFile(pathTo.toString(), newFile);
                this.core.markForUpload();

                return resolve(true);
            },
            onAbort: (error) => {
                if (!error) {
                    return;
                }

                Logger.error(Logger.Type.Filesystem, `Stream aborted for path &c${pathTo.toString()}&r due to an error.`);
                return reject(false);
            },
        });

        readStream.pipe(writeStream);
    });

    /**
     * @param {v2.Path} pathFrom
     * @param {v2.Path} pathTo
     * @param {v2.CopyInfo} ctx
     * @param {v2.ReturnCallback<boolean>} callback
     * @returns {Promise<void>} 
     */
    async _copy(pathFrom, pathTo, ctx, callback) {
        Logger.debug(Logger.Type.Filesystem, `&c_copy&r`, {
            pathFrom: pathFrom.toString(), pathTo: pathTo.toString(), ctx: this._getContext(ctx)
        });

        const sourceExists = this.fs.existsSync(pathFrom.toString());
        const targetExists = this.fs.existsSync(pathTo.toString());

        if (!sourceExists || targetExists) {
            Logger.debug(Logger.Type.Filesystem, "Source does not exist or target already exists.");
            return callback(Errors.Forbidden);
        }

        const sourceStat = this.fs.statSync(pathFrom.toString());

        if (sourceStat.isDirectory()) {
            let files = this.fs.getFilesWithPathRecursive(pathFrom.toString());
 
            for (let oldPath in files) {
                let newPath = pathTo.toString() + oldPath.substring(pathFrom.toString().length);
 
                if (!await this.copyFile(new v2.Path(oldPath), new v2.Path(newPath))) {
                    return callback(Errors.InvalidOperation);
                }
            }
        }

        if (sourceStat.isFile()) {
            if (!await this.copyFile(pathFrom, pathTo)) {
                return callback(Errors.InvalidOperation);
            }
        }

        return callback(undefined, true);
    }

    /**
     * @param {v2.Path} pathFrom
     * @param {v2.Path} pathTo
     * @param {v2.MoveInfo} ctx
     * @param {v2.ReturnCallback<boolean>} callback
     * @returns {Promise<void>}
     */
    async _move(pathFrom, pathTo, ctx, callback) {
        Logger.debug(Logger.Type.Filesystem, `&c_move&r`, {
            pathFrom: pathFrom.toString(), pathTo: pathTo.toString(), ctx: this._getContext(ctx)
        });

        const sourceExists = this.fs.existsSync(pathFrom.toString());
        const targetExists = this.fs.existsSync(pathTo.toString());

        if (!sourceExists || targetExists) {
            Logger.debug(Logger.Type.Filesystem, "Source does not exist or target already exists.");
            return callback(Errors.InvalidOperation);
        }

        Logger.info(Logger.Type.Filesystem, `Moved &c${pathFrom.toString()}&r to &c${pathTo.toString()}&r.`);
        this.fs.renameSync(pathFrom.toString(), pathTo.toString());
        this.core.markForUpload();

        return callback(undefined, true);
    }

    /**
     * @param {v2.Path} path
     * @param {string} newName
     * @param {v2.RenameInfo} ctx
     * @param {v2.ReturnCallback<boolean>} callback
     * @returns {void}
     */
    _rename(pathFrom, newName, ctx, callback) {
        Logger.debug(Logger.Type.Filesystem, `&c_rename&r`, {
            path: pathFrom.toString(), newName, ctx: this._getContext(ctx)
        });

        const oldPath = pathFrom.toString();
        const newPath = `${pathFrom.parentName()}/${newName}`;

        Logger.info(Logger.Type.Filesystem, `Renamed &c${oldPath}&r to &c${newPath}&r.`);
        this.fs.renameSync(oldPath, newPath);
        
        return callback(undefined, true);
    }

    /**
     * @param {v2.Path} path 
     * @param {v2.LastModifiedDateInfo} ctx 
     * @param {v2.ReturnCallback<number>} callback 
     */
    _lastModifiedDate(path, ctx, callback) {
        Logger.debug(Logger.Type.Filesystem, `&c_lastModifiedDate&r`, {
            path: path.toString(), ctx: this._getContext(ctx)
        });

        if (this.fs.statSync(path.toString()).isDirectory()) {
            return callback(undefined, new Date().getTime());
        }

        const file = this.fs.getFile(path.toString());
        return callback(undefined, file.modified.getTime());
    }

    /**
     * @param {v2.Path} path 
     * @param {v2.CreationDateInfo} ctx 
     * @param {v2.ReturnCallback<number>} callback 
     */
    _creationDate(path, ctx, callback) {
        Logger.debug(Logger.Type.Filesystem, `&c_creationDate&r`, {
            path: path.toString(), ctx: this._getContext(ctx)
        });

        if (this.fs.statSync(path.toString()).isDirectory()) {
            return callback(undefined, new Date().getTime());
        }

        const file = this.fs.getFile(path.toString());
        return callback(undefined, file.created.getTime());
    }
    
    /**
     * 
     * @param {v2.Path} path 
     * @param {v2.ETagInfo} ctx 
     * @param {v2.ReturnCallback<string>} callback 
     * @returns {void}
     */
    _etag(path, ctx, callback) {
        Logger.debug(Logger.Type.Filesystem, `&c_etag&r`, {
            path: path.toString(), ctx: this._getContext(ctx)
        });

        const stat = this.fs.statSync(path.toString());
        if (stat.isDirectory()) {
            return callback(undefined, "0");
        }

        return callback(undefined, this.fs.getFile(path.toString()).modified.getTime().toString());
    }
}