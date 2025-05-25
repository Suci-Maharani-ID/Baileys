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
const path_1 = require("path");
const fs_1 = require("fs");
const WAProto_1 = require("../../WAProto");
const auth_utils_1 = require("./auth-utils");
const generics_1 = require("./generics");
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
const useSQLiteAuthState = (file) => initializeDatabase().then((DB) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const dbPath = (0, path_1.join)(file);
    const folder = (0, path_1.join)(dbPath, '..');
    if (!(0, fs_1.existsSync)(folder))
        (0, fs_1.mkdirSync)(folder, { recursive: true });
    const db = new DB(dbPath);
    (_d = (_c = (_b = (_a = db.prepare) === null || _a === void 0 ? void 0 : _a.call(db, `
    CREATE TABLE IF NOT EXISTS creds (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS keys (
      compositeKey TEXT PRIMARY KEY,
      value TEXT
    );
  `)) === null || _b === void 0 ? void 0 : _b.run) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _d !== void 0 ? _d : (_e = db.exec) === null || _e === void 0 ? void 0 : _e.call(db, `
    CREATE TABLE IF NOT EXISTS creds (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS keys (
      compositeKey TEXT PRIMARY KEY,
      value TEXT
    );
  `);
    const selectCreds = (_g = (_f = db.prepare) === null || _f === void 0 ? void 0 : _f.call(db, 'SELECT data FROM creds WHERE id = 0')) !== null && _g !== void 0 ? _g : (_h = db.query) === null || _h === void 0 ? void 0 : _h.call(db, 'SELECT data FROM creds WHERE id = 0');
    const row = (_k = (_j = selectCreds === null || selectCreds === void 0 ? void 0 : selectCreds.get) === null || _j === void 0 ? void 0 : _j.call(selectCreds)) !== null && _k !== void 0 ? _k : (_l = selectCreds === null || selectCreds === void 0 ? void 0 : selectCreds.get) === null || _l === void 0 ? void 0 : _l.call(selectCreds, {});
    const creds = row ? JSON.parse(row.data, generics_1.BufferJSON.reviver) : (0, auth_utils_1.initAuthCreds)();
    const saveCreds = () => {
        var _a, _b, _c, _d, _e, _f;
        const json = JSON.stringify(creds, generics_1.BufferJSON.replacer);
        const insert = (_b = (_a = db.prepare) === null || _a === void 0 ? void 0 : _a.call(db, 'INSERT OR REPLACE INTO creds (id, data) VALUES (0, ?)')) !== null && _b !== void 0 ? _b : (_c = db.query) === null || _c === void 0 ? void 0 : _c.call(db, 'INSERT OR REPLACE INTO creds (id, data) VALUES (0, $data)');
        (_e = (_d = insert === null || insert === void 0 ? void 0 : insert.run) === null || _d === void 0 ? void 0 : _d.call(insert, json)) !== null && _e !== void 0 ? _e : (_f = insert === null || insert === void 0 ? void 0 : insert.run) === null || _f === void 0 ? void 0 : _f.call(insert, { $data: json });
    };
    const getKeys = async (type, ids) => {
        var _a, _b, _c, _d, _e, _f;
        const data = {};
        const stmt = (_b = (_a = db.prepare) === null || _a === void 0 ? void 0 : _a.call(db, 'SELECT compositeKey, value FROM keys WHERE compositeKey = ?')) !== null && _b !== void 0 ? _b : (_c = db.query) === null || _c === void 0 ? void 0 : _c.call(db, 'SELECT compositeKey, value FROM keys WHERE compositeKey = $key');
        for (const id of ids) {
            const compositeKey = `${type}-${id}`;
            const row = (_e = (_d = stmt === null || stmt === void 0 ? void 0 : stmt.get) === null || _d === void 0 ? void 0 : _d.call(stmt, compositeKey)) !== null && _e !== void 0 ? _e : (_f = stmt === null || stmt === void 0 ? void 0 : stmt.get) === null || _f === void 0 ? void 0 : _f.call(stmt, { $key: compositeKey });
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
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const insert = (_b = (_a = db.prepare) === null || _a === void 0 ? void 0 : _a.call(db, 'INSERT OR REPLACE INTO keys (compositeKey, value) VALUES (?, ?)')) !== null && _b !== void 0 ? _b : (_c = db.query) === null || _c === void 0 ? void 0 : _c.call(db, 'INSERT OR REPLACE INTO keys (compositeKey, value) VALUES ($key, $value)');
        const del = (_e = (_d = db.prepare) === null || _d === void 0 ? void 0 : _d.call(db, 'DELETE FROM keys WHERE compositeKey = ?')) !== null && _e !== void 0 ? _e : (_f = db.query) === null || _f === void 0 ? void 0 : _f.call(db, 'DELETE FROM keys WHERE compositeKey = $key');
        const transaction = (_h = (_g = db.transaction) === null || _g === void 0 ? void 0 : _g.call(db, () => {
            var _a, _b, _c, _d, _e, _f;
            for (const category in dataToSet) {
                for (const id in dataToSet[category]) {
                    const key = `${category}-${id}`;
                    const value = dataToSet[category][id];
                    if (value) {
                        (_b = (_a = insert === null || insert === void 0 ? void 0 : insert.run) === null || _a === void 0 ? void 0 : _a.call(insert, key, JSON.stringify(value, generics_1.BufferJSON.replacer))) !== null && _b !== void 0 ? _b : (_c = insert === null || insert === void 0 ? void 0 : insert.run) === null || _c === void 0 ? void 0 : _c.call(insert, { $key: key, $value: JSON.stringify(value, generics_1.BufferJSON.replacer) });
                    }
                    else {
                        (_e = (_d = del === null || del === void 0 ? void 0 : del.run) === null || _d === void 0 ? void 0 : _d.call(del, key)) !== null && _e !== void 0 ? _e : (_f = del === null || del === void 0 ? void 0 : del.run) === null || _f === void 0 ? void 0 : _f.call(del, { $key: key });
                    }
                }
            }
        })) !== null && _h !== void 0 ? _h : (() => {
            var _a, _b;
            for (const category in dataToSet) {
                for (const id in dataToSet[category]) {
                    const key = `${category}-${id}`;
                    const value = dataToSet[category][id];
                    if (value) {
                        (_a = insert === null || insert === void 0 ? void 0 : insert.run) === null || _a === void 0 ? void 0 : _a.call(insert, { $key: key, $value: JSON.stringify(value, generics_1.BufferJSON.replacer) });
                    }
                    else {
                        (_b = del === null || del === void 0 ? void 0 : del.run) === null || _b === void 0 ? void 0 : _b.call(del, { $key: key });
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
});
exports.useSQLiteAuthState = useSQLiteAuthState;
