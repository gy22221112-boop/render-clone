const express = require('express');
const router = express.Router();
const App = require('../models/App');
const Deployment = require('../models/Deployment');
const deployService = require('../services/deployService');

// GET - список всех приложений
router.get('/', async (req, res) => {
  try {
    const apps = await App.find().sort({ createdAt: -1 });
    res.json(apps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET - получить приложение по ID
router.get('/:id', async (req, res) => {
  try {
    const app = await App.findById(req.params.id);
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }
    res.json(app);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - создать новое приложение
router.post('/', async (req, res) => {
  try {
    const { name, repository, branch, buildCommand, startCommand, envVars } = req.body;
    
    // Проверка на дубликат имени
    const existingApp = await App.findOne({ name });
    if (existingApp) {
      return res.status(400).json({ error: 'Приложение с таким именем уже существует' });
    }

    const app = new App({
      name,
      repository,
      branch: branch || 'main',
      buildCommand: buildCommand || 'npm install && npm run build',
      startCommand: startCommand || 'npm start',
      envVars: envVars || {}
    });

    await app.save();
    res.status(201).json(app);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT - обновить приложение
router.put('/:id', async (req, res) => {
  try {
    const app = await App.findById(req.params.id);
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }

    const { name, branch, buildCommand, startCommand, envVars } = req.body;
    
    if (name) app.name = name;
    if (branch) app.branch = branch;
    if (buildCommand) app.buildCommand = buildCommand;
    if (startCommand) app.startCommand = startCommand;
    if (envVars) app.envVars = envVars;

    await app.save();
    res.json(app);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE - удалить приложение
router.delete('/:id', async (req, res) => {
  try {
    const app = await App.findById(req.params.id);
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }

    // Остановить контейнер если есть
    if (app.containerId) {
      await deployService.stopContainer(app.containerId);
    }

    await app.deleteOne();
    res.json({ message: 'Приложение удалено' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - деплой приложения
router.post('/:id/deploy', async (req, res) => {
  try {
    const app = await App.findById(req.params.id);
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }

    // Создаем новый деплой
    const deployment = new Deployment({
      appId: app._id,
      commitHash: `auto-${Date.now()}`,
      commitMessage: req.body.message || 'Ручной деплой'
    });

    await deployment.save();

    // Запускаем асинхронный деплой
    deployService.deployApp(app, deployment);

    res.status(202).json({
      message: 'Деплой запущен',
      deploymentId: deployment._id,
      status: deployment.status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
