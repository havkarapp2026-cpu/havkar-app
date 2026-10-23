import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const puppeteer = require(
    process.env.PUPPETEER_CORE ||
    "/tmp/bs-back/node_modules/puppeteer-core"
);

const sender = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
};
const recipient = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
};
const conversation = {
    id: "11111111-1111-4111-8111-111111111111",
    ad_id: null,
    buyer_id: recipient.id,
    seller_id: sender.id,
    created_at: "2026-10-23T00:00:00.000Z",
    updated_at: "2026-10-23T00:00:00.000Z"
};
const messages = [
    {
        id: "22222222-2222-4222-8222-222222222222",
        conversation_id: conversation.id,
        sender_id: sender.id,
        message_text: "Older note",
        created_at: "2026-10-23T01:00:00.000Z",
        is_read: true
    },
    {
        id: "33333333-3333-4333-8333-333333333333",
        conversation_id: conversation.id,
        sender_id: sender.id,
        message_text: "Latest note",
        created_at: "2026-10-23T02:00:00.000Z",
        is_read: true
    }
];
const receipts = [];
const pages = [];
const broadcastLog = [];
let databaseDepth = 0;
let eventPolls = 0;
let visibilityMode = "visible";
let onlineMode = "true";

function matches(row, filters) {
    return filters.every(filter => {
        if (filter[0] === "eq") {
            return String(row[filter[1]]) === String(filter[2]);
        }
        if (filter[0] === "neq") {
            return String(row[filter[1]]) !== String(filter[2]);
        }
        if (filter[0] === "in") {
            return filter[2].map(String).includes(String(row[filter[1]]));
        }
        if (filter[0] === "is") {
            return row[filter[1]] == null;
        }
        if (filter[0] === "not") {
            return row[filter[1]] != null;
        }
        if (filter[0] === "or") {
            return filter[1].split(",").some(part => {
                const [column, operator, value] = part.split(".");
                return operator === "eq" &&
                    String(row[column]) === value;
            });
        }
        return true;
    });
}

function queueBroadcast(event) {
    broadcastLog.push(event);
}

function database(request) {
    if (request.action === "drain") {
        const cursor = request.cursor || 0;
        return {
            data: broadcastLog.slice(cursor),
            cursor: broadcastLog.length,
            error: null,
            count: broadcastLog.length - cursor
        };
    }
    databaseDepth += 1;
    try {
        return databaseRequest(request);
    } finally {
        databaseDepth -= 1;
    }
}

function databaseRequest(request) {
    const table = request.table === "messages"
        ? messages
        : request.table === "message_receipts"
            ? receipts
            : request.table === "conversations"
                ? [conversation]
                : [];
    let rows = table.filter(row => matches(row, request.filters || []));

    if (request.orderBy) {
        const column = request.orderBy.column;
        rows = rows.slice().sort((left, right) => {
            const delta = String(left[column]).localeCompare(
                String(right[column])
            );
            return request.orderBy.ascending ? delta : -delta;
        });
    }

    if (Number.isInteger(request.limitN)) {
        rows = rows.slice(0, request.limitN);
    }

    if (request.action === "select") {
        if (request.singleMode === "single" && rows.length !== 1) {
            return {
                data: null,
                error: { code: "PGRST116", message: "expected one row" },
                count: rows.length
            };
        }
        if (request.singleMode === "maybe" && rows.length > 1) {
            return {
                data: null,
                error: { code: "PGRST116", message: "expected one row" },
                count: rows.length
            };
        }
        if (request.head) {
            return { data: null, error: null, count: rows.length };
        }
        return {
            data: request.singleMode
                ? (rows[0] || null)
                : rows.map(row => Object.assign({}, row)),
            error: null,
            count: rows.length
        };
    }

    if (request.action === "insert" && request.table === "messages") {
        const stored = {
            id: crypto.randomUUID(),
            conversation_id: request.payload.conversation_id,
            sender_id: request.payload.sender_id,
            message_text: request.payload.message_text,
            created_at: new Date().toISOString(),
            is_read: false
        };
        messages.push(stored);
        queueBroadcast({
            table: "messages",
            event: "INSERT",
            row: stored
        });
        return { data: stored, error: null, count: 1 };
    }

    if (request.action === "update" && request.table === "conversations") {
        return { data: null, error: null, count: 1 };
    }

    if (request.action === "upsert" && request.table === "message_receipts") {
        const existing = receipts.find(row =>
            row.message_id === request.payload.message_id &&
            row.recipient_id === request.payload.recipient_id
        );
        if (existing) {
            return { data: [], error: null, count: 0 };
        }
        const stored = {
            message_id: request.payload.message_id,
            conversation_id: request.payload.conversation_id,
            recipient_id: request.payload.recipient_id,
            delivered_at: new Date().toISOString(),
            read_at: null
        };
        receipts.push(stored);
        queueBroadcast({
            table: "message_receipts",
            event: "INSERT",
            row: Object.assign({}, stored)
        });
        return {
            data: [Object.assign({}, stored)],
            error: null,
            count: 1
        };
    }

    if (request.action === "update" && request.table === "message_receipts") {
        const changed = [];
        receipts.forEach(row => {
            if (!matches(row, request.filters || [])) {
                return;
            }
            if (request.payload.read_at && !row.read_at) {
                row.read_at = new Date().toISOString();
            }
            changed.push(Object.assign({}, row));
        });
        changed.forEach(row => {
            queueBroadcast({
                table: "message_receipts",
                event: "UPDATE",
                row: row
            });
        });
        return { data: changed, error: null, count: changed.length };
    }

    if (request.action === "update" && request.table === "messages") {
        return {
            data: null,
            error: { code: "42501", message: "messages are not updated by receipts" },
            count: 0
        };
    }

    return { data: [], error: null, count: 0 };
}

