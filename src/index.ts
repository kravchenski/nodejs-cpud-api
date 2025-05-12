import dotenv from 'dotenv';
import path from 'path';
import { createServer } from './server';
import { startCluster } from './userCluster';

dotenv.config({ path: path.resolve(__dirname, '../.env') });    

const PORT = parseInt(process.env.PORT || '4000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`Starting application in ${NODE_ENV} mode...`);

if (NODE_ENV === 'multi') {
  startCluster(PORT);
} else {
  createServer(PORT);
}

process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});
