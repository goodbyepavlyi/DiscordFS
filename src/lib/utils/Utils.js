const fs = require("fs");
const path = require("path");

class Utils {
    static readDirectoryRecursively(directory) {
        const files = [];

        fs.readdirSync(directory).forEach(file => {
            const stat = fs.statSync(path.join(directory, file));
    
            if (stat.isFile()) return files.push(path.join(directory, file));
            if (stat.isDirectory()) Utils.readDirectoryRecursively(path.join(directory, file)).forEach(walkItem => files.push(walkItem));
        });
    
        return files;
    }
    
    /**
     * @param {string} path 
     * @returns {string | undefined}
     */
    static readFileSyncOrUndefined(path) {
        try {
            return fs.readFileSync(path).toString();
        } catch (error) {
            return undefined;
        }
    }

    /**
     * @param {string} str 
     * @param {number} n 
     * @param {boolean} includeDots 
     */
    static truncate = (str, n, includeDots = false) => ((str.length > n) ? str.substring(0, n - 1) : str) + (includeDots && str.length > n ? '...' : '')
}

module.exports = Utils;