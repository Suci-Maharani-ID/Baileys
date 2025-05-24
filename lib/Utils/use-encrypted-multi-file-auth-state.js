"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useEncryptedMultiFileAuthState = void 0;
const async_mutex_1 = require("async-mutex");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const crypto_1 = require("crypto");
const WAProto_1 = require("../../WAProto");
const auth_utils_1 = require("./auth-utils");
const generics_1 = require("./generics");
const fileLocks = new Map();
const getFileLock = (path) => {
    let mutex = fileLocks.get(path);
    if (!mutex) {
        mutex = new async_mutex_1.Mutex();
        fileLocks.set(path, mutex);
    }
    return mutex;
};
const ENCRYPTION_KEY = process.env.AUTH_ENC_KEY
    ? Buffer.from(process.env.AUTH_ENC_KEY, 'hex')
    : (0, crypto_1.randomBytes)(32);
const IV_LENGTH = 12;
function encryptData(data) {
    const iv = (0, crypto_1.randomBytes)(IV_LENGTH);
    const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}
function decryptData(encData) {
    const buffer = Buffer.from(encData, 'base64');
    const iv = buffer.slice(0, IV_LENGTH);
    const authTag = buffer.slice(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = buffer.slice(IV_LENGTH + 16);
    const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}
const useEncryptedMultiFileAuthState = async (folder) => {
    const fixFileName = (file) => { var _a; return (_a = file === null || file === void 0 ? void 0 : file.replace(/\//g, '__')) === null || _a === void 0 ? void 0 : _a.replace(/:/g, '-'); };
    const writeData = async (data, file) => {
        const filePath = (0, path_1.join)(folder, fixFileName(file));
        const mutex = getFileLock(filePath);
        return mutex.acquire().then(async (release) => {
            try {
                let json = JSON.stringify(data, generics_1.BufferJSON.replacer);
                if (file === 'creds.json')
                    json = encryptData(json);
                await (0, promises_1.writeFile)(filePath, json, 'utf-8');
            }
            finally {
                release();
            }
        });
    };
    const readData = async (file) => {
        try {
            const filePath = (0, path_1.join)(folder, fixFileName(file));
            const mutex = getFileLock(filePath);
            return await mutex.acquire().then(async (release) => {
                try {
                    let data = await (0, promises_1.readFile)(filePath, 'utf-8');
                    if (file === 'creds.json')
                        data = decryptData(data);
                    return JSON.parse(data, generics_1.BufferJSON.reviver);
                }
                finally {
                    release();
                }
            });
        }
        catch (_a) {
            return null;
        }
    };
    const removeData = async (file) => {
        try {
            const filePath = (0, path_1.join)(folder, fixFileName(file));
            const mutex = getFileLock(filePath);
            return mutex.acquire().then(async (release) => {
                try {
                    await (0, promises_1.unlink)(filePath);
                }
                finally {
                    release();
                }
            });
        }
        catch (_a) { }
    };
    const folderInfo = await (0, promises_1.stat)(folder).catch(() => undefined);
    if (folderInfo) {
        if (!folderInfo.isDirectory()) {
            throw new Error(`Not a directory: ${folder}`);
        }
    }
    else {
        await (0, promises_1.mkdir)(folder, { recursive: true });
    }
    const creds = (await readData('creds.json')) || (0, auth_utils_1.initAuthCreds)();
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}.json`);
                        if (type === 'app-state-sync-key' && value) {
                            value = WAProto_1.proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const file = `${category}-${id}.json`;
                            tasks.push(value ? writeData(value, file) : removeData(file));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            return writeData(creds, 'creds.json');
        }
    };
};
exports.useEncryptedMultiFileAuthState = useEncryptedMultiFileAuthState;
