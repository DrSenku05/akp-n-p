import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { access } from "node:fs/promises"
import { join } from "node:path"
import { Client } from "pg"
import { createClient } from "@/lib/supabase/server"

export const MAX_SQL_BYTES = 32 * 1024 * 1024
export const MAX_BASE64_BYTES = 44_739_244
export const BACKUP_SCHEMAS = ["public", "app_private"] as const
export const BACKUP_TABLES = [
  "announcements",
  "feedback",
  "inventory_movements",
  "order_items",
  "orders",
  "payments",
  "product_categories",
  "products",
  "promotions",
  "return_requests",
  "store_inventory_settings",
  "store_payment_settings",
  "store_settings",
] as const
export const BACKUP_FORMAT_VERSION = 1

const LOCK_CLASS_ID = 0x414b50
const LOCK_OBJECT_ID = 0x424b50
const BACKUP_MARKER = "-- AKP_DATABASE_BACKUP_FORMAT=1"
const LEGACY_BACKUP_SCOPE_MARKER = "-- AKP_DATABASE_BACKUP_SCHEMAS=public,app_private"
const BACKUP_TABLE_SCOPE_MARKER = `-- AKP_DATABASE_BACKUP_TABLES=${BACKUP_TABLES.join(",")}`
const INSERT_BATCH_SIZE = 100
const BUSINESS_DATA_DELETE_ORDER = [
  "feedback",
  "inventory_movements",
  "order_items",
  "payments",
  "return_requests",
  "orders",
  "products",
  "product_categories",
  "announcements",
  "promotions",
  "store_inventory_settings",
  "store_payment_settings",
  "store_settings",
] as const
const BUSINESS_DATA_RESTORE_ORDER = [
  "announcements",
  "product_categories",
  "products",
  "promotions",
  "store_inventory_settings",
  "store_payment_settings",
  "store_settings",
  "orders",
  "feedback",
  "inventory_movements",
  "order_items",
  "payments",
  "return_requests",
] as const

export type AdminRole = "owner" | "staff" | null
export type BackupMetadata = {
  id: string
  backup_name: string
  file_name: string
  file_size: string
  sha256: string
  format_version: number
  schema_scope: string[]
  description: string | null
  created_at: string
}

export class BackupError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message)
    this.name = "BackupError"
  }
}

export async function getActiveAdmin() {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  if (claimsError) throw new BackupError("Could not verify the administrator session.", 401)
  const userId = claimsData?.claims?.sub
  if (typeof userId !== "string") return { userId: null, role: null as AdminRole }

  const { data: admin, error } = await supabase.from("admin_users")
    .select("role,is_active")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new BackupError("Could not verify administrator access.")
  if (!admin?.is_active || (admin.role !== "owner" && admin.role !== "staff")) {
    return { userId, role: null as AdminRole }
  }
  return { userId, role: admin.role as AdminRole }
}

export function requireOwner(role: AdminRole): asserts role is "owner" {
  if (role !== "owner") throw new BackupError("Only an active owner can manage database backups.", 403)
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin || origin === "null") {
    throw new BackupError("This operation must be requested from the admin site.", 403)
  }
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      throw new BackupError("This operation must be requested from the admin site.", 403)
    }
  } catch (error) {
    if (error instanceof BackupError) throw error
    throw new BackupError("This operation must be requested from the admin site.", 403)
  }
}

