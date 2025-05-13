import { IncomingMessage, ServerResponse } from 'http';
import * as userController from '../controllers/userController';

const USER_ID_REGEX = /^\/api\/users\/([a-fA-F0-9-]+)$/;

export function handleUserRoutes(req: IncomingMessage, res: ServerResponse): boolean {
  const { method, url } = req;

  if (!url?.startsWith('/api/users')) {
    return false; // Not a user route
  }

  const userIdMatch = url.match(USER_ID_REGEX);

  if (url === '/api/users' && method === 'GET') {
    userController.getUsers(req, res);
    return true;
  }

  if (url === '/api/users' && method === 'POST') {
    userController.createUser(req, res);
    return true;
  }

  if (userIdMatch) {
    const userId = userIdMatch[1]; // Extract userId from the URL

    if (method === 'GET') {
      userController.getUserById(req, res, userId);
      return true;
    }

    if (method === 'PUT') {
      userController.updateUser(req, res, userId);
      return true;
    }

    if (method === 'DELETE') {
      userController.deleteUser(req, res, userId);
      return true;
    }
  }

  return false;
}
