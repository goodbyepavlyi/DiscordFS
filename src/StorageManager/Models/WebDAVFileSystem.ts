import { v2 as webdav } from 'webdav-server';
import { Readable, Writable } from 'stream';
import path from 'node:path';

import Logger from '../../Logger';
import VolumeEx from './VolumeEx';
import StorageManager from '../StorageManager';
import FileProvider from './FileProvider';

class DiscordFileSerializer {
    uid() {
        return `discordfs@${process.Version}`;
    }

    serialize() {
        throw new Error('Method not implemented.');
    }

    unserialize() {
        throw new Error('Method not implemented.');
    }
}

export default class WebDAVFileSystem extends webdav.FileSystem {
    public cLockManager: webdav.LocalLockManager = new webdav.LocalLockManager();
    public cPropertyManager: webdav.LocalPropertyManager = new webdav.LocalPropertyManager();

    protected _lockManager(Path: webdav.Path, ctx: webdav.LockManagerInfo, Callback: webdav.ReturnCallback<webdav.ILockManager>) {
        Callback(undefined, this.cLockManager);
    }

    protected _propertyManager(Path: webdav.Path, ctx: webdav.PropertyManagerInfo, Callback: webdav.ReturnCallback<webdav.IPropertyManager>) {
        Callback(undefined, this.cPropertyManager);
    }

    protected _fastExistCheck(ctx: webdav.RequestContext, Path: webdav.Path, Callback: (exists: boolean) => void): void {
        Callback(this.VolumeEx.existsSync(Path.toString()));
    }

    private FileProvider: FileProvider;
    private VolumeEx: VolumeEx = VolumeEx.Instance;

    constructor() {
        super(new DiscordFileSerializer());
        this.FileProvider = new FileProvider();
    }

    private CopyFile(OldPath: string, NewPath: string): Promise<boolean> {
        return new Promise(async (Resolve) => {
            Logger.Trace(Logger.Type.WebDAV, `[CopyFile] => Copy: ${OldPath} => ${NewPath}`);

            if (!this.VolumeEx.existsSync(OldPath) || OldPath === NewPath) {
                Logger.Trace(Logger.Type.WebDAV, `[CopyFile] => Copy: ${OldPath} => ${NewPath} => Not Found`);
                return Resolve(false);
            }

            this.VolumeEx.mkdirSync(path.parse(NewPath).dir, { recursive: true });

            const OldFile = this.VolumeEx.getFile(OldPath);
            const NewFile = FileProvider.CreateFile(NewPath);

            NewFile.Created = OldFile.Created;
            NewFile.Modified = new Date();
            NewFile.Size = OldFile.Size;

            const ReadStream = await this.FileProvider.CreateReadStream(OldFile);
            const WriteStream = this.FileProvider.CreateWriteStream(NewFile, {
                OnEnd: () => {
                    Logger.Trace(Logger.Type.WebDAV, `[CopyFile] => Copy: ${OldPath} => ${NewPath} => OnEnd`);
                    this.VolumeEx.setFile(NewPath, NewFile);
                    StorageManager.Instance.MarkDatabaseUpload();
                    return Resolve(true);
                },
                OnError: (Error) => {
                    if (!Error) return;
                    Logger.Error(Logger.Type.WebDAV, `[CopyFile] => Copy: ${OldPath} => ${NewPath} => OnError`, Error);
                    this.VolumeEx.rmSync(NewPath, { recursive: true });
                    return Resolve(false);
                }
            });

            ReadStream.pipe(WriteStream);
        });
    }

    protected _type(Path: webdav.Path, ctx: webdav.TypeInfo, Callback: webdav.ReturnCallback<webdav.ResourceType>) {
        Logger.Trace(Logger.Type.WebDAV, `[_type] => Type: ${Path.toString()}`);

        const FileStat = this.VolumeEx.statSync(Path.toString());
        if (FileStat.isFile()) {
            Logger.Trace(Logger.Type.WebDAV, `[_type] => Type: ${Path.toString()} => File`);
            return Callback(undefined, webdav.ResourceType.File);
        }

        if (FileStat.isDirectory()) {
            Logger.Trace(Logger.Type.WebDAV, `[_type] => Type: ${Path.toString()} => Directory`);
            return Callback(undefined, webdav.ResourceType.Directory);
        }

        Logger.Trace(Logger.Type.WebDAV, `[_type] => Type: ${Path.toString()} => Not Found`);
        return Callback(webdav.Errors.ResourceNotFound);
    }