function restrictRestoreToBusinessTables(sql: string) {
  const sectionPattern = /^-- (?:Name: |Data for Name: )/m
  const firstSection = sectionPattern.exec(sql)
  if (!firstSection) throw new BackupError("The SQL backup has no recognizable PostgreSQL object sections.", 422)

  const includedTables = new Set<string>(BACKUP_TABLES)
  const sections = sql.slice(firstSection.index).split(/(?=^-- (?:Name: |Data for Name: ))/m)
  const declaredTables = new Set<string>()
  const sequenceOwners = new Map<string, string>()
  const tableDataSections = new Map<string, string>()
  const sequenceDataSections: string[] = []

  for (const section of sections) {
    const header = section.match(/^-- (?:Data for )?Name: ([^;]+); Type: ([^;]+); Schema: public(?:;|$)/m)
    if (!header) continue
    const [, name, type] = header

    if (type === "TABLE") declaredTables.add(name)
    if (type === "SEQUENCE OWNED BY") {
      const owner = section.match(/OWNED BY (?:"public"|public)\.(?:"((?:""|[^"])*)"|([A-Za-z_][\w$]*))\./)
      if (owner) sequenceOwners.set(name, (owner[1] ?? owner[2]).replaceAll('""', '"'))
    }

    const dataHeader = section.match(/^-- Data for Name: ([^;]+); Type: TABLE DATA; Schema: public; Owner:/m)
    if (dataHeader && includedTables.has(dataHeader[1])) {
      tableDataSections.set(dataHeader[1], section)
    }

    const sequenceOwner = sequenceOwners.get(name)
      ?? BACKUP_TABLES.find((table) => name.startsWith(`${table}_`))
    if (type === "SEQUENCE SET" && sequenceOwner && includedTables.has(sequenceOwner)) {
      sequenceDataSections.push(section)
    }
  }

  if (!sql.includes(`${BACKUP_TABLE_SCOPE_MARKER}\n`)) {
    const missingTables = BACKUP_TABLES.filter((table) => !declaredTables.has(table))
    if (missingTables.length) {
      throw new BackupError(`This older backup is missing required business tables: ${missingTables.join(", ")}.`, 422)
    }
  }

  const deleteStatements = BUSINESS_DATA_DELETE_ORDER
    .map((table) => `DELETE FROM "public"."${table}";`)
  const orderedDataSections = BUSINESS_DATA_RESTORE_ORDER
    .map((table) => tableDataSections.get(table))
    .filter((section): section is string => section !== undefined)
  return `${deleteStatements.join("\n")}\n${[...orderedDataSections, ...sequenceDataSections].join("")}`
}

function prepareSqlRestore(sql: string) {
  return batchInsertStatements(restrictRestoreToBusinessTables(sql))
    .replace(/^ALTER DEFAULT PRIVILEGES\b.*;\r?$/gm, "")
    .replace(/^\\(?:restrict|unrestrict)\s+\S+\s*$/gm, "")
}

function batchInsertStatements(sql: string) {
  const output: string[] = []
  let prefix = ""
  let rows: string[] = []

  const flush = () => {
    if (rows.length) output.push(`${prefix}${rows.join(", ")};`)
    prefix = ""
    rows = []
  }

  for (const line of sql.split(/\r?\n/)) {
    const valuesIndex = line.startsWith("INSERT INTO ") ? line.indexOf(" VALUES ") : -1
    const statementPrefix = valuesIndex < 0 ? "" : line.slice(0, valuesIndex + " VALUES ".length)
    const values = valuesIndex < 0 ? "" : line.slice(valuesIndex + " VALUES ".length)

    if (!statementPrefix || !values.startsWith("(") || !values.endsWith(");")) {
      flush()
      output.push(line)
      continue
    }

    if (prefix !== statementPrefix || rows.length === INSERT_BATCH_SIZE) flush()
    prefix = statementPrefix
    rows.push(values.slice(0, -1))
  }

  flush()
  return output.join("\n")
}

export function createBackupClient() {
  const connectionString = process.env.DIRECT_URL
  if (!connectionString) {
    throw new BackupError("Database backup operations need DIRECT_URL configured as a server-only Vercel environment variable.", 503)
  }
  return new Client({
    connectionString,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 60_000,
    application_name: "akp-admin-database-backups",
  })
}

