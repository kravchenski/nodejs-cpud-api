export interface User {
    id: string; // uuid
    username: string;
    age: number;
    hobbies: string[];
  }
  export type NewUser = Omit<User, 'id'>;
  export type Database = Record<string, User>;
  
  export interface DbSyncMessage {
      type: 'sync' | 'update' | 'delete';
      payload: Database | { id: string; user?: User };
  }
  