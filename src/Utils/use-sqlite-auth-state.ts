let Database

async function initializeDatabase() {
  try {
    // @ts-ignore
    const mod = await import('bun:sqlite')
    return mod.Database
  } catch {
    const mod = await import('better-sqlite3')
    return mod.default
  }
}

import { join } from 'path'
import { proto } from '../../WAProto'
import { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '../Types'
import { initAuthCreds } from './auth-utils'
import { BufferJSON } from './generics'

export const useSQLiteAuthState = async (dbPath: string): Promise<{
  state: AuthenticationState,
  saveCreds: () => Promise<void>
}> => {
  const DBClass = await initializeDatabase()
  const db = new DBClass(dbPath)

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
  `)

  let creds: AuthenticationCreds = initAuthCreds()
  const credRow = db.prepare('SELECT data FROM creds WHERE id = 0').get()
  if (credRow) {
    creds = JSON.parse(credRow.data, BufferJSON.reviver)
  }

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data: { [_: string]: SignalDataTypeMap[typeof type] } = {}
        for (const id of ids) {
          const row = db.prepare('SELECT value FROM keys WHERE category = ? AND id = ?')
                          .get(type, id)
          if (row) {
            let value = JSON.parse(row.value, BufferJSON.reviver)
            if (type === 'app-state-sync-key') {
              value = proto.Message.AppStateSyncKeyData.fromObject(value)
            }
            data[id] = value
          }
        }
        return data
      },
      set: async data => {
        const insert = db.prepare(
          'INSERT OR REPLACE INTO keys (category, id, value) VALUES (?, ?, ?)'
        )
        const del = db.prepare(
          'DELETE FROM keys WHERE category = ? AND id = ?'
        )
        const txn = db.transaction(() => {
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id]
              if (value) {
                insert.run(category, id, JSON.stringify(value, BufferJSON.replacer))
              } else {
                del.run(category, id)
              }
            }
          }
        })
        txn()
      }
    }
  }

  return {
    state,
    saveCreds: async () => {
      const upsert = db.prepare(
        'INSERT OR REPLACE INTO creds (id, data) VALUES (0, ?)' 
      )
      upsert.run(JSON.stringify(state.creds, BufferJSON.replacer))
    }
  }
} 
