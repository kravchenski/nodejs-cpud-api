import { v4 as uuidv4 } from 'uuid';
import { User, NewUser, Database, DbSyncMessage } from './types';
import cluster from 'cluster';
import process from 'process';

let users: Database = {};

function syncDbWithPrimary() {
  if (!cluster.isPrimary && process.send) {
    const message: DbSyncMessage = { type: 'sync', payload: users };
    process.send(message);
  }
}

function notifyPrimaryOfChange(type: 'update' | 'delete', payload: { id: string; user?: User }) {
    if (!cluster.isPrimary && process.send) {
        const message: DbSyncMessage = { type, payload };
        process.send(message);
        // console.log(`Worker ${process.pid} notified primary of ${type} for ID ${payload.id}`);
    }
}

export function handleDbSyncMessage(message: DbSyncMessage) {
    if (!cluster.isPrimary) {
        // console.log(`Worker ${process.pid} received DB message:`, message.type);
        switch (message.type) {
            case 'sync':
                if (typeof message.payload === 'object' && message.payload !== null && !Array.isArray(message.payload)) {
                    users = message.payload as Database;
                    // console.log(`Worker ${process.pid} synced DB state.`);
                } else {
                     console.warn(`Worker ${process.pid} received sync message with unexpected payload:`, message.payload);
                }
                break;
            case 'update':
                if (typeof message.payload === 'object' && message.payload !== null &&
                    'id' in message.payload && typeof message.payload.id === 'string' &&
                    'user' in message.payload && message.payload.user !== null && typeof message.payload.user === 'object') // Check user exists and is object
                {
                    const updatePayload = message.payload as { id: string; user: User }; // Optional cast for clarity
                    users[updatePayload.id] = updatePayload.user;
                    // console.log(`Worker ${process.pid} updated user ${updatePayload.id}`);
                } else {
                     console.warn(`Worker ${process.pid} received update message with unexpected payload:`, message.payload);
                }
                break;
            case 'delete':
                if (typeof message.payload === 'object' && message.payload !== null &&
                    'id' in message.payload && typeof message.payload.id === 'string')
                {
                    const deletePayload = message.payload as { id: string };
                    delete users[deletePayload.id];
                    // console.log(`Worker ${process.pid} deleted user ${deletePayload.id}`);
                } else {
                     console.warn(`Worker ${process.pid} received delete message with unexpected payload:`, message.payload);
                }
                break;
            default:
                 console.warn(`Worker ${process.pid} received message with unknown type:`, message.type);
        }
    }
}

export async function findAll(): Promise<User[]> {
  return Object.values(users);
}


export async function findById(id: string): Promise<User | undefined> {
  return users[id];
}

export async function create(userData: NewUser): Promise<User> {
  const newUser: User = {
    id: uuidv4(), // Generate a unique ID
    ...userData,
  };
  users[newUser.id] = newUser;

  if (process.env.NODE_ENV === 'multi') {
    notifyPrimaryOfChange('update', { id: newUser.id, user: newUser });
  }

  return newUser;
}


export async function update(id: string, userData: Partial<NewUser>): Promise<User | undefined> {
  const user = users[id];
  if (!user) {
    return undefined;
  }

  const updatedUser: User = {
    ...user,
    ...userData,
  };
  users[id] = updatedUser;

   if (process.env.NODE_ENV === 'multi') {
      notifyPrimaryOfChange('update', { id: updatedUser.id, user: updatedUser });
   }

  return updatedUser;
}

export async function remove(id: string): Promise<boolean> {
  if (!users[id]) {
    return false; // User not found
  }

  delete users[id];

  if (process.env.NODE_ENV === 'multi') {
      notifyPrimaryOfChange('delete', { id });
  }

  return true;
}
