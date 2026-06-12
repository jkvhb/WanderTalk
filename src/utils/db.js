import { openDB } from 'idb'

const DB_NAME = 'wandertalk'
const DB_VERSION = 1
let dbPromise = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('trip')) db.createObjectStore('trip')
        if (!db.objectStoreNames.contains('routeCache')) db.createObjectStore('routeCache')
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
