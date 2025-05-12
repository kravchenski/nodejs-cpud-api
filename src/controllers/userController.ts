import { IncomingMessage, ServerResponse } from 'http';
import * as db from '../database';
import { User, NewUser } from '../types';
import { isValidUuid } from '../utils/validateUuid';

function sendResponse(res: ServerResponse, statusCode: number, data: unknown) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}


function sendError(res: ServerResponse, statusCode: number, message: string) {
  sendResponse(res, statusCode, { message });
}

export async function getUsers(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const users = await db.findAll();
    sendResponse(res, 200, users);
  } catch (error) {
    console.error('Error getting users:', error);
    sendError(res, 500, 'Internal Server Error');
  }
}


export async function getUserById(req: IncomingMessage, res: ServerResponse, userId: string): Promise<void> {
  if (!isValidUuid(userId)) {
    return sendError(res, 400, 'Invalid User ID format (must be UUID)');
  }

  try {
    const user = await db.findById(userId);
    if (!user) {
      return sendError(res, 404, `User with ID ${userId} not found`);
    }
    sendResponse(res, 200, user);
  } catch (error) {
    console.error(`Error getting user ${userId}:`, error);
    sendError(res, 500, 'Internal Server Error');
  }
}

export async function createUser(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const userData: NewUser = JSON.parse(body);

      if (!userData.username || typeof userData.username !== 'string' ||
          !userData.age || typeof userData.age !== 'number' ||
          !userData.hobbies || !Array.isArray(userData.hobbies) ||
          !userData.hobbies.every(h => typeof h === 'string')) {
        return sendError(res, 400, 'Request body is missing required fields or fields have invalid types (username: string, age: number, hobbies: string[])');
      }

      const newUser = await db.create(userData);
      sendResponse(res, 201, newUser);
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendError(res, 400, 'Invalid JSON in request body');
      } else {
        console.error('Error creating user:', error);
        sendError(res, 500, 'Internal Server Error');
      }
    }
  });

   req.on('error', (err) => {
        console.error('Request error:', err);
        sendError(res, 500, 'Internal Server Error during request processing');
   });
}


export async function updateUser(req: IncomingMessage, res: ServerResponse, userId: string): Promise<void> {
  if (!isValidUuid(userId)) {
    return sendError(res, 400, 'Invalid User ID format (must be UUID)');
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
        const updateData: Partial<NewUser> = JSON.parse(body);

        if (updateData.username !== undefined && typeof updateData.username !== 'string') {
             return sendError(res, 400, 'Invalid type for username (must be string)');
        }
        if (updateData.age !== undefined && typeof updateData.age !== 'number') {
             return sendError(res, 400, 'Invalid type for age (must be number)');
        }
        if (updateData.hobbies !== undefined && (!Array.isArray(updateData.hobbies) || !updateData.hobbies.every(h => typeof h === 'string'))) {
             return sendError(res, 400, 'Invalid type for hobbies (must be array of strings)');
        }


      const updatedUser = await db.update(userId, updateData);

      if (!updatedUser) {
        return sendError(res, 404, `User with ID ${userId} not found`);
      }

      sendResponse(res, 200, updatedUser);
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendError(res, 400, 'Invalid JSON in request body');
      } else {
        console.error(`Error updating user ${userId}:`, error);
        sendError(res, 500, 'Internal Server Error');
      }
    }
  });

   req.on('error', (err) => {
        console.error('Request error:', err);
        sendError(res, 500, 'Internal Server Error during request processing');
   });
}

export async function deleteUser(req: IncomingMessage, res: ServerResponse, userId: string): Promise<void> {
  if (!isValidUuid(userId)) {
    return sendError(res, 400, 'Invalid User ID format (must be UUID)');
  }

  try {
    const deleted = await db.remove(userId);

    if (!deleted) {
      return sendError(res, 404, `User with ID ${userId} not found`);
    }

    res.writeHead(204);
    res.end();
  } catch (error) {
    console.error(`Error deleting user ${userId}:`, error);
    sendError(res, 500, 'Internal Server Error');
  }
}