const stub = `
window.supabase = {
  createClient() {
    window.__havkarChannels = [];
    let cursor = 0;
    window.setInterval(async () => {
      const response = await fetch("/receipt-events?cursor=" + cursor);
      const drained = await response.json();
      cursor = drained.cursor || cursor;
      (drained.events || []).forEach(event => {
        (window.__havkarChannels || []).forEach(channel => {
          channel.handlers.forEach(handler => {
            if (handler.filter.table !== event.table) return;
            if (handler.filter.event !== event.event) return;
            const filter = handler.filter.filter || "";
            const match = filter.match(/^([A-Za-z0-9_]+)=eq\\.(.+)$/);
            if (match && String(event.row[match[1]]) !== match[2]) return;
            handler.callback({ new: event.row });
          });
        });
      });
    }, 40);
    function query(table) {
      const request = {
        table: table,
        action: "select",
        filters: [],
        limitN: null,
        head: false,
        orderBy: null,
        payload: null,
        singleMode: null
      };
      const api = {
        select(fields, options) {
          request.head = !!(options && options.head);
          return api;
        },
        insert(row) {
          request.action = "insert";
          request.payload = row;
          return api;
        },
        update(row) {
          request.action = "update";
          request.payload = row;
          return api;
        },
        upsert(row) {
          request.action = "upsert";
          request.payload = row;
          return api;
        },
        eq(column, value) {
          request.filters.push(["eq", column, value]);
          return api;
        },
        neq(column, value) {
          request.filters.push(["neq", column, value]);
          return api;
        },
        in(column, values) {
          request.filters.push(["in", column, values]);
          return api;
        },
        is(column) {
          request.filters.push(["is", column, null]);
          return api;
        },
        not(column) {
          request.filters.push(["not", column, null]);
          return api;
        },
        or(expression) {
          request.filters.push(["or", expression]);
          return api;
        },
        order(column, options) {
          request.orderBy = {
            column: column,
            ascending: !(options && options.ascending === false)
          };
          return api;
        },
        limit(count) {
          request.limitN = count;
          return api;
        },
        maybeSingle() {
          request.singleMode = "maybe";
          return api;
        },
        single() {
          request.singleMode = "single";
          return api;
        },
        then(resolve, reject) {
          return fetch("/chat-db", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(request)
          }).then(function (response) {
            return response.json();
          }).then(resolve, reject);
        }
      };
      return api;
    }
    return {
      auth: {
        getSession() {
          return Promise.resolve({
            data: {
              session: {
                access_token: "browser-test",
                user: window.__havkarUser
              }
            },
            error: null
          });
        },
        onAuthStateChange() {
          return { data: { subscription: { unsubscribe() {} } } };
        }
      },
      realtime: { setAuth() { return Promise.resolve(); } },
      removeChannel() {},
      channel() {
        const handlers = [];
        const channel = {
          on(event, filter, callback) {
            handlers.push({ filter: filter, callback: callback });
            return channel;
          },
          subscribe(callback) {
            window.__havkarChannels.push({ handlers: handlers });
            if (callback) callback("SUBSCRIBED");
            return channel;
          }
        };
        return channel;
      },
      from: query
    };
  }
};
`;

