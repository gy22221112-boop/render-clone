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

  // GET - все деплои пользователя
  router.get('/', authMiddleware, (req, res) => {
    const { appId, limit = 50 } = req.query;
    let filtered = storage.deployments.filter(d => d.userId === req.user.id);
    if (appId) {
      filtered = filtered.filter(d => d.appId === appId);
    }
    filtered = filtered.slice(0, parseInt(limit));
    res.json(filtered);
  });

  // GET - деплой по ID
  router.get('/:id', authMiddleware, (req, res) => {
    const deployment = storage.deployments.find(d => d.id === req.params.id && d.userId === req.user.id);
    if (!deployment) {
      return res.status(404).json({ error: 'Деплой не найден' });
    }
    res.json(deployment);
  });

  // GET - логи деплоя
  router.get('/:id/logs', authMiddleware, (req, res) => {
    const deployment = storage.deployments.find(d => d.id === req.params.id && d.userId === req.user.id);
    if (!deployment) {
      return res.status(404).json({ error: 'Деплой не найден' });
    }
    res.json({
      deploymentId: deployment.id,
      logs: deployment.logs || [],
      status: deployment.status
    });
  });

  // POST - отменить деплой
  router.post('/:id/cancel', authMiddleware, (req, res) => {
    const deployment = storage.deployments.find(d => d.id === req.params.id && d.userId === req.user.id);
    if (!deployment) {
      return res.status(404).json({ error: 'Деплой не найден' });
    }
    
    if (deployment.status !== 'queued' && deployment.status !== 'building') {
      return res.status(400).json({ error: 'Деплой уже завершен' });
    }
    
    deployment.status = 'failed';
    deployment.logs.push('🛑 Деплой отменен пользователем');
    deployment.finishedAt = new Date().toISOString();
    
    if (global.broadcastLogs) {
      global.broadcastLogs(deployment.id, '🛑 Деплой отменен пользователем');
    }
    
    res.json({ message: 'Деплой отменен' });
  });

  return router;
};
