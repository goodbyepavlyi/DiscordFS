import { PassThrough, Readable, Writable } from 'stream';
import { MutableBuffer } from 'mutable-buffer';
import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';

import Logger from '../../Logger';
import Utils from '../../Utils';
import { IFile } from './VolumeEx'
import { MaxChunkSize } from '../StorageManager';
import DiscordBot from '../../Discord/DiscordBot';
import Crypto from '../../Utils/Crypto';

export default class FileProvider {
    public static CreateFile(Name: string): IFile {
        return new IFile(Name, [], new Date(), new Date());
    }

    public async DeleteFile(File: IFile) {
        Logger.Debug(Logger.Type.StorageManager, `Deleting file &c${File.Name}&r`);

        for (const Chunk of File.Chunks) {
            Logger.Debug(Logger.Type.StorageManager, `Deleting chunk &c${Chunk.MessageID}&r of file &c${File.Name}&r`);
            await DiscordBot.Instance.DeleteMessage(Chunk.MessageID, 'Storage')
                .catch(Error => {
                    if (Error instanceof DiscordAPIError && Error.code === RESTJSONErrorCodes.UnknownMessage) {
                        Logger.Debug(Logger.Type.StorageManager, `Chunk &c${Chunk.MessageID}&r of file &c${File.Name}&r not found`);
                        return;
                    }
                    
                    Logger.Error(Logger.Type.StorageManager, `An error occured while &cdeleting chunk &c${Chunk.MessageID}&r of file &c${File.Name}&r, error:`, Error);
                })
        }
    }

    public async DeleteFiles(Files: IFile[]) {
        for (const File of Files) {
            await this.DeleteFile(File);
        }
    }

    public async UploadFileChunk(File: IFile, Chunk: MutableBuffer) {
        return new Promise<void>(async (Resolve, Reject) => {
            Logger.Debug(Logger.Type.StorageManager, `Uploading chunk &c${File.Chunks.length + 1}&r of file &c${File.Name}&r`);

            let ChunkSize = Chunk.size;
            await DiscordBot.Instance.SendMessage({
                files: [{ attachment: Chunk.flush(), name: process.env.ENCRYPTION_KEY ? Utils.RandomString(16) : File.Name }], 
            }, 'Storage')
                .then(x => {
                    Logger.Debug(Logger.Type.StorageManager, `Uploaded chunk &c${File.Chunks.length + 1}&r of file &c${File.Name}&r`);
                    File.Chunks.push({ MessageID: x.id, Size: ChunkSize, Url: x.attachments.first()?.url! })
                    Resolve();
                })
                .catch(Reject);
        });
    }

    public CreateWriteStream(File: IFile, Callbacks?: IFileCallbacks): Writable {
        return process.env.ENCRYPTION_KEY ? this.CreateEncryptedWriteStream(File, Callbacks) : this.CreateUnencryptedWriteStream(File, Callbacks);
    }

    private CreateUnencryptedWriteStream(File: IFile, Callbacks?: IFileCallbacks): Writable {
        const TotalChunks = Math.ceil(File.Size / MaxChunkSize);
        const Buffer = new MutableBuffer(TotalChunks);

        return new Writable({
            write: async (Chunk: Buffer, Encoding: BufferEncoding, Callback: () => void) => {
                if (Buffer.size + Chunk.length > MaxChunkSize) {
                    await this.UploadFileChunk(File, Buffer);
                    Buffer.clear();
                }

                Buffer.write(Chunk, Encoding);
                Callbacks?.OnChunk?.(Chunk);
                return Callback();
            },
            final: async (Callback: () => void) => {
                if (Buffer.size > 0) {
                    await this.UploadFileChunk(File, Buffer);
                    Buffer.clear();
                }

                Callbacks?.OnEnd?.();
                return Callback();
            },
            destroy: (Error: Error|null, Callback: (Error?: Error|null) => void) => {
                Buffer.clear();
                Callbacks?.OnError?.(Error!);
                return Callback(Error);
            }
        });
    }

    private CreateEncryptedWriteStream(File: IFile, Callbacks?: IFileCallbacks): Writable {
        const UnencryptedStream = this.CreateUnencryptedWriteStream(File, Callbacks);

        return new Writable({
            write: (Chunk: Buffer, Encoding: BufferEncoding, Callback: () => void) => {
                try {
                    const EncryptedChunk = Buffer.from(Crypto.Encrypt(Chunk.toString('utf8')));
                    UnencryptedStream.write(EncryptedChunk, 'utf-8', Callback);
                } catch (Error: any) {
                    Logger.Error(Logger.Type.StorageManager, 'An error occured while encrypting a chunk:', Error);
                    UnencryptedStream.destroy(Error);
                    Callbacks?.OnError?.(Error);
                }
            },
            final: (Callback: () => void) => {
                UnencryptedStream.end(Callback);
            }
        });
    }

    public CreateReadStream(File: IFile): Promise<Readable> {
        return process.env.ENCRYPTION_KEY ? this.CreateEncryptedReadStream(File) : this.CreateUnencryptedReadStream(File);
    }

    private async CreateUnencryptedReadStream(File: IFile): Promise<Readable> {
        const Stream = new PassThrough();

        const DownloadChunk = async (Url: string, RetryAttempt: number = 0): Promise<Buffer> => {
            try {
                const Response = await fetch(Url);
                if (!Response.ok) throw new Error(`Failed to fetch chunk from ${Url}: ${Response.statusText}`);
                return Buffer.from(await Response.arrayBuffer());
            } catch (Error) {
                if (RetryAttempt == 3) throw Error;
                Logger.Warn(Logger.Type.StorageManager, `Failed to download chunk from &c${Url}&r, retrying...`);
                return DownloadChunk(Url, RetryAttempt + 1);
            }
        }

        try {
            for (const Chunk of File.Chunks) {
                const ChunkData = await DownloadChunk(Chunk.Url);
                Stream.write(ChunkData);
            }

            Stream.end();
            return Stream;
        } catch (Error) {
            Stream.destroy(Error as any);
            return Stream;
        }
    }

    private async CreateEncryptedReadStream(File: IFile): Promise<Readable> {
        const DataStream = await this.CreateUnencryptedReadStream(File);
        const DecryptedStream = new PassThrough();
    
        DataStream.on('data', (Chunk: Buffer) => {
            try {
                const DecryptedChunk = Buffer.from(Crypto.Decrypt(Chunk.toString('utf-8')), 'utf-8');
                DecryptedStream.write(DecryptedChunk, 'utf-8');
            } catch (Error: any) {
                Logger.Error(Logger.Type.StorageManager, 'An error occured while decrypting a chunk:', Error);
                DecryptedStream.destroy(Error);
            }
        });

        DataStream.on('end', () => {
            DataStream.destroy();
            DecryptedStream.end();
        });

        return DecryptedStream;
    }
}

interface IFileCallbacks {
    OnChunk?: (Chunk: Buffer) => void;
    OnEnd?: () => void;
    OnError?: (Error: Error) => void;
}