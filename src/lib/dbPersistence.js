const DB_NAME = 'sqliteviz_db'
const STORE_NAME = 'snapshots'

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = event => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = event => {
      resolve(event.target.result)
    }

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB for sqliteviz_db'))
    }
  })
}

async function saveDb(dbInstance) {
  if (!dbInstance || typeof dbInstance.exportRaw !== 'function') return
  try {
    const buffer = await dbInstance.exportRaw()
    const db = await openDb()
    const tx = db.transaction([STORE_NAME], 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const snapshot = {
      id: 'latest',
      buffer,
      timestamp: new Date().toISOString()
    }
    store.put(snapshot)
  } catch (e) {
    console.error('saveDb error', e)
  }
}

async function loadLastDb() {
  try {
    const db = await openDb()
    return await new Promise(resolve => {
      const tx = db.transaction([STORE_NAME], 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get('latest')
      request.onsuccess = () => {
        resolve(request.result || null)
      }
      request.onerror = () => {
        resolve(null)
      }
    })
  } catch (e) {
    console.error('loadLastDb error', e)
    return null
  }
}

async function clearDb() {
  try {
    const db = await openDb()
    await new Promise(resolve => {
      const tx = db.transaction([STORE_NAME], 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    })
  } catch (e) {
    console.error('clearDb error', e)
  }
}

export default {
  saveDb,
  loadLastDb,
  clearDb
}