export async function acquireBackupLock(client: Client) {
  const { rows } = await client.query<{ locked: boolean }>(
    "select pg_try_advisory_lock($1, $2) as locked",
    [LOCK_CLASS_ID, LOCK_OBJECT_ID],
  )
  if (!rows[0]?.locked) throw new BackupError("Another backup or restore operation is already running. Try again shortly.", 409)
}

export async function releaseBackupLock(client: Client) {
  await client.query("select pg_advisory_unlock($1, $2)", [LOCK_CLASS_ID, LOCK_OBJECT_ID])
}

function databaseToolEnvironment(connectionString: string) {
  const url = new URL(connectionString)
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new BackupError("DIRECT_URL must be a PostgreSQL connection URL.", 503)
  }
  const password = decodeURIComponent(url.password)
  if (!url.hostname || !url.username || !password || !url.pathname.slice(1)) {
    throw new BackupError("DIRECT_URL is missing a database host, username, password, or database name.", 503)
  }
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGPASSWORD: password,
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
    PGCONNECT_TIMEOUT: "15",
    PGAPPNAME: "akp-admin-database-backups",
    LD_LIBRARY_PATH: [join(process.cwd(), "vendor/postgresql-17/lib"), process.env.LD_LIBRARY_PATH]
      .filter(Boolean)
      .join(":"),
  }
}

function toolPath(name: "pg_dump") {
  return join(process.cwd(), "vendor/postgresql-17/bin", name)
}

type ToolResult = { stdout: Buffer; stderr: string }

function runTool(
  name: "pg_dump",
  args: string[],
  connectionString: string,
  maxOutputBytes: number,
  timeoutMs: number,
): Promise<ToolResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(toolPath(name), args, {
      env: databaseToolEnvironment(connectionString),
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stdout: Uint8Array[] = []
    const stderr: Uint8Array[] = []
    let outputBytes = 0
    let stderrBytes = 0
    let tooLarge = false
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs)

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length
      if (outputBytes > maxOutputBytes) {
        tooLarge = true
        child.kill("SIGTERM")
        return
      }
      stdout.push(Uint8Array.from(chunk))
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length
      stderr.push(Uint8Array.from(chunk))
      while (stderrBytes > 8192 && stderr.length > 1) {
        stderrBytes -= stderr.shift()?.length ?? 0
      }
    })
    child.once("error", (error) => {
      clearTimeout(timeout)
      if ("code" in error && error.code === "ENOENT") {
        reject(new BackupError(`The bundled PostgreSQL ${name} utility is missing from this deployment.`, 503))
      } else {
        reject(new BackupError(`Could not start the PostgreSQL ${name} utility.`, 500))
      }
    })
    child.once("close", (code, signal) => {
      clearTimeout(timeout)
      if (tooLarge) {
        reject(new BackupError("The SQL dump exceeds the 32 MB archive limit. Use a smaller application database backup.", 413))
      } else if (signal === "SIGTERM") {
        reject(new BackupError(`PostgreSQL ${name} exceeded its execution time limit.`, 504))
      } else if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim()
        const safeDetail = detail.replace(/[\r\n]+/g, " ").slice(-1000)
        reject(new BackupError(safeDetail ? `PostgreSQL ${name} failed: ${safeDetail}` : `PostgreSQL ${name} failed.`, 500))
      } else {
        resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString("utf8") })
      }
    })
  })
}

