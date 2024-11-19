import express from 'express'
import logger from 'morgan'
import { Server } from 'socket.io'
import { createServer } from 'node:http'
import dotenv from 'dotenv'
import { createClient } from '@libsql/client'

const port = process.env.PORT ?? 3000
/* Socket.io y express en el mismo servidor */
const app = express()
const server = createServer(app)
const io = new Server(server, {
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
    }
})

dotenv.config()

const db = createClient({
    url: process.env.DB_URL,
    authToken: process.env.DB_TOKEN
})

await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
    )   
`)



io.on('connection', async (socket) => {
    console.log ('Vairo has connected')
    if(socket.recovered){
        console.log('Recuperamos uno!')
    } else {
        const results = await db.execute({
            sql: `SELECT id, content, user FROM MESSAGES WHERE id>?`,
            args: [socket.handshake.auth.serverOffset ?? 0]
        })
            
        results.rows.forEach(row => {
            socket.emit('chat message', row.content, row.id.toString(), row.user)
        })
    }
    socket.on('disconnect', () => {
        console.log('Vairo has disconnected')
    })
    socket.on('chat message', async (msg) => {
        let result
        let username = socket.handshake.auth.username ?? 'anonymous'
        try{
            result = await db.execute({
                sql: `INSERT INTO messages(content, user) VALUES (:msg , :username)`,
                args: {msg, username}
            })
        } catch (e) {
            console.error(e)
            return
        }
        io.emit('chat message', msg, result.lastInsertRowid.toString(), username) /* A todo los clientes (io)*/
    })
})
/* logger de Morgan */
app.use(logger('dev'))

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`)
})

