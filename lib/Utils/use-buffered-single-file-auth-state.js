"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useBufferedSingleFileAuthState = void 0;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const WAProto_1 = require("../../WAProto");
const auth_utils_1 = require("./auth-utils");
const generics_1 = require("./generics");
const useBufferedSingleFileAuthState = async (file) => {
    const filePath = (0, path_1.join)(file);
    let auth = {
        creds: (0, auth_utils_1.initAuthCreds)(),
        keys: {}
    };
    try {
        const folder = (0, path_1.join)(filePath, '..');
        const info = await (0, promises_1.stat)(folder).catch(() => null);
        if (!info || !info.isDirectory()) {
            await (0, promises_1.mkdir)(folder, { recursive: true });
        }
    }
    catch (err) {
        throw new Error(`Failed to create auth directory: ${err}`);
    }
    try {
        const raw = await (0, promises_1.readFile)(filePath, 'utf-8');
        const parsed = JSON.parse(raw, generics_1.BufferJSON.reviver);
        auth = {
            creds: parsed.creds || (0, auth_utils_1.initAuthCreds)(),
            keys: parsed.keys || {}
        };
    }
    catch (_a) { }
    let writePending = false;
    let dirty = false;
    const scheduleWrite = () => {
        if (!writePending) {
            writePending = true;
            setTimeout(async () => {
                writePending = false;
                if (dirty) {
                    dirty = false;
                    await (0, promises_1.writeFile)(filePath, JSON.stringify(auth, generics_1.BufferJSON.replacer));
                }
            }, 25); // batch window
        }
    };
    return {
        state: {
            creds: auth.creds,
            keys: {
                get: async (type, ids) => {
                    var _a;
                    const data = {};
                    for (const id of ids) {
                        let value = (_a = auth.keys) === null || _a === void 0 ? void 0 : _a[`${type}-${id}`];
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
                                auth.keys[compositeKey] = value;
                            else
                                delete auth.keys[compositeKey];
                        }
                    }
                    dirty = true;
                    scheduleWrite();
                }
            }
        },
        saveCreds: async () => {
            dirty = true;
            await (0, promises_1.writeFile)(filePath, JSON.stringify(auth, generics_1.BufferJSON.replacer));
        }
    };
};
exports.useBufferedSingleFileAuthState = useBufferedSingleFileAuthState;