    protected _readDir(Path: webdav.Path, ctx: webdav.ReadDirInfo, Callback: webdav.ReturnCallback<string[] | webdav.Path[]>): void {
        Logger.Trace(Logger.Type.WebDAV, `[_readDir] => ReadDir: ${Path.toString()}`);

        const FileStat = this.VolumeEx.statSync(Path.toString());
        if (!FileStat.isDirectory()) {
            Logger.Trace(Logger.Type.WebDAV, `[_readDir] => ReadDir: ${Path.toString()} => Not Found`);
            return Callback(webdav.Errors.ResourceNotFound);
        }

        Logger.Trace(Logger.Type.WebDAV, `[_readDir] => ReadDir: ${Path.toString()} => Found`);
        return Callback(undefined, this.VolumeEx.readdirSync(Path.toString()) as string[]);
    }

    protected _create(Path: webdav.Path, ctx: webdav.CreateInfo, Callback: webdav.SimpleCallback): void {
        Logger.Trace(Logger.Type.WebDAV, `[_create] => Create: ${Path.toString()}`);

        if (this.VolumeEx.existsSync(Path.toString())) {
            Logger.Trace(Logger.Type.WebDAV, `[_create] => Create: ${Path.toString()} => Already Exists`);
            return Callback(webdav.Errors.ResourceAlreadyExists);
        }

        if (ctx.type.isDirectory) {
            Logger.Trace(Logger.Type.WebDAV, `[_create] => Create: ${Path.toString()} => Directory`);
            this.VolumeEx.mkdirSync(Path.toString());
        }

        if (ctx.type.isFile) {
            Logger.Trace(Logger.Type.WebDAV, `[_create] => Create: ${Path.toString()} => File`);
            this.VolumeEx.setFile(Path.toString(), FileProvider.CreateFile(Path.fileName()));
        }

        StorageManager.Instance.MarkDatabaseUpload();
        return Callback();
    }

    protected _delete(Path: webdav.Path, ctx: webdav.DeleteInfo, Callback: webdav.SimpleCallback): void {
        Logger.Trace(Logger.Type.WebDAV, `[_delete] => Delete: ${Path.toString()}`);

        if (!this.VolumeEx.existsSync(Path.toString())) {
            Logger.Trace(Logger.Type.WebDAV, `[_delete] => Delete: ${Path.toString()} => Not Found`);
            return Callback(webdav.Errors.ResourceNotFound);
        }

        this.FileProvider.DeleteFiles(
            this.VolumeEx.statSync(Path.toString()).isFile()
                ? [ this.VolumeEx.getFile(Path.toString()) ]
                : this.VolumeEx.getFilesRecursive(Path.toString())
        );
        this.VolumeEx.rmSync(Path.toString(), { recursive: true });

        StorageManager.Instance.MarkDatabaseUpload();
        return Callback();
    }

    protected async _copy(PathFrom: webdav.Path, PathTo: webdav.Path, ctx: webdav.CopyInfo, Callback: webdav.ReturnCallback<boolean>): Promise<void> {
        Logger.Trace(Logger.Type.WebDAV, `[_copy] => Copy: ${PathFrom.toString()} => ${PathTo.toString()}`);

        if (!this.VolumeEx.existsSync(PathFrom.toString()) || this.VolumeEx.existsSync(PathTo.toString())) {
            Logger.Trace(Logger.Type.WebDAV, `[_copy] => Copy: ${PathFrom.toString()} => ${PathTo.toString()} => Not Found`);
            return Callback(webdav.Errors.ResourceNotFound);
        }

        Callback(undefined, true);

        setImmediate(async () => {
            if (this.VolumeEx.statSync(PathFrom.toString()).isDirectory()) {
                for (const OldPath in this.VolumeEx.getFilesWithPathRecursive(PathFrom.toString())) {
                    const NewPath = PathTo.toString() + OldPath.substring(PathFrom.toString().length);
                    if (!await this.CopyFile(OldPath, NewPath)) return Callback(webdav.Errors.InvalidOperation);
                }
            }

            if (this.VolumeEx.statSync(PathFrom.toString()).isFile() && !await this.CopyFile(PathFrom.toString(), PathTo.toString())) 
                return Callback(webdav.Errors.InvalidOperation);
        });
    }

