import { createSerialQueue } from "./queue";

/**
 * One logical conversation must never interleave two answers. The key is the
 * session/conversation id; different sessions still run concurrently.
 */
export const conversationQueue = createSerialQueue();
