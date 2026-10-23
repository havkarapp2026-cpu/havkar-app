const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const receipts = require("../havkar-message-receipts.js");

const user = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sender = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const message = {
    id: "33333333-3333-4333-8333-333333333333",
    conversation_id: "11111111-1111-4111-8111-111111111111",
    sender_id: sender,
    is_read: true
};

assert.strictEqual(receipts.receiptStatus(null), "sent");
assert.strictEqual(
    receipts.receiptStatus({ delivered_at: null, read_at: null }),
    "sent"
);
assert.strictEqual(
    receipts.receiptStatus({ is_read: true }),
    "sent"
);
assert.strictEqual(
    receipts.checkmarkForStatus("sent").marks,
    "✓"
);
assert.strictEqual(
    receipts.checkmarkForStatus("sent").className,
    "message-checks"
);

const delivered = receipts.checkmarkForStatus("delivered");
assert.strictEqual(delivered.marks, "✓✓");
assert.strictEqual(delivered.className, "message-checks delivered");
assert.strictEqual(delivered.title, "Delivered");

const read = receipts.checkmarkForStatus("read");
assert.strictEqual(read.marks, "✓✓");
assert.strictEqual(read.className, "message-checks read");
assert.strictEqual(read.title, "Read");

assert.deepStrictEqual(
    receipts.planReceiptActions({
        message: message,
        userId: sender,
        conversationOpen: true,
        pageVisible: true,
        rendered: true,
        openConversationId: message.conversation_id
    }),
    { deliver: false, read: false }
);

assert.deepStrictEqual(
    receipts.planReceiptActions({
        message: message,
        userId: user,
        conversationOpen: false,
        pageVisible: true,
        rendered: false,
        openConversationId: null
    }),
    { deliver: true, read: false }
);

assert.deepStrictEqual(
    receipts.planReceiptActions({
        message: message,
        userId: user,
        receipt: { delivered_at: "2026-10-23T00:00:00.000Z" },
        conversationOpen: true,
        pageVisible: false,
        rendered: true,
        openConversationId: message.conversation_id
    }),
    { deliver: false, read: false }
);

assert.deepStrictEqual(
    receipts.planReceiptActions({
        message: message,
        userId: user,
        conversationOpen: true,
        pageVisible: true,
        rendered: true,
        openConversationId: "99999999-9999-4999-8999-999999999999"
    }),
    { deliver: true, read: false }
);

assert.deepStrictEqual(
    receipts.planReceiptActions({
        message: message,
        userId: user,
        conversationOpen: true,
        pageVisible: true,
        rendered: true,
        openConversationId: message.conversation_id
    }),
    { deliver: true, read: true }
);

assert.deepStrictEqual(
    receipts.planReceiptActions({
        message: message,
        userId: user,
        receipt: {
            delivered_at: "2026-10-23T00:00:00.000Z",
            read_at: "2026-10-23T00:01:00.000Z"
        },
        conversationOpen: true,
        pageVisible: true,
        rendered: true,
        openConversationId: message.conversation_id
    }),
    { deliver: false, read: false }
);

const merged = receipts.mergeReceipt(
    {
        delivered_at: "2026-10-23T00:00:00.000Z",
        read_at: "2026-10-23T00:01:00.000Z"
    },
    {
        delivered_at: null,
        read_at: null,
        message_id: message.id
    }
);
assert.strictEqual(merged.delivered_at, "2026-10-23T00:00:00.000Z");
assert.strictEqual(merged.read_at, "2026-10-23T00:01:00.000Z");
assert.strictEqual(receipts.countUnread(5, 2), 3);
assert.strictEqual(receipts.countUnread(1, 4), 0);
assert.strictEqual(receipts.countUnread("nope", null), 0);

const migration = fs.readFileSync(
    "supabase/migrations/20261023062812_message_receipts.sql",
    "utf8"
);
assert.match(migration, /CREATE TABLE public\.message_receipts/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /GRANT SELECT, INSERT, UPDATE/);
assert.doesNotMatch(migration, /GRANT[^\n]*DELETE/i);
assert.doesNotMatch(migration, /ALTER POLICY/i);
assert.doesNotMatch(migration, /DROP POLICY/i);
assert.doesNotMatch(migration, /UPDATE public\.messages/i);
assert.doesNotMatch(migration, /ALTER TABLE public\.messages/i);
assert.doesNotMatch(migration, /wallet|stellar|pi_network/i);
assert.match(migration, /NEW\.delivered_at := now\(\)/);
assert.match(migration, /NEW\.read_at := now\(\)/);
assert.match(migration, /NEW\.read_at := NULL/);
assert.match(migration, /NEW\.read_at := OLD\.read_at/);
assert.match(migration, /receipt deletion is not allowed/);
assert.match(migration, /sender cannot create a delivery receipt/);
assert.match(migration, /ADD TABLE public\.message_receipts/);

const chat = fs.readFileSync("chat.html", "utf8");
assert.match(chat, /havkar-message-receipts\.js/);
assert.match(chat, /table:"message_receipts"/);
assert.match(chat, /ignoreDuplicates:true/);
assert.match(chat, /navigator\.onLine === false/);
assert.match(chat, /visibilitychange/);
assert.match(chat, /color:#eaff4a/);
assert.match(chat, /rgba\(255,215,0,\.75\)/);
assert.match(chat, /background:#1b5e20/);
assert.match(chat, /\.message-checks\.read\{[^}]*opacity:1/);
assert.doesNotMatch(chat, /\.message-meta\{[^}]*opacity:/);
assert.match(chat, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(chat, /is_read:\s*true/);
assert.doesNotMatch(chat, /message\.is_read/);
assert.match(chat, /is_read:false/);

const binDir = "/usr/lib/postgresql/18/bin";
const dataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "havkar-message-receipts-")
);
const port = "55441";
const env = Object.assign({}, process.env, {
    PGHOST: dataDir,
    PGPORT: port,
    PGUSER: "ubuntu",
    PGDATABASE: "postgres",
    PGSSLMODE: "disable",
    PGPASSWORD: ""
});

function run(command, args, input) {
    return execFileSync(command, args, {
        encoding: "utf8",
        env: env,
        input: input
    });
}

let started = false;

try {
    run(path.join(binDir, "initdb"), [
        "-D", dataDir,
        "--auth=trust",
        "--username=ubuntu",
        "--no-instructions"
    ]);

    run(path.join(binDir, "pg_ctl"), [
        "-D", dataDir,
        "-o", `-p ${port} -k ${dataDir} -c listen_addresses=`,
        "-l", path.join(dataDir, "server.log"),
        "start"
    ]);
    started = true;

    const applied = run("psql", [
        "-h", dataDir,
        "-p", port,
        "-U", "ubuntu",
        "-d", "postgres",
        "-v", "ON_ERROR_STOP=1",
        "-f", "tests/message-receipts-prelude.sql",
        "-f", "supabase/migrations/20261023062812_message_receipts.sql",
        "-f", "tests/message-receipts-rls.sql"
    ]);

    assert.match(applied, /MESSAGE_RECEIPTS_RLS_OK/);
    assert.doesNotMatch(applied, /ERROR:/);
} finally {
    if (started) {
        try {
            run(path.join(binDir, "pg_ctl"), [
                "-D", dataDir,
                "stop",
                "-m", "fast"
            ]);
        } catch (error) {
            console.warn(error && error.message);
        }
    }
}

console.log("MESSAGE_RECEIPTS_TEST_OK");
