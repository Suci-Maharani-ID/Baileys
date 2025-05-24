import { Mutex } from 'async-mutex'
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
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

const ENCRYPTION_KEY = process.env.AUTH_ENC_KEY
	? Buffer.from(process.env.AUTH_ENC_KEY, 'hex')
	: randomBytes(32)

const IV_LENGTH = 12

function encryptData(data: string): string {
	const iv = randomBytes(IV_LENGTH)
	const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
	const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
	const authTag = cipher.getAuthTag()
	return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

function decryptData(encData: string): string {
	const buffer = Buffer.from(encData, 'base64')
	const iv = buffer.slice(0, IV_LENGTH)
	const authTag = buffer.slice(IV_LENGTH, IV_LENGTH + 16)
	const encrypted = buffer.slice(IV_LENGTH + 16)
	const decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
	decipher.setAuthTag(authTag)
	return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8')
}

export const useEncryptedMultiFileAuthState = async (
	folder: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
	const fixFileName = (file?: string) =>
		file?.replace(/\//g, '__')?.replace(/:/g, '-')

	const writeData = async (data: any, file: string) => {
		const filePath = join(folder, fixFileName(file)!)
		const mutex = getFileLock(filePath)
		return mutex.acquire().then(async (release) => {
			try {
				let json = JSON.stringify(data, BufferJSON.replacer)
				if (file === 'creds.json') json = encryptData(json)
				await writeFile(filePath, json, 'utf-8')
			} finally {
				release()
			}
		})
	}

	const readData = async (file: string) => {
		try {
			const filePath = join(folder, fixFileName(file)!)
			const mutex = getFileLock(filePath)
			return await mutex.acquire().then(async (release) => {
				try {
					let data = await readFile(filePath, 'utf-8')
					if (file === 'creds.json') data = decryptData(data)
					return JSON.parse(data, BufferJSON.reviver)
				} finally {
					release()
				}
			})
		} catch {
			return null
		}
	}

	const removeData = async (file: string) => {
		try {
			const filePath = join(folder, fixFileName(file)!)
			const mutex = getFileLock(filePath)
			return mutex.acquire().then(async (release) => {
				try {
					await unlink(filePath)
				} finally {
					release()
				}
			})
		} catch {}
	}

	const folderInfo = await stat(folder).catch(() => undefined)
	if (folderInfo) {
		if (!folderInfo.isDirectory()) {
			throw new Error(`Not a directory: ${folder}`)
		}
	} else {
		await mkdir(folder, { recursive: true })
	}

	const creds: AuthenticationCreds = (await readData('creds.json')) || initAuthCreds()

	return {
		state: {
			creds,
			keys: {
				get: async (type, ids) => {
					const data: { [_: string]: SignalDataTypeMap[typeof type] } = {}
					await Promise.all(
						ids.map(async (id) => {
							let value = await readData(`${type}-${id}.json`)
							if (type === 'app-state-sync-key' && value) {
								value = proto.Message.AppStateSyncKeyData.fromObject(value)
							}
							data[id] = value
						})
					)
					return data
				},
				set: async (data) => {
					const tasks: Promise<void>[] = []
					for (const category in data) {
						for (const id in data[category]) {
							const value = data[category][id]
							const file = `${category}-${id}.json`
							tasks.push(value ? writeData(value, file) : removeData(file))
						}
					}
					await Promise.all(tasks)
				}
			}
		},
		saveCreds: async () => {
			return writeData(creds, 'creds.json')
		}
	}
}
