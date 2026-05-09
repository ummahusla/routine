/**
 * Fixture flow with a @rote-frontmatter parameters list, used by flow.test.ts
 * to exercise manifest-driven param validation in executeFlow.
 *
 * @rote-frontmatter
 * ---
 * name: send-telegram-message
 * description: "Test fixture"
 * metadata:
 *   parameters:
 *   - name: chat_id
 *     type: string
 *     required: true
 *     description: "Target chat id"
 *   - name: text
 *     type: string
 *     required: true
 *     description: "Message body"
 * ---
 */
