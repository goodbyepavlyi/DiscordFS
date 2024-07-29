const { Volume } = require("memfs");

module.exports = class VolumeEx extends Volume {
    /**
     * @param {import("memfs").DirectoryJSON} json 
     * @param {string | undefined} cwd 
     * @returns {VolumeEx}
     */
    static fromJSON(json, cwd) {
        const vol = new VolumeEx(cwd);
        vol.fromJSON(json);
        return vol;
    }

    /**
     * @param {string} path 
     * @returns {import("../DocTypes").IFile}
     */
    getFile = (path) => JSON.parse(this.readFileSync(path).toString(), (k, v) => {
        return k === "created" || k === "modified" ? new Date(v) : v;
    });

    /**
     * @param {string} path 
     * @param {import("../DocTypes").IFile} file 
     */
    setFile = (path, file) => this.writeFileSync(path, JSON.stringify(file));

    /**
     * @param {string} initial 
     * @param {string[]} paths 
     */
    getFilesPathsRecursive(initial, paths = []) {
        const files = this.readdirSync(initial, { withFileTypes: true });

        for (const file of files) {
            const path = `${initial}/${file.name}`;
            if (file.isDirectory()) this.getFilesPathsRecursive(path, paths);
            else paths.push(path);
        }

        return paths;
    }

    /**
     * @param {string} path 
     * @returns {import("../DocTypes").IFile[]}
     */
    getFilesRecursive = (path) => this.getFilesPathsRecursive(path).map(p => this.getFile(p));

    /**
     * @param {string} path 
     * @returns {Record<string, import("../DocTypes").IFile>}
     */
    getFilesWithPathRecursive = (path) => this.getFilesPathsRecursive(path).reduce((acc, path) => {
        acc[path] = this.getFile(path);
        return acc;
    }, {});

    /**
     * @param {string} path 
     * @returns {string[]}
     */
    getPathsRecursive = (path) => this.getFilesPathsRecursive(path);

    /**
     * @param {string} path 
     * @returns {number}
     */
    getTreeSizeRecursive = (path) => this.getFilesRecursive(path).reduce((acc, file) => acc + file.size, 0);
}