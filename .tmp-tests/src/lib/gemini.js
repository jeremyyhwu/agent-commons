"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MODEL = void 0;
exports.hasGeminiKey = hasGeminiKey;
exports.geminiClient = geminiClient;
exports.generateText = generateText;
exports.ping = ping;
const genai_1 = require("@google/genai");
/**
 * Gemini access, BYOK (bring-your-own-key).
 *
 * The key stays in the runtime environment — never in the client, never in
 * the repo. The hackathon requires Google AI usage; this is that integration.
 */
exports.DEFAULT_MODEL = (_a = process.env.GEMINI_MODEL) !== null && _a !== void 0 ? _a : "gemini-2.5-flash";
let cached = null;
function hasGeminiKey() {
    return Boolean(process.env.GEMINI_API_KEY);
}
function geminiClient(apiKey) {
    const key = apiKey !== null && apiKey !== void 0 ? apiKey : process.env.GEMINI_API_KEY;
    if (!key) {
        throw new Error("Missing GEMINI_API_KEY — set it in the environment (BYOK).");
    }
    if (!cached || cached.key !== key) {
        cached = { client: new genai_1.GoogleGenAI({ apiKey: key }), key };
    }
    return cached.client;
}
async function generateText(prompt, options = {}) {
    var _a, _b, _c;
    const client = geminiClient(options.apiKey);
    const response = await client.models.generateContent({
        model: (_a = options.model) !== null && _a !== void 0 ? _a : exports.DEFAULT_MODEL,
        contents: prompt,
        config: {
            systemInstruction: options.systemInstruction,
            temperature: (_b = options.temperature) !== null && _b !== void 0 ? _b : 0.4,
        },
    });
    return (_c = response.text) !== null && _c !== void 0 ? _c : "";
}
/** Lightweight connectivity probe used by the smoke test. */
async function ping(apiKey) {
    return generateText("Reply with exactly: pong", {
        apiKey,
        temperature: 0,
    });
}
