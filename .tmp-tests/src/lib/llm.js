"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmConfig = llmConfig;
exports.llmGenerateText = llmGenerateText;
const gemini_1 = require("./gemini");
function llmConfig() {
    var _a;
    if (process.env.GEMINI_API_KEY) {
        return { provider: "gemini", model: gemini_1.DEFAULT_MODEL, configured: true };
    }
    const baseUrl = process.env.LLM_BASE_URL;
    const apiKey = process.env.LLM_API_KEY;
    if (baseUrl && apiKey) {
        return {
            provider: "openai-compatible",
            model: (_a = process.env.LLM_MODEL) !== null && _a !== void 0 ? _a : "unknown-model",
            configured: true,
        };
    }
    return { provider: "none", model: "none", configured: false };
}
/** One completion from whichever provider is configured. */
async function llmGenerateText(prompt, options = {}) {
    const config = llmConfig();
    if (config.provider === "gemini") {
        return (0, gemini_1.generateText)(prompt, options);
    }
    if (config.provider === "openai-compatible") {
        return openAiCompatibleGenerateText(prompt, options, config.model);
    }
    throw new Error("No model provider configured — set GEMINI_API_KEY, or LLM_BASE_URL + LLM_API_KEY.");
}
/**
 * Chat-completions call against an OpenAI-compatible endpoint.
 *
 * Deliberately small: one system message, one user message, no streaming, no
 * tools, no retries. The guide asks one question and shows one answer, and a
 * timeout is better than a page that hangs — the route degrades to the
 * deterministic fallback and says so.
 */
async function openAiCompatibleGenerateText(prompt, options, model) {
    var _a, _b, _c, _d, _e, _f, _g;
    const baseUrl = ((_a = process.env.LLM_BASE_URL) !== null && _a !== void 0 ? _a : "").replace(/\/+$/, "");
    const apiKey = (_b = process.env.LLM_API_KEY) !== null && _b !== void 0 ? _b : "";
    const messages = [];
    if (options.systemInstruction) {
        messages.push({ role: "system", content: options.systemInstruction });
    }
    messages.push({ role: "user", content: prompt });
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: (_c = options.temperature) !== null && _c !== void 0 ? _c : 0.4,
        }),
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        throw new Error(`${model} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    const payload = (await response.json());
    const text = (_g = (_f = (_e = (_d = payload.choices) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.message) === null || _f === void 0 ? void 0 : _f.content) !== null && _g !== void 0 ? _g : "";
    if (!text.trim())
        throw new Error(`${model} returned an empty completion`);
    return text;
}
