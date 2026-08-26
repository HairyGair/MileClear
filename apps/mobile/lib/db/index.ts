// Local SQLite database operations using expo-sqlite

import * as SQLite from "expo-sqlite";

const CURRENT_SCHEMA_VERSION = 10;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  // Cache the promise (not the resolved value) so concurrent callers on
  // cold start all await the same single init. Otherwise multiple callers
  // race past the `if` check before the first has resolved, and each runs
  // initializeSchema() concurrently - causing "duplicate column name"
  // errors when two concurrent ALTER TABLE migrations both see the same
  // pre-migration schema via PRAGMA table_info.
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync("mileclear.db");
      await initializeSchema(database);
      return database;
    })().catch((err) => {
      // Reset so a retry can recover instead of wedging the app forever
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
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

    -- Finalize reads ORDER BY recorded_at and the delete-after-save consume
    -- deletes WHERE recorded_at <= ?; without this, both full-scan a table
    -- that a stuck recording can grow into the thousands (30 Jul 2026).
    CREATE INDEX IF NOT EXISTS idx_detection_coords_recorded_at
      ON detection_coordinates (recorded_at);

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

  if (currentVersion < 10) {
    // Classification feedback loop: track whether we've already reported the
    // user's first manual classification of an auto-classified trip. INTEGER
    // rather than BOOLEAN because SQLite has no native boolean type; treat 1
    // as "already sent" and 0/null as "not yet".
    const tripsInfo10 = await database.getAllAsync<{ name: string }>(
      "PRAGMA table_info(trips)"
    );
    const tripCols10 = tripsInfo10.map((c) => c.name);
    if (!tripCols10.includes("classification_auto_accepted_sent")) {
      await database.execAsync(
        "ALTER TABLE trips ADD COLUMN classification_auto_accepted_sent INTEGER;"
      );
    }
  }

  // Always update schema version to current
  await database.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('schema_version', ?)",
    [String(CURRENT_SCHEMA_VERSION)]
  );
}

// ── Local data ownership (GDPR, 14 Aug 2026) ────────────────────────────
//
// Until now `logout()` cleared the keychain and stopped the engines but
// never touched SQLite, and nothing cleared it on login either. So a
// second person signing in on the same handset inherited the first
// person's entire local history: every trip, every breadcrumb, and the
// home/work pins in `saved_locations`. Shared households, resold phones
// and support-loaner devices all hit it.
//
// The wipe is deliberately keyed on "a DIFFERENT user signed in", not on
// logout. Logging out is routine (a 401 during a drive does it), and this
// database is the only copy of anything still sitting in `sync_queue` —
// wiping on logout would turn a transient auth failure into permanent
// data loss, which is the exact class of bug this app has spent months
// fixing. A different user arriving is the point at which keeping the
// data becomes a confidentiality problem rather than a safety net.

const LOCAL_DATA_OWNER_KEY = "local_data_owner_user_id";

/**
 * Every table holding a user's own data. Children first so the intent is
 * readable; SQLite has no FK enforcement here, so the order is cosmetic.
 * `tracking_state` is included because it carries raw GPS anchors
 * (`departure_anchor_lat/lng`, `stop_anchor`, `quick_trip_start`).
 */
const USER_DATA_TABLES = [
  "coordinates",
  "shift_coordinates",
  "detection_coordinates",
  "detection_events",
  "trips",
  "shifts",
  "fuel_logs",
  "earnings",
  "saved_locations",
  "learned_routes",
  "classification_rules",
  "work_schedule",
  "notification_prefs",
  "layout_prefs",
  "sync_queue",
  "tracking_state",
];

/**
 * Delete every row of user data from the local database. DELETE rather
 * than DROP so the schema and its version survive: the next user gets a
 * ready database instead of a migration on first launch.
 *
 * Each table is cleared independently — a table missing on an older
 * install must not abort the wipe half-done.
 */
export async function resetLocalData(): Promise<void> {
  const db = await getDatabase();
  for (const table of USER_DATA_TABLES) {
    try {
      await db.runAsync(`DELETE FROM ${table}`);
    } catch {
      // Table absent on this schema version; nothing to clear.
    }
  }
  // Re-stamp the schema version, which lived in the table we just cleared.
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('schema_version', ?)",
    [String(CURRENT_SCHEMA_VERSION)]
  );
}

export async function getLocalDataOwner(): Promise<string | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [LOCAL_DATA_OWNER_KEY]
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setLocalDataOwner(userId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    [LOCAL_DATA_OWNER_KEY, userId]
  );
}

/**
 * Called on every authenticated sign-in. Wipes local data only when we
 * can positively prove a different user is taking over the device.
 *
 * Fail-safe by construction: an unreadable token, an unreadable database
 * or a first-run install with no recorded owner all fall through to
 * "adopt, don't wipe". Existing installs upgrading to this build are
 * therefore adopted by whoever is already signed in, and keep their data.
 *
 * Returns true if a wipe happened, for the caller's logging.
 */
export async function claimLocalDataFor(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const previous = await getLocalDataOwner();
  const differentUser = previous !== null && previous !== userId;
  if (differentUser) {
    await resetLocalData();
  }
  try {
    await setLocalDataOwner(userId);
  } catch {
    // Owner not recorded; next sign-in adopts rather than wipes. Safe.
  }
  return differentUser;
}
