"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSingleFileAuthState = void 0;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const async_mutex_1 = require("async-mutex");
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
const useSingleFileAuthState = async (file) => {
    const filePath = (0, path_1.join)(file);
    const mutex = getFileLock(filePath);
    const writeFullState = async (data) => {
        await mutex.runExclusive(() => (0, promises_1.writeFile)(filePath, JSON.stringify(data, generics_1.BufferJSON.replacer)));
    };
    const readFullState = async () => {
        try {
            return await mutex.runExclusive(async () => {
                const raw = await (0, promises_1.readFile)(filePath, 'utf-8');
                return JSON.parse(raw, generics_1.BufferJSON.reviver);
            });
        }
        catch (_a) {
            return {};
        }
    };
    const dir = (0, path_1.join)(filePath, '..');
    try {
        const folderInfo = await (0, promises_1.stat)(dir);
        if (!folderInfo.isDirectory())
            throw new Error(`Not a directory: ${dir}`);
    }
    catch (_a) {
        await (0, promises_1.mkdir)(dir, { recursive: true });
    }
    const saved = await readFullState();
    const creds = saved.creds || (0, auth_utils_1.initAuthCreds)();
    const keys = saved.keys || {};
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let value = keys === null || keys === void 0 ? void 0 : keys[`${type}-${id}`];
                        if (type === 'app-state-sync-key' && value) {
                            value = WAProto_1.proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }
                    return data;
                },
                set: async (dataToSet) => {
                    for (const category in dataToSet) {
                        for (const id in dataToSet[category]) {
                            const compositeKey = `${category}-${id}`;
                            const value = dataToSet[category][id];
                            if (value)
                                keys[compositeKey] = value;
                            else
                                delete keys[compositeKey];
                        }
                    }
                    await writeFullState({ creds, keys });
                }
            }
        },
        saveCreds: async () => {
            await writeFullState({ creds, keys });
        }
    };
};
exports.useSingleFileAuthState = useSingleFileAuthState;
