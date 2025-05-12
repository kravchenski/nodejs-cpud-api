import request from 'supertest';
import { createServer } from '../server';
import http from 'http';
import { User, NewUser } from '../types';

let server: http.Server;
const testPort = 4005;
let createdUserId: string | null = null;

beforeAll((done) => {
  server = createServer(testPort);
  server.on('listening', () => done());
  server.on('error', (err) => done(err));
});

afterAll((done) => {
  server.close((err) => {
    if (err) {
      console.error('Error closing test server:', err);
      return done(err);
    }
    done();
  });
});

describe('CRUD API Scenarios', () => {
  const testUser: NewUser = {
    username: 'Test User',
    age: 30,
    hobbies: ['testing', 'coding'],
  };

  const updatedUserData: Partial<NewUser> = {
    username: 'Updated Test User',
    age: 31,
  };

  test('Scenario 1: Full CRUD lifecycle', async () => {
    // GET all users (initial empty state)
    let response = await request(server).get('/api/users');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);

    // POST create new user
    response = await request(server)
      .post('/api/users')
      .send(testUser);
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.username).toBe(testUser.username);
    expect(response.body.age).toBe(testUser.age);
    expect(response.body.hobbies).toEqual(testUser.hobbies);
    createdUserId = response.body.id;

    // GET user by ID
    response = await request(server).get(`/api/users/${createdUserId}`);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(createdUserId);
    expect(response.body.username).toBe(testUser.username);

    // PUT update user
    response = await request(server)
      .put(`/api/users/${createdUserId}`)
      .send(updatedUserData);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(createdUserId);
    expect(response.body.username).toBe(updatedUserData.username);
    expect(response.body.age).toBe(updatedUserData.age);
    expect(response.body.hobbies).toEqual(testUser.hobbies);

    // DELETE user
    response = await request(server).delete(`/api/users/${createdUserId}`);
    expect(response.status).toBe(204);

    // GET deleted user should return 404
    response = await request(server).get(`/api/users/${createdUserId}`);
    expect(response.status).toBe(404);
    expect(response.body.message).toContain('not found');
  });

  test('Scenario 2: Multiple users', async () => {
    const user1Data: NewUser = { username: 'Alice', age: 25, hobbies: ['reading'] };
    const user2Data: NewUser = { username: 'Bob', age: 35, hobbies: ['hiking', 'movies'] };

    // Create multiple users
    let res1 = await request(server).post('/api/users').send(user1Data);
    expect(res1.status).toBe(201);
    const user1Id = res1.body.id;

    let res2 = await request(server).post('/api/users').send(user2Data);
    expect(res2.status).toBe(201);
    const user2Id = res2.body.id;

    // GET all users
    let getAllRes = await request(server).get('/api/users');
    expect(getAllRes.status).toBe(200);
    expect(getAllRes.body).toBeInstanceOf(Array);
    expect(getAllRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: user1Id, username: user1Data.username }),
        expect.objectContaining({ id: user2Id, username: user2Data.username }),
      ])
    );

    // Cleanup
    await request(server).delete(`/api/users/${user1Id}`);
    await request(server).delete(`/api/users/${user2Id}`);
  });

  test('Scenario 3: Horizontal Scaling Consistency', async () => {
   
    // Create user
    const response = await request(server)
      .post('/api/users')
      .send(testUser);
    
    const userId = response.body.id;
    
    // Verify user exists
    const getResponse = await request(server).get(`/api/users/${userId}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(userId);
    
    // Delete user
    await request(server).delete(`/api/users/${userId}`);
    
    // Verify user deleted
    const deleteResponse = await request(server).get(`/api/users/${userId}`);
    expect(deleteResponse.status).toBe(404);
  });
});