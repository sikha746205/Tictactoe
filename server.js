// Minimal WebSocket server for Tic Tac Toe online mode
// Usage:
// 1. npm install
// 2. npm start

const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname)));

const wss = new WebSocket.Server({ server });

const rooms = {}; // roomId -> { clients: [ws, ...], board: Array(9), currentPlayer: 'X' }

function genRoomId() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function send(ws, data) {
    try {
        ws.send(JSON.stringify(data));
    } catch (e) {
        console.error('Send failed', e);
    }
}

function broadcastToRoom(roomId, data) {
    const room = rooms[roomId];
    if (!room) return;
    room.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) send(c, data);
    });
}

wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
        let data;
        try {
            data = JSON.parse(msg);
        } catch (err) {
            send(ws, { type: 'error', message: 'Invalid JSON' });
            return;
        }

        switch (data.type) {
            case 'create': {
                const roomId = genRoomId();
                rooms[roomId] = { clients: [ws], board: Array(9).fill(null), currentPlayer: 'X' };
                ws.roomId = roomId;
                ws.symbol = 'X';
                send(ws, { type: 'created', roomId, symbol: 'X' });
                break;
            }

            case 'join': {
                const { roomId } = data;
                const room = rooms[roomId];
                if (!room) {
                    send(ws, { type: 'error', message: 'Room not found' });
                    return;
                }
                if (room.clients.length >= 2) {
                    send(ws, { type: 'error', message: 'Room full' });
                    return;
                }
                room.clients.push(ws);
                ws.roomId = roomId;
                ws.symbol = 'O';
                // Notify joiner
                send(ws, { type: 'joined', roomId, symbol: 'O' });
                // Notify creator/opponent
                broadcastToRoom(roomId, { type: 'opponent-joined' });
                // Send current state
                send(ws, { type: 'state', board: room.board, currentPlayer: room.currentPlayer });
                break;
            }

            case 'move': {
                const { roomId, index, symbol } = data;
                const room = rooms[roomId];
                if (!room) {
                    send(ws, { type: 'error', message: 'Room not found' });
                    return;
                }
                // basic validation
                if (typeof index !== 'number' || index < 0 || index > 8) {
                    send(ws, { type: 'error', message: 'Invalid move' });
                    return;
                }
                if (room.board[index] !== null) {
                    send(ws, { type: 'error', message: 'Cell already occupied' });
                    return;
                }
                // apply move
                room.board[index] = symbol;
                room.currentPlayer = room.currentPlayer === 'X' ? 'O' : 'X';
                // broadcast move to both players
                broadcastToRoom(roomId, { type: 'move', index, symbol });
                break;
            }

            default:
                send(ws, { type: 'error', message: 'Unknown message type' });
        }
    });

    ws.on('close', () => {
        const { roomId } = ws;
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            // remove ws from room
            room.clients = room.clients.filter(c => c !== ws);
            // notify remaining client
            if (room.clients.length === 1 && room.clients[0].readyState === WebSocket.OPEN) {
                send(room.clients[0], { type: 'error', message: 'Opponent disconnected' });
            }
            // cleanup empty rooms
            if (room.clients.length === 0) delete rooms[roomId];
        }
    });
});

console.log('WebSocket server running on ws://localhost:8080');