import { readFile, writeFile, stat, mkdir } from 'fs/promises'
import { join } from 'path'
import { Mutex } from 'async-mutex'
import { proto } from '../../WAProto'
import { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '../Types'
import { initAuthCreds } from './auth-utils'
import { BufferJSON } from './generics'

const fileLocks = new Map<string, Mutex>()
const getFileLock = (path: string): Mutex => {
  let mutex = fileLocks.get(path)
  if (!mutex) {
    mutex = new Mutex()
    fileLocks.set(path, mutex)
  }
  return mutex
}

export const useSingleFileAuthState = async (file: string): Promise<{
  state: AuthenticationState,
  saveCreds: () => Promise<void>
}> => {
  const filePath = join(file)
  const mutex = getFileLock(filePath)

  const writeFullState = async (data: Record<string, any>) => {
    await mutex.runExclusive(() =>
      writeFile(filePath, JSON.stringify(data, BufferJSON.replacer))
    )
  }

  const readFullState = async (): Promise<any> => {
    try {
      return await mutex.runExclusive(async () => {
        const raw = await readFile(filePath, 'utf-8')
        return JSON.parse(raw, BufferJSON.reviver)
      })
    } catch {
      return {}
    }
  }

  const dir = join(filePath, '..')
  try {
    const folderInfo = await stat(dir)
    if (!folderInfo.isDirectory()) throw new Error(`Not a directory: ${dir}`)
  } catch {
    await mkdir(dir, { recursive: true })
  }

  const saved = await readFullState()
  const creds: AuthenticationCreds = saved.creds || initAuthCreds()
  const keys = saved.keys || {}

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [_: string]: SignalDataTypeMap[typeof type] } = {}
          for (const id of ids) {
            let value = keys?.[`${type}-${id}`]
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
              if (value) keys[compositeKey] = value
              else delete keys[compositeKey]
            }
          }
          await writeFullState({ creds, keys })
        }
      }
    },
    saveCreds: async () => {
      await writeFullState({ creds, keys })
    }
  }
}
