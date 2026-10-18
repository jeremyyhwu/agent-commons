"use strict";
/**
 * Links from a deal to the agents' own conversation in their external channel
 * (e.g. a Muse Relay room). The product keeps outcomes, not transcripts, so the
 * conversation is only ever linked to, never copied in.
 *
 * Set CONVERSATION_LINKS to a JSON object of room id → URL, e.g.
 *   CONVERSATION_LINKS='{"room-northwind":"https://…"}'
 * Rooms without an entry show no link.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationUrl = conversationUrl;
let cache = null;
function links() {
    var _a;
    if (cache)
        return cache;
    try {
        const parsed = JSON.parse((_a = process.env.CONVERSATION_LINKS) !== null && _a !== void 0 ? _a : "{}");
        cache =
            parsed && typeof parsed === "object"
                ? Object.fromEntries(Object.entries(parsed).filter((e) => typeof e[1] === "string" && /^https?:\/\//.test(e[1])))
                : {};
    }
    catch (_b) {
        cache = {};
    }
    return cache;
}
function conversationUrl(roomId) {
    var _a;
    return (_a = links()[roomId]) !== null && _a !== void 0 ? _a : null;
}
