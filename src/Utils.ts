import fs from 'node:fs';
import path from 'node:path';

export default class Utils {
    static ReadFileOrNull(Path: string): string|null {
        if (!fs.existsSync(Path)) return null;
        return fs.readFileSync(Path, 'utf-8');
    }

    static ReadDirRecursive(Directory: string): string[] {
        let Files: string[] = [];
        const ReadDir = fs.readdirSync(Directory);
    
        for (const File of ReadDir) {
            const PathFile = path.join(Directory, File);
    
            if (fs.statSync(PathFile).isDirectory()) {
                Files = Files.concat(Utils.ReadDirRecursive(PathFile));
            } else {
                Files.push(PathFile);
            }
        }
    
        return Files;
    }

    static RandomString(Length: number): string {
        const Characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let Result = '';
    
        for (let i = 0; i < Length; i++) {
            Result += Characters.charAt(Math.floor(Math.random() * Characters.length));
        }
    
        return Result;
    }
}