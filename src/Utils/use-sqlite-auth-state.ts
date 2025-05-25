import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { proto } from '../../WAProto'
import { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '../Types'
import { initAuthCreds } from './auth-utils'
import { BufferJSON } from './generics'

let Database: any

try {
  Database = (await import('bun:sqlite')).Database
} catch {
  Database = (await import('better-sqlite3')).default
}

type InternalAuthState = {
  creds: AuthenticationCreds
}

export const useSQLiteAuthState = (file: string): {
  state: AuthenticationState,
  saveCreds: () => void
} => {
  const dbPath = join(file)
  const folder = join(dbPath, '..')

  if (!existsSync(folder)) mkdirSync(folder, { recursive: true })

  const db = new Database(dbPath)

  db.prepare?.(`
    CREATE TABLE IF NOT EXISTS creds (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS keys (
      compositeKey TEXT PRIMARY KEY,
      value TEXT
    );
  `)?.run?.() ?? db.exec?.(`
    CREATE TABLE IF NOT EXISTS creds (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS keys (
      compositeKey TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  const selectCreds = db.prepare?.('SELECT data FROM creds WHERE id = 0') ?? db.query?.('SELECT data FROM creds WHERE id = 0')
  const row = selectCreds?.get?.() ?? selectCreds?.get?.({})
  const creds: AuthenticationCreds = row ? JSON.parse(row.data, BufferJSON.reviver) : initAuthCreds()

  const saveCreds = () => {
    const json = JSON.stringify(creds, BufferJSON.replacer)
    const insert = db.prepare?.('INSERT OR REPLACE INTO creds (id, data) VALUES (0, ?)') ?? db.query?.('INSERT OR REPLACE INTO creds (id, data) VALUES (0, $data)')
    insert?.run?.(json) ?? insert?.run?.({ $data: json })
  }

  const getKeys = async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
    const data = {} as { [id: string]: SignalDataTypeMap[T] }
    const stmt = db.prepare?.('SELECT compositeKey, value FROM keys WHERE compositeKey = ?') ?? db.query?.('SELECT compositeKey, value FROM keys WHERE compositeKey = $key')

    for (const id of ids) {
      const compositeKey = `${type}-${id}`
      const row = stmt?.get?.(compositeKey) ?? stmt?.get?.({ $key: compositeKey })
      if (row) {
        let value = JSON.parse(row.value, BufferJSON.reviver)
        if (type === 'app-state-sync-key') {
          value = proto.Message.AppStateSyncKeyData.fromObject(value)
        }
        data[id] = value as SignalDataTypeMap[T]
      }
    }

    return data
  }

  const setKeys = async (dataToSet: Partial<{ [T in keyof SignalDataTypeMap]: { [id: string]: SignalDataTypeMap[T] | null } }>) => {
    const insert = db.prepare?.('INSERT OR REPLACE INTO keys (compositeKey, value) VALUES (?, ?)') ?? db.query?.('INSERT OR REPLACE INTO keys (compositeKey, value) VALUES ($key, $value)')
    const del = db.prepare?.('DELETE FROM keys WHERE compositeKey = ?') ?? db.query?.('DELETE FROM keys WHERE compositeKey = $key')

    const transaction = db.transaction?.(() => {
      for (const category in dataToSet) {
        for (const id in dataToSet[category]) {
          const key = `${category}-${id}`
          const value = dataToSet[category][id]
          if (value) {
            insert?.run?.(key, JSON.stringify(value, BufferJSON.replacer)) ?? insert?.run?.({ $key: key, $value: JSON.stringify(value, BufferJSON.replacer) })
          } else {
            del?.run?.(key) ?? del?.run?.({ $key: key })
          }
        }
      }
    }) ?? (() => {
      for (const category in dataToSet) {
        for (const id in dataToSet[category]) {
          const key = `${category}-${id}`
          const value = dataToSet[category][id]
          if (value) {
            insert?.run?.({ $key: key, $value: JSON.stringify(value, BufferJSON.replacer) })
          } else {
            del?.run?.({ $key: key })
          }
        }
      }
    })

    transaction()
  }

  return {
    state: {
      creds,
      keys: {
        get: getKeys,
        set: setKeys
      }
    },
    saveCreds
  }
}
