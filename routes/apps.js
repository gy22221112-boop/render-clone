const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

module.exports = (storage) => {
  const router = require('express').Router();

  // Middleware для проверки токена
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

  // GET - все приложения
  router.get('/', authMiddleware, (req, res) => {
    const userApps = storage.apps.filter(a => a.userId === req.user.id);
    res.json(userApps);
  });

  // GET - приложение по ID
  router.get('/:id', authMiddleware, (req, res) => {
    const app = storage.apps.find(a => a.id === req.params.id && a.userId === req.user.id);
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }
    res.json(app);
  });

  // POST - создать приложение
  router.post('/', authMiddleware, (req, res) => {
    const { name, repository, branch = 'main', language = 'nodejs', buildCommand, startCommand, envVars = {} } = req.body;
    
    if (storage.apps.find(a => a.name === name && a.userId === req.user.id)) {
      return res.status(400).json({ error: 'Приложение с таким именем уже существует' });
    }

    // Определяем команды по умолчанию для разных языков
    const defaultCommands = {
      nodejs: { build: 'npm install', start: 'node server.js' },
      python: { build: 'pip install -r requirements.txt', start: 'python app.py' },
      go: { build: 'go build -o app', start: './app' },
      ruby: { build: 'bundle install', start: 'ruby app.rb' }
    };

    const defaults = defaultCommands[language] || defaultCommands.nodejs;

    const app = {
      id: uuidv4(),
      userId: req.user.id,
      name,
      repository,
      branch,
      language,
      buildCommand: buildCommand || defaults.build,
      startCommand: startCommand || defaults.start,
      envVars,
      status: 'pending',
      deployedAt: null,
      url: null,
      containerId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    storage.apps.push(app);
    res.status(201).json(app);
  });

  // PUT - обновить приложение
  router.put('/:id', authMiddleware, (req, res) => {
    const app = storage.apps.find(a => a.id === req.params.id && a.userId === req.user.id);
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }

    const { name, branch, buildCommand, startCommand, envVars } = req.body;
    if (name) app.name = name;
    if (branch) app.branch = branch;
    if (buildCommand) app.buildCommand = buildCommand;
    if (startCommand) app.startCommand = startCommand;
    if (envVars) app.envVars = { ...app.envVars, ...envVars };
    app.updatedAt = new Date().toISOString();

    res.json(app);
  });

  // DELETE - удалить приложение
  router.delete('/:id', authMiddleware, (req, res) => {
    const index = storage.apps.findIndex(a => a.id === req.params.id && a.userId === req.user.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }
    
    storage.apps.splice(index, 1);
    // Удаляем связанные деплои
    storage.deployments = storage.deployments.filter(d => d.appId !== req.params.id);
    
    res.json({ message: 'Приложение удалено' });
  });

  // POST - запустить деплой
  router.post('/:id/deploy', authMiddleware, async (req, res) => {
    const app = storage.apps.find(a => a.id === req.params.id && a.userId === req.user.id);
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }

    const deployment = {
      id: uuidv4(),
      appId: app.id,
      appName: app.name,
      userId: req.user.id,
      commitHash: `auto-${Date.now()}`,
      commitMessage: req.body.message || 'Ручной деплой',
      status: 'queued',
      logs: [`📦 Начало деплоя: ${new Date().toISOString()}`],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      duration: null,
      deployedUrl: null,
      createdAt: new Date().toISOString()
    };

    storage.deployments.push(deployment);
    res.status(202).json({
      message: 'Деплой запущен',
      deploymentId: deployment.id
    });

    // Запускаем асинхронный деплой
    global.deployApp(app, deployment);
  });

  return router;
};
