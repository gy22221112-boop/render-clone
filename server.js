require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const os = require('os');
const { exec } = require('child_process');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Docker = require('dockerode');

// Импорт сервисов
const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/apps');
const deploymentRoutes = require('./routes/deployments');
const webhookRoutes = require('./routes/webhooks');
const monitorService = require('./services/monitorService');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Логирование
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Проверка Docker
const docker = new Docker();
let isDockerAvailable = false;

async function checkDocker() {
  try {
    await docker.ping();
    isDockerAvailable = true;
    console.log('✅ Docker доступен');
  } catch (error) {
    isDockerAvailable = false;
    console.log('⚠️ Docker не найден. Используется эмуляция.');
  }
}
checkDocker();

// ============ Хранилище в памяти ============
const storage = {
  users: [],
  apps: [],
  deployments: [],
  webhooks: [],
  wsClients: new Map(),
  resources: {
    cpu: 0,
    memory: 0,
    uptime: 0
  }
};

// Создаем администратора при первом запуске
if (!storage.users.find(u => u.username === process.env.ADMIN_USERNAME)) {
  const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
  storage.users.push({
    id: uuidv4(),
    username: process.env.ADMIN_USERNAME || 'admin',
    password: hashedPassword,
    role: 'admin',
    createdAt: new Date().toISOString()
  });
  console.log('✅ Администратор создан');
}

// ============ API Routes ============
app.use('/api/auth', authRoutes(storage));
app.use('/api/apps', appRoutes(storage));
app.use('/api/deployments', deploymentRoutes(storage));
app.use('/api/webhooks', webhookRoutes(storage));

// ============ Мониторинг ресурсов ============
app.get('/api/monitoring', (req, res) => {
  const stats = monitorService.getStats();
  res.json(stats);
});

app.get('/api/stats', (req, res) => {
  res.json({
    apps: storage.apps.length,
    deployments: storage.deployments.length,
    users: storage.users.length,
    resources: monitorService.getStats()
  });
});

// ============ WebSocket для стриминга логов ============
wss.on('connection', (ws, req) => {
  console.log('🔌 Новое WebSocket соединение');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'subscribe') {
        const deploymentId = data.deploymentId;
        if (!storage.wsClients.has(deploymentId)) {
          storage.wsClients.set(deploymentId, new Set());
        }
        storage.wsClients.get(deploymentId).add(ws);
        ws.deploymentId = deploymentId;
        console.log(`📡 Клиент подписан на деплой ${deploymentId}`);
        
        const deployment = storage.deployments.find(d => d.id === deploymentId);
        if (deployment && deployment.logs) {
          ws.send(JSON.stringify({
            type: 'logs',
            data: deployment.logs.join('\n')
          }));
        }
      }
      
      if (data.type === 'unsubscribe') {
        if (ws.deploymentId && storage.wsClients.has(ws.deploymentId)) {
          storage.wsClients.get(ws.deploymentId).delete(ws);
        }
      }
    } catch (error) {
      console.error('WebSocket ошибка:', error);
    }
  });
  
  ws.on('close', () => {
    if (ws.deploymentId && storage.wsClients.has(ws.deploymentId)) {
      storage.wsClients.get(ws.deploymentId).delete(ws);
    }
    console.log('🔌 WebSocket соединение закрыто');
  });
});

// Функция для отправки логов через WebSocket
function broadcastLogs(deploymentId, logMessage) {
  if (storage.wsClients.has(deploymentId)) {
    const clients = storage.wsClients.get(deploymentId);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'log',
          data: logMessage,
          timestamp: new Date().toISOString()
        }));
      }
    });
  }
}

global.broadcastLogs = broadcastLogs;
global.storage = storage;

// ============ Функция деплоя ============
async function deployApp(app, deployment) {
  try {
    const deployService = require('./services/deployService');
    await deployService.deployApp(app, deployment, global.broadcastLogs);
  } catch (error) {
    console.error('Ошибка деплоя:', error);
  }
}

global.deployApp = deployApp;

// ============ Запуск мониторинга ============
monitorService.startMonitoring(storage);

// ============ ГЛАВНАЯ СТРАНИЦА ============
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ============ Запуск сервера ============
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📡 WebSocket доступен на ws://localhost:${PORT}`);
  console.log(`🌐 Веб-кабинет: http://localhost:${PORT}`);
  console.log(`👤 Логин: ${process.env.ADMIN_USERNAME || 'admin'} / Пароль: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
  console.log(`🐳 Docker: ${isDockerAvailable ? 'Доступен ✅' : 'Не доступен ⚠️'}`);
});