function startServer(port) {
    const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".png": "image/png",
        ".json": "application/json"
    };
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, "http://127.0.0.1");
        if (url.pathname === "/visibility") {
            response.end(visibilityMode);
            return;
        }
        if (url.pathname === "/online") {
            response.end(onlineMode);
            return;
        }
        if (url.pathname === "/receipt-events") {
            eventPolls += 1;
            const cursor = Number(url.searchParams.get("cursor") || 0);
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({
                events: broadcastLog.slice(cursor),
                cursor: broadcastLog.length
            }));
            return;
        }
        if (url.pathname === "/chat-db" && request.method === "POST") {
            const chunks = [];
            request.on("data", chunk => chunks.push(chunk));
            request.on("end", () => {
                try {
                    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                    response.setHeader("content-type", "application/json");
                    response.end(JSON.stringify(database(body)));
                } catch (error) {
                    response.statusCode = 400;
                    response.end(JSON.stringify({
                        data: null,
                        error: { message: "bad request" },
                        count: 0
                    }));
                }
            });
            return;
        }
        const relative = decodeURIComponent(url.pathname);
        if (relative === "/supabase-stub.js") {
            response.setHeader("content-type", "text/javascript; charset=utf-8");
            response.end(stub);
            return;
        }
        if (relative === "/chat.html") {
            const html = fs.readFileSync("/workspace/chat.html", "utf8").replace(
                "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
                "/supabase-stub.js"
            );
            response.setHeader("content-type", "text/html; charset=utf-8");
            response.end(html);
            return;
        }
        const file = path.join("/workspace", relative);
        if (!file.startsWith("/workspace/")) {
            response.statusCode = 403;
            response.end();
            return;
        }
        fs.readFile(file, (error, data) => {
            if (error) {
                response.statusCode = 404;
                response.end();
                return;
            }
            response.setHeader(
                "content-type",
                types[path.extname(file)] || "application/octet-stream"
            );
            response.end(data);
        });
    });
    server.listen(port, "127.0.0.1");
    return server;
}

async function prepare(page, user) {
    pages.push(page);
    await page.evaluateOnNewDocument(currentUser => {
        window.__havkarUser = currentUser;
        window.__havkarOnline = true;
        window.__havkarVisibility = "visible";
        window.setInterval(async () => {
            const visibility = await fetch("/visibility").then(item => item.text());
            if (visibility && visibility !== window.__havkarVisibility) {
                window.__havkarVisibility = visibility;
                document.dispatchEvent(new Event("visibilitychange"));
            }
            const online = await fetch("/online").then(item => item.text());
            const nextOnline = online !== "false";
            if (window.__havkarOnline !== nextOnline) {
                window.__havkarOnline = nextOnline;
                if (nextOnline) {
                    window.dispatchEvent(new Event("online"));
                }
            }
        }, 100);
        Object.defineProperty(Navigator.prototype, "onLine", {
            configurable: true,
            get() {
                return window.__havkarOnline !== false;
            }
        });
        Object.defineProperty(Document.prototype, "visibilityState", {
            configurable: true,
            get() {
                return window.__havkarVisibility || "visible";
            }
        });
    }, user);
    page.on("pageerror", error => {
        console.error("PAGE", error.message);
    });
}

function step(label) {
    process.stdout.write(label + "\n");
}

async function waitFor(fn, label) {
    const started = Date.now();
    let latest = null;
    while (Date.now() - started < 8000) {
        latest = await fn();
        if (latest) {
            return latest;
        }
        await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error(label + ": " + JSON.stringify(latest));
}

const port = 8783;
const server = startServer(port);
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome",
    headless: "new",
    slowMo: 0,
    protocolTimeout: 30000,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 420, height: 900 }
});

