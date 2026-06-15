import { openDB } from 'idb'

const DB_NAME = 'wandertalk'
const DB_VERSION = 3
let dbPromise = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('trip')) db.createObjectStore('trip')
        if (!db.objectStoreNames.contains('routeCache')) db.createObjectStore('routeCache')
        if (!db.objectStoreNames.contains('audioCache')) db.createObjectStore('audioCache')
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images')
      },
    })
  }
  return dbPromise
}

export async function saveTrip(plan) {
  return (await getDb()).put('trip', plan, 'current')
}

export async function loadTrip() {
  return (await getDb()).get('trip', 'current')
}

export async function clearTrip() {
  return (await getDb()).delete('trip', 'current')
}

export async function getCachedRoute(key) {
  return (await getDb()).get('routeCache', key)
}

export async function setCachedRoute(key, route) {
  return (await getDb()).put('routeCache', route, key)
}

export async function getCachedAudio(key) {
  return (await getDb()).get('audioCache', key)
}

export async function setCachedAudio(key, entry) {
  return (await getDb()).put('audioCache', entry, key)
}

// —— 节点图片（按 id 存 Blob，节点只存 id 数组）——
export async function getImage(id) {
  return (await getDb()).get('images', id)
}

export async function putImage(id, entry) {
  return (await getDb()).put('images', entry, id)
}

export async function deleteImage(id) {
  return (await getDb()).delete('images', id)
}
