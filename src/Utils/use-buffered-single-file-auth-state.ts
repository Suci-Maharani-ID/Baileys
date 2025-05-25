import { readFile, writeFile, stat, mkdir } from 'fs/promises'
import { join } from 'path'
import { proto } from '../../WAProto'
import { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '../Types'
import { initAuthCreds } from './auth-utils'
import { BufferJSON } from './generics'

type InternalAuthState = {
  creds: AuthenticationCreds
  keys: Record<string, any>
}

export const useBufferedSingleFileAuthState = async (file: string): Promise<{
  state: AuthenticationState,
  saveCreds: () => Promise<void>
}> => {
  const filePath = join(file)

  let auth: InternalAuthState = {
    creds: initAuthCreds(),
    keys: {}
  }

  try {
    const folder = join(filePath, '..')
    const info = await stat(folder).catch(() => null)
    if (!info || !info.isDirectory()) {
      await mkdir(folder, { recursive: true })
    }
  } catch (err) {
    throw new Error(`Failed to create auth directory: ${err}`)
  }

  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw, BufferJSON.reviver)
    auth = {
      creds: parsed.creds || initAuthCreds(),
      keys: parsed.keys || {}
    }
  } catch { }

  let writePending = false
  let dirty = false

  const scheduleWrite = () => {
    if (!writePending) {
      writePending = true
      setTimeout(async () => {
        writePending = false
        if (dirty) {
          dirty = false
          await writeFile(filePath, JSON.stringify(auth, BufferJSON.replacer))
        }
      }, 25) // batch window
    }
  }

  return {
    state: {
      creds: auth.creds,
      keys: {
        get: async (type, ids) => {
          const data: { [_: string]: SignalDataTypeMap[typeof type] } = {}
          for (const id of ids) {
            let value = auth.keys?.[`${type}-${id}`]
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value)
            }
            data[id] = value
          }
          return data
        },
        set: async dataToSet => {
          for (const category in dataToSet) {
            for (const id in dataToSet[category]) {
              const compositeKey = `${category}-${id}`
              const value = dataToSet[category][id]
              if (value) auth.keys[compositeKey] = value
              else delete auth.keys[compositeKey]
            }
          }
          dirty = true
          scheduleWrite()
        }
      }
    },
    saveCreds: async () => {
      dirty = true
      await writeFile(filePath, JSON.stringify(auth, BufferJSON.replacer))
    }
  }
}
