/**
 * @typedef {object} IFile
 * @property {string} name
 * @property {number} size
 * @property {IChunkInfo[]} chunks
 * @property {Date} created
 * @property {Date} modified
 */

/**
 * @typedef {object} IChunkInfo
 * @param {string} id
 * @param {number} size
 * @param {string} url
 */

/**
 * @typedef {object} IFilesDesc
 * @returns {Record<string, IFile>}
 */

module.exports = {
    IFile,
    IChunkInfo,
    IFilesDesc
};