"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSQLiteAuthState = void 0;
let Database;
async function initializeDatabase() {
    try {
        // @ts-ignore
        const mod = await Promise.resolve().then(() => __importStar(require('bun:sqlite')));
        return mod.Database;
    }
    catch (_a) {
        const mod = await Promise.resolve().then(() => __importStar(require('better-sqlite3')));
        return mod.default;
    }
}
const WAProto_1 = require("../../WAProto");
const auth_utils_1 = require("./auth-utils");
const generics_1 = require("./generics");
const useSQLiteAuthState = async (dbPath) => {
    const DBClass = await initializeDatabase();
    const db = new DBClass(dbPath);
    db.exec(`
    CREATE TABLE IF NOT EXISTS creds (
      id INTEGER PRIMARY KEY CHECK (id = 0),
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS keys (
      category TEXT,
      id TEXT,
      value TEXT,
      PRIMARY KEY (category, id)
    );
  `);
    let creds = (0, auth_utils_1.initAuthCreds)();
    const credRow = db.prepare('SELECT data FROM creds WHERE id = 0').get();
    if (credRow) {
        creds = JSON.parse(credRow.data, generics_1.BufferJSON.reviver);
    }
    const state = {
        creds,
        keys: {
            get: async (type, ids) => {
                const data = {};
                for (const id of ids) {
                    const row = db.prepare('SELECT value FROM keys WHERE category = ? AND id = ?')
                        .get(type, id);
                    if (row) {
                        let value = JSON.parse(row.value, generics_1.BufferJSON.reviver);
                        if (type === 'app-state-sync-key') {
                            value = WAProto_1.proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }
                }
                return data;
            },
            set: async (data) => {
                const insert = db.prepare('INSERT OR REPLACE INTO keys (category, id, value) VALUES (?, ?, ?)');
                const del = db.prepare('DELETE FROM keys WHERE category = ? AND id = ?');
                const txn = db.transaction(() => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            if (value) {
                                insert.run(category, id, JSON.stringify(value, generics_1.BufferJSON.replacer));
                            }
                            else {
                                del.run(category, id);
                            }
                        }
                    }
                });
                txn();
            }
        }
    };
    return {
        state,
        saveCreds: async () => {
            const upsert = db.prepare('INSERT OR REPLACE INTO creds (id, data) VALUES (0, ?)');
            upsert.run(JSON.stringify(state.creds, generics_1.BufferJSON.replacer));
        }
    };
};
exports.useSQLiteAuthState = useSQLiteAuthState;
