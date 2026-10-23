import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const puppeteer = require("/tmp/bs-back/node_modules/puppeteer-core");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const filePath = path.join(root, decodeURIComponent(url.pathname));
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        response.writeHead(404);
        response.end("missing");
        return;
    }
    response.writeHead(200);
    fs.createReadStream(filePath).pipe(response);
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", request => {
        if (!request.url().includes("supabase-js")) {
            request.continue();
            return;
        }
        request.respond({
            status: 200,
            contentType: "application/javascript",
            body: `
                function query() {
                    const result = { data: [], error: null };
                    const chain = {
                        select() { return chain; },
                        eq() { return chain; },
                        neq() { return chain; },
                        in() { return chain; },
                        order() { return chain; },
                        limit() { return chain; },
                        insert() { return chain; },
                        update() { return chain; },
                        upsert() { return chain; },
                        delete() { return chain; },
                        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
                        single() { return Promise.resolve({ data: null, error: null }); },
                        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
                    };
                    return chain;
                }
                window.supabase = {
                    createClient() {
                        return {
                            auth: {
                                getSession() {
                                    return Promise.resolve({
                                        data: { session: { user: { id: "user-android" } } },
                                        error: null
                                    });
                                },
                                onAuthStateChange() {
                                    return { data: { subscription: { unsubscribe() {} } } };
                                }
                            },
                            from() { return query(); },
                            channel() {
                                const channel = {
                                    on() { return channel; },
                                    subscribe() { return channel; }
                                };
                                return channel;
                            },
                            removeChannel() { return Promise.resolve("ok"); }
                        };
                    }
                };
            `
        });
    });
    await page.emulate({
        viewport: {
            width: 412,
            height: 915,
            deviceScaleFactor: 2.625,
            isMobile: true,
            hasTouch: true
        },
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36"
    });
    await page.goto(`http://127.0.0.1:${port}/chat.html`, {
        waitUntil: "domcontentloaded"
    });
    await page.waitForSelector("#messageInput");

    const composer = await page.evaluate(() => {
        const input = document.querySelector("#messageInput");
        const send = document.querySelector("#sendButton");
        const style = getComputedStyle(input);
        const sample = document.createElement("div");
        sample.className = "message-text";
        document.body.appendChild(sample);
        const messageWhiteSpace = getComputedStyle(sample).whiteSpace;
        sample.remove();
        return {
            tag: input.tagName,
            rows: input.getAttribute("rows"),
            wrap: input.getAttribute("wrap"),
            enterKeyHint: input.getAttribute("enterkeyhint"),
            inputMode: input.getAttribute("inputmode"),
            fieldSizing: style.fieldSizing,
            whiteSpace: style.whiteSpace,
            maxHeight: style.maxHeight,
            minHeight: style.minHeight,
            messageWhiteSpace,
            sendType: send.getAttribute("type"),
            hasReceiptScript: !!document.querySelector("script[src='/havkar-message-receipts.js']")
        };
    });

    assert.equal(composer.tag, "TEXTAREA");
    assert.equal(composer.rows, "1");
    assert.equal(composer.wrap, "soft");
    assert.equal(composer.enterKeyHint, null);
    assert.equal(composer.inputMode, null);
    assert.equal(composer.fieldSizing, "content");
    assert.equal(composer.whiteSpace, "pre-wrap");
    assert.equal(composer.maxHeight, "120px");
    assert.equal(composer.messageWhiteSpace, "pre-wrap");
    assert.equal(composer.sendType, "button");
    assert.equal(composer.hasReceiptScript, true);

    await page.evaluate(() => {
        document.querySelector("#messageList").style.display = "none";
        document.querySelector("#chatScreen").style.display = "flex";
    });
    const oneLine = await page.$eval("#messageInput", node => node.getBoundingClientRect().height);
    await page.click("#messageInput");
    await page.keyboard.type("Hello");
    await page.keyboard.press("Enter");
    await page.keyboard.type("there");
    const afterEnter = await page.evaluate(() => ({
        value: document.querySelector("#messageInput").value,
        toast: document.querySelector("#toast")?.textContent || ""
    }));
    assert.equal(afterEnter.value, "Hello\nthere");
    assert.equal(afterEnter.toast.includes("Please sign in"), false);

    const grown = await page.$eval("#messageInput", node => node.getBoundingClientRect().height);
    assert.ok(grown > oneLine, `textarea height ${grown} did not grow past ${oneLine}`);

    await page.click("#sendButton");
    await page.waitForFunction(() => {
        const toast = document.querySelector("#toast")?.textContent || "";
        return toast.includes("Please sign in") || toast.includes("Open a conversation");
    });
    const afterSend = await page.evaluate(() => document.querySelector("#messageInput").value);
    assert.equal(afterSend, "Hello\nthere");

    await page.screenshot({
        path: "/opt/cursor/artifacts/android-composer-newline.png",
        fullPage: false
    });
    console.log("ANDROID_COMPOSER_NEWLINE_OK");
} finally {
    await browser.close();
    server.close();
}
