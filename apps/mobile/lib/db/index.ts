// Local SQLite database operations using expo-sqlite

import * as SQLite from "expo-sqlite";

const CURRENT_SCHEMA_VERSION = 2;

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("mileclear.db");
    await initializeSchema(db);
  }
  return db;
}

async function initializeSchema(database: SQLite.SQLiteDatabase): Promise<void> {
  // Create base tables (idempotent)
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      shift_id TEXT,
      vehicle_id TEXT,
      start_lat REAL NOT NULL,
      start_lng REAL NOT NULL,
      end_lat REAL,
      end_lng REAL,
      start_address TEXT,
      end_address TEXT,
      distance_miles REAL NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      is_manual_entry INTEGER NOT NULL DEFAULT 0,
      classification TEXT NOT NULL DEFAULT 'business',
      platform_tag TEXT,
      notes TEXT,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS coordinates (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      speed REAL,
      accuracy REAL,
      recorded_at TEXT NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(id)
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS fuel_logs (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT,
      litres REAL NOT NULL,
      cost_pence INTEGER NOT NULL,
      station_name TEXT,
      odometer_reading REAL,
      logged_at TEXT NOT NULL,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS earnings (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      amount_pence INTEGER NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      source TEXT NOT NULL,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS shift_coordinates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      speed REAL,
      accuracy REAL,
      recorded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracking_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS detection_coordinates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      speed REAL,
      accuracy REAL,
      recorded_at TEXT NOT NULL
    );
  `);

  // Schema versioning — upgrade sync_queue if needed
  const versionRow = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'schema_version'"
  );
  const currentVersion = versionRow ? parseInt(versionRow.value, 10) : 1;

  if (currentVersion < 2) {
    // sync_queue has no production data, safe to recreate with full columns
    await database.execAsync(`
      DROP TABLE IF EXISTS sync_queue;

      CREATE TABLE sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );

      INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('schema_version', '${CURRENT_SCHEMA_VERSION}');
    `);
  } else {
    // Ensure sync_queue exists for fresh installs at current version
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );
    `);
  }
}
