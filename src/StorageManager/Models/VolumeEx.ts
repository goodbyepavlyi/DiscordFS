import { Volume } from 'memfs';
import Dirent from 'memfs/lib/Dirent';

import VolumeExDatabase from './VolumeExDatabase';

export default class VolumeEx extends Volume {
    public static Instance: VolumeEx;

    public static CreateInstance(Data: VolumeExDatabase) {
        VolumeEx.Instance = new VolumeEx();
        VolumeEx.Instance.fromJSON(Data.ToJSON() as any);
    }

    constructor() {
        super();
    }

    public getFile(Path: string): IFile {
        return IFile.fromJSON(JSON.parse(this.readFileSync(Path).toString()));
    }

    public setFile(Path: string, File: IFile) {
        return this.writeFileSync(Path, JSON.stringify(File));
    }

    public getFilesPathsRecursive(Initial: string, Paths: string[] = []) {
        for (const File of this.readdirSync(Initial, { withFileTypes: true })) {
            if (!(File instanceof Dirent)) continue;

            const Path = `${Initial}/${File.name}`;
            if (File.isDirectory()) this.getFilesPathsRecursive(Path, Paths);
            else Paths.push(Path);
        }

        return Paths;
    }

    public getFilesRecursive(Path: string) {
        return this.getFilesPathsRecursive(Path).map(x => this.getFile(x));
    }

    public getFilesWithPathRecursive(Path: string) {
        return this.getFilesPathsRecursive(Path)
            .reduce((acc, Path) => {
                acc[Path] = this.getFile(Path);
                return acc;
            }, {} as Record<string, IFile>);
    }

    public getPathsRecursive(Path: string) {
        return this.getFilesPathsRecursive(Path);
    }

    public getTreeSizeRecursive(Path: string) {
        return this.getFilesPathsRecursive(Path).length;
    }
}

export class IFile {
    public static fromJSON(Data: any) {
        return new IFile(Data.Name, Data.Chunks, new Date(Data.Created), new Date(Data.Modified), Data.Size);
    }

    public Name: string;
    public Chunks: IChunkInfo[];
    public Created: Date;
    public Modified: Date;

    public Size: number;
    public Encrypted?: boolean;

    constructor(Name: string, Chunks: IChunkInfo[], Created: Date, Modified: Date, Size?: number) {
        this.Name = Name;
        this.Chunks = Chunks;
        this.Created = Created;
        this.Modified = Modified;
        this.Size = Size ?? 0;
    }
}

export interface IChunkInfo {
    MessageID: string;
    Size: number;
    Url: string;
}