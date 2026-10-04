// Vercel's native WebSocket runtime owns the listener. One in-memory game server per instance.
import { startServer } from '../server/index.js';

const game = await startServer({ listen: false });
export default game.server;