    protected _move(PathFrom: webdav.Path, PathTo: webdav.Path, ctx: webdav.MoveInfo, Callback: webdav.ReturnCallback<boolean>): void {
        Logger.Trace(Logger.Type.WebDAV, `[_move] => Move: ${PathFrom.toString()} => ${PathTo.toString()}`);

        if (!this.VolumeEx.existsSync(PathFrom.toString()) || this.VolumeEx.existsSync(PathTo.toString())) {
            Logger.Trace(Logger.Type.WebDAV, `[_move] => Move: ${PathFrom.toString()} => ${PathTo.toString()} => Not Found`);
            return Callback(webdav.Errors.ResourceNotFound);
        }

        this.VolumeEx.renameSync(PathFrom.toString(), PathTo.toString());
        
        if (this.VolumeEx.statSync(PathTo.toString()).isFile()) {
            const File = this.VolumeEx.getFile(PathTo.toString());
            File.Name = PathTo.toString();
            this.VolumeEx.setFile(PathTo.toString(), File);
        }

        StorageManager.Instance.MarkDatabaseUpload();
        return Callback(undefined, true);
    }

    protected _rename(PathFrom: webdav.Path, NewPath: string, ctx: webdav.RenameInfo, Callback: webdav.ReturnCallback<boolean>): void {
        Logger.Trace(Logger.Type.WebDAV, `[_rename] => Rename: ${PathFrom.toString()} => ${NewPath}`);

        if (!this.VolumeEx.existsSync(PathFrom.toString())) {
            Logger.Trace(Logger.Type.WebDAV, `[_rename] => Rename: ${PathFrom.toString()} => Not Found`);
            return Callback(webdav.Errors.ResourceNotFound);
        }

        if (this.VolumeEx.existsSync(NewPath)) {
            Logger.Trace(Logger.Type.WebDAV, `[_rename] => Rename: ${PathFrom.toString()} => ${NewPath} => Already Exists`);
            return Callback(webdav.Errors.ResourceAlreadyExists);
        }

        this.VolumeEx.renameSync(PathFrom.toString(), NewPath);
        return Callback(undefined, true);
    }

    /**
     * FILE WRITING/READING METHODS
     */
    protected async _openWriteStream(Path: webdav.Path, ctx: webdav.OpenWriteStreamInfo, Callback: webdav.ReturnCallback<Writable>): Promise<void> {
        Logger.Trace(Logger.Type.WebDAV, `[_openWriteStream] => OpenWriteStream: ${Path.toString()}`);

        if (!this.VolumeEx.statSync(Path.toString()).isFile()) {
            Logger.Trace(Logger.Type.WebDAV, `[_openWriteStream] => OpenWriteStream: ${Path.toString()} => Is Not File`);
            return Callback(webdav.Errors.InvalidOperation);
        }

        const File = this.VolumeEx.getFile(Path.toString());
        this.FileProvider.DeleteFile(File);

        Logger.Trace(Logger.Type.WebDAV, `[_openWriteStream] => OpenWriteStream: ${Path.toString()} => EstimatedSize: ${ctx.estimatedSize}`);

        File.Chunks = [];
        File.Modified = new Date();
        File.Size = ctx.estimatedSize;
        this.VolumeEx.setFile(Path.toString(), File);

        const WriteStream = this.FileProvider.CreateWriteStream(File, {
            OnEnd: () => {
                Logger.Trace(Logger.Type.WebDAV, `[_openWriteStream] => OpenWriteStream: ${Path.toString()} => OnEnd`);
                this.VolumeEx.setFile(Path.toString(), File);
                StorageManager.Instance.MarkDatabaseUpload();
            },
            OnError: (Error) => {
                if (!Error) return;
                Logger.Error(Logger.Type.WebDAV, `[_openWriteStream] => OpenWriteStream: ${Path.toString()} => OnError`, Error);
                this.VolumeEx.rmSync(Path.toString(), { recursive: true });
                StorageManager.Instance.MarkDatabaseUpload();
            }
        });

        return Callback(undefined, WriteStream);
    }

