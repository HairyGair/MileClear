// Local SQLite database operations using expo-sqlite

import * as SQLite from "expo-sqlite";

const CURRENT_SCHEMA_VERSION = 9;

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
      category TEXT,
      business_purpose TEXT,
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
      latitude REAL,
      longitude REAL,
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

    CREATE TABLE IF NOT EXISTS detection_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at TEXT NOT NULL,
      event TEXT NOT NULL,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS saved_locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location_type TEXT NOT NULL DEFAULT 'custom',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius_meters INTEGER NOT NULL DEFAULT 150,
      geofence_enabled INTEGER NOT NULL DEFAULT 1,
      synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_prefs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS layout_prefs (
      screen TEXT NOT NULL,
      section_key TEXT NOT NULL,
      visible INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (screen, section_key)
    );

    CREATE TABLE IF NOT EXISTS work_schedule (
      day_of_week INTEGER PRIMARY KEY,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS learned_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_lat REAL NOT NULL,
      start_lng REAL NOT NULL,
      end_lat REAL NOT NULL,
      end_lng REAL NOT NULL,
      classification TEXT NOT NULL,
      platform_tag TEXT,
      match_count INTEGER NOT NULL DEFAULT 1,
      last_matched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classification_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_type TEXT NOT NULL,
      name TEXT NOT NULL,
      classification TEXT NOT NULL,
      platform_tag TEXT,
      config TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
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

  if (currentVersion >= 3 && currentVersion < 4) {
    // saved_locations and notification_prefs tables were added in schema v4.
    // No ALTER TABLE needed — fresh installs get them from CREATE TABLE IF NOT EXISTS above.
    // Existing installs at v3 will have them created on first open at the top of initializeSchema.
  }

  if (currentVersion >= 2 && currentVersion < 3) {
    // Only ALTER if upgrading from v2 AND columns don't already exist
    const tableInfo = await database.getAllAsync<{ name: string }>(
      "PRAGMA table_info(fuel_logs)"
    );
    const columns = tableInfo.map((c) => c.name);
    if (!columns.includes("latitude")) {
      await database.execAsync("ALTER TABLE fuel_logs ADD COLUMN latitude REAL;");
    }
    if (!columns.includes("longitude")) {
      await database.execAsync("ALTER TABLE fuel_logs ADD COLUMN longitude REAL;");
    }
  }

  if (currentVersion < 5) {
    // Add category and business_purpose columns to trips table
    const tripsInfo = await database.getAllAsync<{ name: string }>(
      "PRAGMA table_info(trips)"
    );
    const tripCols = tripsInfo.map((c) => c.name);
    if (!tripCols.includes("category")) {
      await database.execAsync("ALTER TABLE trips ADD COLUMN category TEXT;");
    }
    if (!tripCols.includes("business_purpose")) {
      await database.execAsync("ALTER TABLE trips ADD COLUMN business_purpose TEXT;");
    }
  }

  if (currentVersion < 8) {
    // Add classification intelligence columns to trips
    const tripsInfo8 = await database.getAllAsync<{ name: string }>(
      "PRAGMA table_info(trips)"
    );
    const tripCols8 = tripsInfo8.map((c) => c.name);
    if (!tripCols8.includes("classification_source")) {
      await database.execAsync("ALTER TABLE trips ADD COLUMN classification_source TEXT;");
    }
    if (!tripCols8.includes("suggested_classification")) {
      await database.execAsync("ALTER TABLE trips ADD COLUMN suggested_classification TEXT;");
    }
    if (!tripCols8.includes("suggested_platform")) {
      await database.execAsync("ALTER TABLE trips ADD COLUMN suggested_platform TEXT;");
    }
  }

  // Always update schema version to current
  await database.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('schema_version', ?)",
    [String(CURRENT_SCHEMA_VERSION)]
  );
}
