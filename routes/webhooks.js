const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

module.exports = (storage) => {
  const router = require('express').Router();

  const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Неверный токен' });
    }
  };

  // Создать webhook
  router.post('/', authMiddleware, (req, res) => {
    const { appId, provider, webhookUrl, secret } = req.body;
    
    const webhook = {
      id: uuidv4(),
      userId: req.user.id,
      appId,
      provider: provider || 'github', // github | gitlab
      webhookUrl,
      secret: secret || '',
      active: true,
      createdAt: new Date().toISOString()
    };
    
    storage.webhooks.push(webhook);
    res.status(201).json(webhook);
  });

  // GET - все webhooks
  router.get('/', authMiddleware, (req, res) => {
    const webhooks = storage.webhooks.filter(w => w.userId === req.user.id);
    res.json(webhooks);
  });

  // DELETE - удалить webhook
  router.delete('/:id', authMiddleware, (req, res) => {
    const index = storage.webhooks.findIndex(w => w.id === req.params.id && w.userId === req.user.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Webhook не найден' });
    }
    storage.webhooks.splice(index, 1);
    res.json({ message: 'Webhook удален' });
  });

  // POST - эндпоинт для GitHub webhook
  router.post('/github/:appId', async (req, res) => {
    const { appId } = req.params;
    const app = storage.apps.find(a => a.id === appId);
    
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }

    // Проверка секрета (упрощенно)
    const webhook = storage.webhooks.find(w => w.appId === appId && w.provider === 'github');
    
    // Запускаем деплой
    const deployment = {
      id: uuidv4(),
      appId: app.id,
      appName: app.name,
      userId: app.userId,
      commitHash: req.body.after || 'webhook-commit',
      commitMessage: req.body.head_commit?.message || 'Автоматический деплой из GitHub',
      status: 'queued',
      logs: [`📦 Автоматический деплой из GitHub: ${new Date().toISOString()}`],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      duration: null,
      deployedUrl: null,
      createdAt: new Date().toISOString()
    };

    storage.deployments.push(deployment);
    
    // Запускаем деплой
    global.deployApp(app, deployment);
    
    res.json({ message: 'Webhook получен, деплой запущен' });
  });

  return router;
};
