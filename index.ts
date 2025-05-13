import http, { IncomingMessage, ServerResponse } from 'http'
import { v4 as uuidv4, validate as uuidValidate } from 'uuid'
import dotenv from 'dotenv'
import cluster from 'cluster'
import { cpus } from 'os'

dotenv.config()

const port = parseInt(process.env.PORT || '3000', 10)
const isClusterMode = process.env.CLUSTER_MODE === 'true'

interface User {
  id: string
  username: string
  age: number
  hobbies: string[]
}

let users: User[] = []

const validateUser = (
  req: IncomingMessage,
  res: ServerResponse,
  data: any,
  callback: (user: Omit<User, 'id'>) => void,
) => {
  if (!data) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Empty request body' }))
    return
  }

  const { username, age, hobbies } = data
  if (!username || typeof username !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        message: 'Username is required and must be a string',
      }),
    )
    return
  }
  if (!age || typeof age !== 'number' || age < 1) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        message: 'Age is required and must be a number greater than 0',
      }),
    )
    return
  }
  if (
    !hobbies ||
    !Array.isArray(hobbies) ||
    !hobbies.every((h) => typeof h === 'string')
  ) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        message: 'Hobbies is required and must be an array of strings',
      }),
    )
    return
  }
  callback({ username, age, hobbies })
}

const getRequestData = (req: IncomingMessage): Promise<any> => {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        if (body) {
          resolve(JSON.parse(body))
        } else {
          resolve(null)
        }
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', (err) => {
      reject(err)
    })
  })
}

const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    res.setHeader('Content-Type', 'application/json')
    const url = req.url?.split('?')[0] || ''
    const method = req.method

    if (method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.writeHead(204)
      res.end()
      return
    }
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (url === '/api/users') {
      switch (method) {
        case 'GET':
          res.writeHead(200)
          res.end(JSON.stringify(users))
          break
        case 'POST':
          try {
            const data = await getRequestData(req)
            validateUser(req, res, data, (newUser) => {
              const user: User = { id: uuidv4(), ...newUser }
              users.push(user)
              res.writeHead(201)
              res.end(JSON.stringify(user))
            })
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ message: 'Invalid JSON' }))
          }
          break
        default:
          res.writeHead(405)
          res.end(JSON.stringify({ message: 'Method Not Allowed' }))
      }
    } else if (url?.startsWith('/api/users/')) {
      const id = url.split('/').pop() || ''
      if (!uuidValidate(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'Invalid user ID' }))
        return
      }
      const userIndex = users.findIndex((u) => u.id === id)
      if (userIndex === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'User not found' }))
        return
      }
      switch (method) {
        case 'GET':
          res.writeHead(200)
          res.end(JSON.stringify(users[userIndex]))
          break
        case 'PUT':
          try {
            const data = await getRequestData(req)
            validateUser(req, res, data, (updatedUser) => {
              users[userIndex] = { ...users[userIndex], ...updatedUser }
              res.writeHead(200)
              res.end(JSON.stringify(users[userIndex]))
            })
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ message: 'Invalid JSON' }))
          }
          break;
        case 'DELETE':
          const initialLength = users.length
          users = users.filter((u) => u.id !== id)
          if (users.length < initialLength) {
            res.writeHead(204)
            res.end()
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ message: 'User not found' }))
          }
          break
        default:
          res.writeHead(405)
          res.end(JSON.stringify({ message: 'Method Not Allowed' }))
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'Route not found' }))
    }
  } catch (error) {
    console.error(error)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Internal server error' }))
  }
}

if (isClusterMode && cluster.isPrimary) {
  const numCPUs = cpus().length
  console.log(`Forking server for ${numCPUs} CPUs`)
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork()
  }
  cluster.on('listening', (worker, address) => {
    console.log(
      `Worker ${worker.process.pid} is listening on port ${address.port}`,
    )
  })
  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died`)
  })
} else {
  const server = http.createServer(handleRequest)
  server.listen(port, () => {
    console.log(`Server is running on port ${port}`)
  })
}