export async function generateSqlBackup(connectionString: string) {
  const tableArgs = BACKUP_TABLES.flatMap((table) => [`--table=public.${table}`])
  const dump = await runTool("pg_dump", [
    "--format=plain",
    "--data-only",
    "--no-owner",
    `--rows-per-insert=${INSERT_BATCH_SIZE}`,
    "--quote-all-identifiers",
    ...tableArgs,
  ], connectionString, MAX_SQL_BYTES, 240_000)

  const rawSql = dump.stdout.toString("utf8")
  if (!rawSql.startsWith("--\n-- PostgreSQL database dump")) {
    throw new BackupError("PostgreSQL did not return a valid plain SQL dump.", 500)
  }
  if (/no matching (?:relations|tables) were found/i.test(dump.stderr)) {
    throw new BackupError("PostgreSQL could not find every required business table for the backup.", 500)
  }

  const safeSql = prepareSqlRestore(
    `${BACKUP_TABLE_SCOPE_MARKER}\n${rawSql}`,
  )
  const sql = Buffer.from(
    `${BACKUP_MARKER}\n${BACKUP_TABLE_SCOPE_MARKER}\n-- Account, staff, customer, driver, audit, Supabase-managed, and archive data are excluded.\n${safeSql}`,
    "utf8",
  )
  if (sql.byteLength > MAX_SQL_BYTES) {
    throw new BackupError("The SQL dump exceeds the 32 MB archive limit.", 413)
  }
  if (/^(?:DROP|TRUNCATE) SCHEMA (?:"(?:public|app_private)"|(?:public|app_private))\s*;/im.test(sql.toString("utf8"))) {
    throw new BackupError("The SQL dump could replace an application schema and cannot be archived safely.", 500)
  }
  if (/^(?:DROP TABLE(?: IF EXISTS)?|CREATE TABLE(?: IF NOT EXISTS)?|ALTER TABLE|TRUNCATE TABLE|DELETE FROM|INSERT INTO|COPY)\s+(?:ONLY\s+)?(?:(?:"public"|public)\.)?(?:"(?:database_backups|backup_records)"|(?:database_backups|backup_records))(?=\s|;|\()/im.test(sql.toString("utf8"))) {
    throw new BackupError("The SQL dump attempted to include the protected backup archive.", 500)
  }
  return sql
}

export function getBackupDigest(sql: Buffer) {
  return createHash("sha256").update(new Uint8Array(sql.buffer, sql.byteOffset, sql.byteLength)).digest("hex")
}

export async function readAndVerifyBackup(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new BackupError("Invalid backup identifier.", 400)
  }
  const client = createBackupClient()
  try {
    await client.connect()
    const { rows } = await client.query<BackupMetadata & { backup_data: string }>(
      `select id, backup_name, file_name, file_size::text, sha256, format_version,
        schema_scope, description, created_at, backup_data
       from public.database_backups where id = $1`,
      [id],
    )
    const backup = rows[0]
    if (!backup) throw new BackupError("The selected backup was not found.", 404)
    if (backup.format_version !== BACKUP_FORMAT_VERSION
      || ![BACKUP_SCHEMAS.join(","), "public"].includes(backup.schema_scope.join(","))
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.sql$/.test(backup.file_name)
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(backup.backup_data)
      || backup.backup_data.length > MAX_BASE64_BYTES) {
      throw new BackupError("The saved backup metadata or encoded content is invalid.", 422)
    }

    const sql = Buffer.from(backup.backup_data, "base64")
    if (sql.toString("base64") !== backup.backup_data
      || sql.byteLength !== Number(backup.file_size)
      || getBackupDigest(sql) !== backup.sha256
      || !sql.toString("utf8").startsWith(BACKUP_MARKER)
      || !sql.toString("utf8").includes(`${LEGACY_BACKUP_SCOPE_MARKER}\n`)
        && !sql.toString("utf8").includes(`${BACKUP_TABLE_SCOPE_MARKER}\n`)) {
      throw new BackupError("Backup integrity verification failed; the SQL file was not used.", 422)
    }
    return { backup, sql }
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function getExternalPolicyStatements(client: Client, sql: Buffer) {
  const targets = Array.from(
    sql.toString("utf8").matchAll(/^DROP TABLE IF EXISTS "(public|app_private)"\."((?:""|[^"])*)";$/gm),
    ([, schema, table]) => ({ schema, table: table.replaceAll('""', '"') }),
  )
  if (!targets.length) return { before: "", after: "" }

  const { rows } = await client.query<{ drop_statement: string; create_statement: string }>(
    `with drop_targets as (
       select * from unnest($1::text[], $2::text[]) as target(schema_name, table_name)
     ),
     external_policies as (
       select distinct on (policy.oid)
         policy.oid,
         policy.polname as policy_name,
         policy_table_ns.nspname as policy_schema,
         policy_table.relname as policy_table,
         policy.polpermissive as permissive,
         policy.polcmd as command,
         coalesce((
           select string_agg(
             case when role_oid = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(role_oid)) end,
             ', ' order by role_oid
           )
           from unnest(policy.polroles) role_oid
         ), 'PUBLIC') as roles,
         pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
         pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expression
       from pg_depend dependency
       join pg_policy policy
         on dependency.classid = 'pg_policy'::regclass
        and dependency.objid = policy.oid
       join pg_class policy_table on policy_table.oid = policy.polrelid
       join pg_namespace policy_table_ns on policy_table_ns.oid = policy_table.relnamespace
       join pg_class target_table on target_table.oid = dependency.refobjid
       join pg_namespace target_ns on target_ns.oid = target_table.relnamespace
       join drop_targets target
         on target.schema_name = target_ns.nspname
        and target.table_name = target_table.relname
       where dependency.refclassid = 'pg_class'::regclass
         and policy_table_ns.nspname <> all($3::text[])
       order by policy.oid
     )
     select
       format('drop policy %I on %I.%I;', policy_name, policy_schema, policy_table) as drop_statement,
       format(
         'create policy %I on %I.%I as %s for %s to %s%s%s;',
         policy_name,
         policy_schema,
         policy_table,
         case when permissive then 'permissive' else 'restrictive' end,
         case command when '*' then 'all' when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' end,
         roles,
         case when using_expression is null then '' else format(' using (%s)', using_expression) end,
         case when check_expression is null then '' else format(' with check (%s)', check_expression) end
       ) as create_statement
     from external_policies
     order by policy_schema, policy_table, policy_name`,
    [targets.map(({ schema }) => schema), targets.map(({ table }) => table), BACKUP_SCHEMAS],
  )

  return {
    before: rows.map(({ drop_statement }) => drop_statement).join("\n"),
    after: rows.map(({ create_statement }) => create_statement).join("\n"),
  }
}

