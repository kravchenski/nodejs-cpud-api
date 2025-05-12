import cluster from 'cluster'; // Изменён импорт
import http from 'http';
import { createServer } from './server';
import { Database, DbSyncMessage, User } from './types';
import os from 'os';
import process from 'process';
import { Worker } from 'cluster'
let primaryDb: Database = {};
let workers: Worker[] = [];
let workerPorts: number[] = [];
let currentWorkerIndex = 0;

function broadcastDbChange(message: DbSyncMessage, senderWorker?: Worker) {
    if (cluster.isPrimary) {
        workers.forEach(worker => {
            if (worker.isConnected() && worker !== senderWorker) {
                worker.send(message);
            }
        });
    }
}

function setupWorker(worker: Worker) {
    worker.on('message', (message: DbSyncMessage) => {
        switch (message.type) {
            case 'sync':
                worker.send({ type: 'sync', payload: primaryDb });
                break;
            case 'update':
                if (
                    typeof message.payload === 'object' &&
                    message.payload !== null &&
                    'id' in message.payload &&
                    typeof message.payload.id === 'string' &&
                    'user' in message.payload &&
                    typeof message.payload.user === 'object'
                ) {
                    const { id, user } = message.payload as { id: string; user: User };
                    primaryDb[id] = user;
                    broadcastDbChange(message, worker);
                } else {
                    console.warn(`Invalid update message from worker ${worker.process.pid}:`, message.payload);
                }
                break;
            case 'delete':
                if (
                    typeof message.payload === 'object' &&
                    message.payload !== null &&
                    'id' in message.payload &&
                    typeof message.payload.id === 'string'
                ) {
                    const { id } = message.payload as { id: string };
                    delete primaryDb[id];
                    broadcastDbChange(message, worker);
                } else {
                    console.warn(`Invalid delete message from worker ${worker.process.pid}:`, message.payload);
                }
                break;
            default:
                console.warn(`Unknown message type from worker ${worker.process.pid}:`, message.type);
        }
    });

    worker.on('online', () => {
        console.log(`Worker ${worker.process.pid} is online.`);
    });
}

export function startCluster(basePort: number) {
    const numCPUs = os.availableParallelism?.() || os.cpus().length;
    const numWorkers = Math.max(1, numCPUs - 1);

    if (cluster.isPrimary) {
        console.log(`Primary process ${process.pid} is running`);
        console.log(`Forking ${numWorkers} workers...`);

        for (let i = 0; i < numWorkers; i++) {
            workerPorts.push(basePort + 1 + i);
        }

        for (let i = 0; i < numWorkers; i++) {
            const port = workerPorts[i];
            console.log(`Primary: Forking worker ${i} with port ${port}`);
            const worker = cluster.fork({ WORKER_PORT: port.toString() }); // Используем cluster.fork()
            workers.push(worker);
            setupWorker(worker);
            worker.send({ type: 'sync', payload: primaryDb });
        }

        cluster.on('exit', (worker, code, signal) => {
            console.log(`Worker ${worker.process.pid} exited (code=${code}, signal=${signal})`);

            const exitedWorkerIndex = workers.findIndex(w => w.id === worker.id);
            if (exitedWorkerIndex === -1) {
                console.error(`Primary: Could not find exited worker ${worker.process.pid} in workers list.`);
                return;
            }

            const exitedWorkerPort = workerPorts[exitedWorkerIndex];

            workers.splice(exitedWorkerIndex, 1);

            console.log(`Primary: Forking new worker to replace exited worker ${worker.process.pid} on port ${exitedWorkerPort}.`);
            const newWorker = cluster.fork({ WORKER_PORT: exitedWorkerPort.toString() }); // cluster.fork()
            workers.splice(exitedWorkerIndex, 0, newWorker);

            setupWorker(newWorker);
            newWorker.send({ type: 'sync', payload: primaryDb });
        });

        const loadBalancer = http.createServer((req, res) => {
            if (workers.length === 0) {
                console.error('Load Balancer: No workers available.');
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'No service workers available.' }));
                return;
            }

            const workerIndex = currentWorkerIndex;
            const worker = workers[workerIndex];
            currentWorkerIndex = (currentWorkerIndex + 1) % workers.length;

            const port = workerPorts[workerIndex];

            if (!port) {
                console.error(`Load Balancer: Could not find port for worker index ${workerIndex}.`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Internal Load Balancer Error: Port not found.' }));
                return;
            }

            console.log(`Load Balancer: Routing request to worker ${worker.process.pid} on port ${port}`);

            const options = {
                hostname: 'localhost',
                port,
                path: req.url,
                method: req.method,
                headers: req.headers,
            };

            const proxyReq = http.request(options, proxyRes => {
                res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
                proxyRes.pipe(res);
            });

            proxyReq.on('error', err => {
                console.error(`Load Balancer: Proxy error to worker ${worker.process.pid}:`, err);
                if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                }
                res.end(JSON.stringify({ message: 'Error proxying to worker.' }));
            });

            req.pipe(proxyReq);
        });

        loadBalancer.listen(basePort, () => {
            console.log(`Load balancer listening on port ${basePort}`);
        });

        loadBalancer.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`Load balancer error: Port ${basePort} is already in use`);
            } else {
                console.error('Load balancer error:', err);
            }
            process.exit(1);
        });
    } else {
        console.log(`Worker process ${process.pid} started.`);
        const workerPortEnv = process.env.WORKER_PORT;
        console.log(`Worker ${process.pid}: WORKER_PORT environment variable is "${workerPortEnv}"`);

        const port = parseInt(workerPortEnv || '0', 10);
        console.log(`Worker ${process.pid}: Parsed port is ${port}`);

        if (!port) {
            console.error(`Worker ${process.pid} has no assigned or invalid port.`);
            process.exit(1);
        }

        console.log(`Worker ${process.pid}: Calling createServer(${port})...`);
        createServer(port);
    }
}