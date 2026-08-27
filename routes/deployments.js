const express = require('express');
const router = express.Router();
const Deployment = require('../models/Deployment');
const App = require('../models/App');

// GET - все деплои (с пагинацией)
router.get('/', async (req, res) => {
  try {
    const { appId, limit = 50 } = req.query;
    const query = {};
    if (appId) query.appId = appId;
    
    const deployments = await Deployment.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('appId', 'name');
    
    res.json(deployments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET - деплой по ID
router.get('/:id', async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.id)
      .populate('appId', 'name repository');
    
    if (!deployment) {
      return res.status(404).json({ error: 'Деплой не найден' });
    }
    
    res.json(deployment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET - логи деплоя
router.get('/:id/logs', async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) {
      return res.status(404).json({ error: 'Деплой не найден' });
    }
    
    res.json({ 
      deploymentId: deployment._id,
      logs: deployment.logs || [],
      status: deployment.status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - отменить деплой
router.post('/:id/cancel', async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) {
      return res.status(404).json({ error: 'Деплой не найден' });
    }
    
    if (deployment.status !== 'queued' && deployment.status !== 'building') {
      return res.status(400).json({ error: 'Деплой уже завершен' });
    }
    
    deployment.status = 'failed';
    deployment.logs.push('🛑 Деплой отменен пользователем');
    deployment.finishedAt = new Date();
    await deployment.save();
    
    res.json({ message: 'Деплой отменен' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