try {
    await new Promise((resolve, reject) => {
        const started = Date.now();
        const probe = () => {
            fetch(`http://127.0.0.1:${port}/chat.html`).then(response => {
                if (response.ok) {
                    resolve();
                    return;
                }
                reject(new Error("chat page " + response.status));
            }).catch(() => {
                if (Date.now() - started > 5000) {
                    reject(new Error("local chat server did not start"));
                    return;
                }
                setTimeout(probe, 100);
            });
        };
        probe();
    });
    step("server-ready");
    const senderPage = await browser.newPage();
    await prepare(senderPage, sender);
    await senderPage.goto(
        `http://127.0.0.1:${port}/chat.html?conversation_id=${conversation.id}`,
        { waitUntil: "domcontentloaded" }
    );
    const initial = await waitFor(async () => {
        const marks = await senderPage.$$eval(
            ".message-checks",
            nodes => nodes.map(node => ({
                text: node.textContent,
                className: node.className,
                title: node.title
            }))
        );
        return marks.length === 2 ? marks : null;
    }, "initial checks");
    step("initial-checks");
    assert.deepEqual(
        initial.map(mark => mark.text),
        ["✓", "✓"]
    );
    assert.ok(initial.every(mark => mark.title === "Sent"));
    assert.ok(initial.every(mark => !mark.className.includes("read")));

    await senderPage.waitForFunction(() =>
        (window.__havkarChannels || []).some(channel =>
            channel.handlers.some(handler =>
                handler.filter &&
                handler.filter.table === "message_receipts"
            )
        )
    );
    await senderPage.evaluate(row => {
        (window.__havkarChannels || []).forEach(channel => {
            channel.handlers.forEach(handler => {
                if (
                    handler.filter.table === "messages" &&
                    handler.filter.event === "UPDATE"
                ) {
                    handler.callback({ new: row });
                }
            });
        });
    }, Object.assign({}, messages[1], { is_read: true }));
    const afterFlag = await senderPage.$$eval(
        ".message-checks",
        nodes => nodes.map(node => node.textContent + "|" + node.title)
    );
    assert.deepEqual(afterFlag, ["✓|Sent", "✓|Sent"]);

    const recipientPage = await browser.newPage();
    await prepare(recipientPage, recipient);
    await recipientPage.goto(
        `http://127.0.0.1:${port}/chat.html`,
        { waitUntil: "domcontentloaded" }
    );
    await waitFor(async () => {
        const badge = await recipientPage.$eval(
            ".unread",
            node => node.textContent
        ).catch(() => "");
        return receipts.length === 1 &&
            receipts[0].read_at === null &&
            receipts[0].message_id === messages[1].id &&
            badge === "2"
            ? true
            : null;
    }, "list delivery");
    step("list-delivery");

    await waitFor(async () => {
        const marks = await senderPage.$$eval(
            ".message-checks",
            nodes => nodes.map(node => node.title)
        );
        return marks[0] === "Sent" && marks[1] === "Delivered"
            ? marks
            : null;
    }, "sender delivered latest");
    step("delivered");
    await senderPage.screenshot({
        path: "/opt/cursor/artifacts/message-receipts-delivered.png"
    });

    visibilityMode = "hidden";
    await new Promise(resolve => setTimeout(resolve, 250));
    step("hidden");
    await recipientPage.click(".chat-item");
    step("opened");
    await waitFor(async () => {
        return receipts.length === 2 &&
            receipts.every(row => row.read_at === null)
            ? true
            : null;
    }, "hidden thread delivers without read");
    step("hidden-delivered");
    assert.equal(receipts.length, 2);
    assert.ok(receipts.every(row => row.delivered_at && !row.read_at));

    visibilityMode = "visible";
    await waitFor(async () => {
        return receipts.length === 2 &&
            receipts.every(row => row.read_at)
            ? true
            : null;
    }, "visible thread reads");
    step("read-stored");

    const readerPage = await browser.newPage();
    await prepare(readerPage, sender);
    await readerPage.goto(
        `http://127.0.0.1:${port}/chat.html?conversation_id=${conversation.id}`,
        { waitUntil: "domcontentloaded" }
    );
    const readMarks = await waitFor(async () => {
        const marks = await readerPage.evaluate(() =>
            Array.from(document.querySelectorAll(".message-checks")).map(node => ({
                text: node.textContent,
                className: node.className,
                title: node.title
            }))
        );
        return marks.length === 2 &&
            marks.every(mark => mark.className.includes("read"))
            ? marks
            : null;
    }, "read checks");
    step("read-painted");
    assert.ok(readMarks.every(mark => mark.text === "✓✓"));
    assert.ok(readMarks.every(mark => mark.title === "Read"));

    await readerPage.emulateMediaFeatures([{
        name: "prefers-reduced-motion",
        value: "reduce"
    }]);
    const paint = await readerPage.evaluate(() => {
        const node = document.querySelector(".message-checks.read");
        const style = getComputedStyle(node);
        return {
            color: style.color,
            shadow: style.textShadow,
            transition: style.transition
        };
    });
    assert.equal(paint.color, "rgb(234, 255, 74)");
    assert.match(paint.shadow, /255,\s*215,\s*0/);
    assert.match(paint.transition, /none|0s/);
    await readerPage.screenshot({
        path: "/opt/cursor/artifacts/message-receipts-read.png"
    });
    step("read-shot");

    const readAt = receipts.map(row => row.read_at);
    const secondPage = await browser.newPage();
    await prepare(secondPage, recipient);
    await secondPage.goto(
        `http://127.0.0.1:${port}/chat.html?conversation_id=${conversation.id}`,
        { waitUntil: "domcontentloaded" }
    );
    await secondPage.waitForSelector(".message-text");
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(receipts.length, 2);
    assert.deepEqual(receipts.map(row => row.read_at), readAt);
    step("second-session");

    onlineMode = "false";
    await new Promise(resolve => setTimeout(resolve, 250));
    await readerPage.bringToFront();
    step("before-type");
    await readerPage.click("#messageInput");
    await readerPage.type("#messageInput", "Hello");
    await readerPage.keyboard.press("Enter");
    await readerPage.type("#messageInput", "there");
    const draft = await readerPage.evaluate(
        () => document.querySelector("#messageInput").value
    );
    assert.equal(draft, "Hello\nthere");
    assert.equal(messages.length, 2);
    await readerPage.click("#sendButton");
    await waitFor(async () => {
        return messages.length === 3 ? true : null;
    }, "sent message");
    assert.equal(messages[2].message_text, "Hello\nthere");
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(
        receipts.filter(row => row.message_id === messages[2].id).length,
        0
    );
    const offlineMark = await readerPage.evaluate(() =>
        Array.from(document.querySelectorAll(".message-checks")).map(node => node.title)
    );
    assert.equal(offlineMark.at(-1), "Sent");

    onlineMode = "true";
    await recipientPage.bringToFront();
    await waitFor(async () => {
        const row = receipts.find(item => item.message_id === messages[2].id);
        return row && row.read_at ? row : null;
    }, "reconnect reads the rendered message");
    await readerPage.bringToFront();
    await waitFor(async () => {
        const titles = await readerPage.evaluate(() =>
            Array.from(document.querySelectorAll(".message-checks")).map(node => node.title)
        );
        return titles.at(-1) === "Read" ? titles : null;
    }, "sender sees reconnect read");

    const beforeEmpty = messages.length;
    await readerPage.evaluate(() => {
        document.querySelector("#messageInput").value = "   ";
    });
    await readerPage.click("#sendButton");
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(messages.length, beforeEmpty);

    fs.writeFileSync(
        "/opt/cursor/artifacts/message-receipts-browser.log",
        [
            "BROWSER_RECEIPTS_OK",
            "historical is_read stayed one check until a real receipt",
            "list delivered only the latest message",
            "hidden thread delivered both and read neither",
            "visible thread recorded read receipts",
            "second session kept the same two rows",
            "offline send stayed SENT until reconnect",
            "Enter kept a newline and Send stored the full text",
            JSON.stringify(paint)
        ].join("\n")
    );
    console.log("BROWSER_RECEIPTS_OK");
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