export async function executeSqlRestore(client: Client, sql: Buffer) {
  const policies = await getExternalPolicyStatements(client, sql)
  const restoreSql = prepareSqlRestore(sql.toString("utf8"))
  await client.query("begin")
  try {
    await client.query(`set local statement_timeout = '240s';
      ${policies.before}
      alter table public.inventory_movements disable trigger inventory_movements_are_immutable;
      alter table public.inventory_movements disable trigger inventory_movement_apply_stock;
      ${restoreSql}
      alter table public.inventory_movements enable trigger inventory_movement_apply_stock;
      alter table public.inventory_movements enable trigger inventory_movements_are_immutable;
      ${policies.after}`)
    await client.query("commit")
  } catch (error) {
    await client.query("rollback").catch(() => undefined)
    const detail = error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 300) : ""
    throw new BackupError(detail ? `PostgreSQL restore failed: ${detail}` : "PostgreSQL restore failed.", 500)
  }
}

export async function assertPostgresToolsAvailable() {
  try {
    await access(toolPath("pg_dump"))
  } catch {
    throw new BackupError("The bundled PostgreSQL pg_dump utility is not present in this deployment.", 503)
  }
}

export function createBackupId() {
  return randomUUID()
}

export async function getArchiveFingerprint(client: Client) {
  const { rows } = await client.query<{ fingerprint: string }>(
    `select count(*)::text || ':' ||
      coalesce(md5(string_agg(
        jsonb_build_array(
          id, backup_name, file_name, file_size, sha256, format_version,
          schema_scope, description, metadata, created_by, created_at
        )::text,
        ',' order by id
      )), md5('')) as fingerprint
     from public.database_backups`,
  )
  return rows[0].fingerprint
}
