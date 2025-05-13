import http, { IncomingMessage, ServerResponse } from 'http';
import { handleUserRoutes } from './routes/userRoutes';
import { handleDbSyncMessage } from './database';
import { DbSyncMessage } from './types';
import cluster from 'cluster';
import process from 'process';

export function createServer(port: number): http.Server {
    console.log(`[Server] Starting server on port ${port}`); // ← Логирование

    const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
        try {
            const handled = handleUserRoutes(req, res);

            if (!handled) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: `Endpoint ${req.method} ${req.url} not found` }));
            }
        } catch (error) {
            console.error('Unhandled error during request processing:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Internal Server Error' }));
            } else {
                res.end();
            }
        }
    });

    server.listen(port, () => {
        const workerId = cluster.isWorker ? ` (Worker ${process.pid}, Port ${port})` : '';
        console.log(`Server running on port ${port}${workerId}`);
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`Error: Port ${port} is already in use.`);
        } else {
            console.error('Server startup error:', error);
        }
        process.exit(1);
    });

    if (cluster.isWorker) {
        process.on('message', (message: DbSyncMessage) => {
            handleDbSyncMessage(message);
        });
    }

    return server;
}