    protected async _openReadStream(Path: webdav.Path, ctx: webdav.OpenReadStreamInfo, Callback: webdav.ReturnCallback<Readable>): Promise<void> {
        Logger.Trace(Logger.Type.WebDAV, `[_openReadStream] => OpenReadStream: ${Path.toString()}`);

        if (!this.VolumeEx.statSync(Path.toString()).isFile()) {
            Logger.Trace(Logger.Type.WebDAV, `[_openReadStream] => OpenReadStream: ${Path.toString()} => Is Not File`);
            return Callback(webdav.Errors.InvalidOperation);
        }

        const File = this.VolumeEx.getFile(Path.toString());
        if (File.Chunks.length === 0) {
            Logger.Trace(Logger.Type.WebDAV, `[_openReadStream] => OpenReadStream: ${Path.toString()} => No Chunks`);
            return Callback(undefined, Readable.from(Buffer.from([])));
        }

        const ReadStream = await this.FileProvider.CreateReadStream(File);
        return Callback(undefined, ReadStream);
    }

    protected _size(Path: webdav.Path, ctx: webdav.SizeInfo, Callback: webdav.ReturnCallback<number>): void {
        Logger.Trace(Logger.Type.WebDAV, `[_size] => Size: ${Path.toString()}`);

        const FileStat = this.VolumeEx.statSync(Path.toString());
        if (!FileStat.isFile()) {
            Logger.Trace(Logger.Type.WebDAV, `[_size] => Size: ${Path.toString()} => Is Not File`);
            return Callback(webdav.Errors.ResourceNotFound);
        }

        const File = this.VolumeEx.getFile(Path.toString());
        Logger.Trace(Logger.Type.WebDAV, `[_size] => Size: ${Path.toString()} => Size: ${File.Size}, EstimatedSize: ${File.Size}`);
        return Callback(undefined, File.Size ?? File.Size);
    }

    protected _creationDate(Path: webdav.Path, ctx: webdav.CreationDateInfo, Callback: webdav.ReturnCallback<number>): void {
        Logger.Trace(Logger.Type.WebDAV, `[_creationDate] => CreationDate: ${Path.toString()}`);

        const FileStat = this.VolumeEx.statSync(Path.toString());
        if (!FileStat.isFile()) {
            Logger.Trace(Logger.Type.WebDAV, `[_creationDate] => CreationDate: ${Path.toString()} => Is Not File`);
            return Callback(undefined, new Date().getTime());
        }

        const File = this.VolumeEx.getFile(Path.toString());
        Logger.Trace(Logger.Type.WebDAV, `[_creationDate] => CreationDate: ${Path.toString()} => Date: ${File.Created.getTime()}`);
        return Callback(undefined, File.Created.getTime());
    }

    protected _lastModifiedDate(Path: webdav.Path, ctx: webdav.LastModifiedDateInfo, Callback: webdav.ReturnCallback<number>): void {
        Logger.Trace(Logger.Type.WebDAV, `[_lastModifiedDate] => LastModifiedDate: ${Path.toString()}`);

        const FileStat = this.VolumeEx.statSync(Path.toString());
        if (!FileStat.isFile()) {
            Logger.Trace(Logger.Type.WebDAV, `[_lastModifiedDate] => LastModifiedDate: ${Path.toString()} => Is Not File`);
            return Callback(undefined, new Date().getTime());
        }

        const File = this.VolumeEx.getFile(Path.toString());
        Logger.Trace(Logger.Type.WebDAV, `[_lastModifiedDate] => LastModifiedDate: ${Path.toString()} => Date: ${File.Modified.getTime()}`);
        return Callback(undefined, File.Modified.getTime());
    }
}