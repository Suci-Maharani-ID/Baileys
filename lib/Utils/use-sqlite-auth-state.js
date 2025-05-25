"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSQLiteAuthState = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = require("path");
const WAProto_1 = require("../../WAProto");
const auth_utils_1 = require("./auth-utils");
const generics_1 = require("./generics");
const fs_1 = require("fs");
const useSQLiteAuthState = (file) => {
    const dbPath = (0, path_1.join)(file);
    const folder = (0, path_1.join)(dbPath, '..');
    if (!(0, fs_1.existsSync)(folder))
        (0, fs_1.mkdirSync)(folder, { recursive: true });
    const db = new better_sqlite3_1.default(dbPath);
    db.exec(`
    CREATE TABLE IF NOT EXISTS creds (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS keys (
      compositeKey TEXT PRIMARY KEY,
      value TEXT
    );
  `);
    const row = db.prepare('SELECT data FROM creds WHERE id = 0').get();
    const creds = row ? JSON.parse(row.data, generics_1.BufferJSON.reviver) : (0, auth_utils_1.initAuthCreds)();
    const saveCreds = () => {
        const json = JSON.stringify(creds, generics_1.BufferJSON.replacer);
        db.prepare('INSERT OR REPLACE INTO creds (id, data) VALUES (0, ?)').run(json);
    };
    const getKeys = async (type, ids) => {
        const data = {};
        const stmt = db.prepare('SELECT compositeKey, value FROM keys WHERE compositeKey = ?');
        for (const id of ids) {
            const compositeKey = `${type}-${id}`;
            const row = stmt.get(compositeKey);
            if (row) {
                let value = JSON.parse(row.value, generics_1.BufferJSON.reviver);
                if (type === 'app-state-sync-key') {
                    value = WAProto_1.proto.Message.AppStateSyncKeyData.fromObject(value);
                }
                data[id] = value;
            }
        }
        return data;
    };
    const setKeys = async (dataToSet) => {
        const insert = db.prepare('INSERT OR REPLACE INTO keys (compositeKey, value) VALUES (?, ?)');
        const del = db.prepare('DELETE FROM keys WHERE compositeKey = ?');
        const transaction = db.transaction(() => {
            for (const category in dataToSet) {
                for (const id in dataToSet[category]) {
                    const key = `${category}-${id}`;
                    const value = dataToSet[category][id];
                    if (value) {
                        insert.run(key, JSON.stringify(value, generics_1.BufferJSON.replacer));
                    }
                    else {
                        del.run(key);
                    }
                }
            }
        });
        transaction();
    };
    return {
        state: {
            creds,
            keys: {
                get: getKeys,
                set: setKeys
            }
        },
        saveCreds
    };
};
exports.useSQLiteAuthState = useSQLiteAuthState;
