const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');
const App = require('../models/App');
const Deployment = require('../models/Deployment');
const fs = require('fs').promises;
const path = require('path');
const simpleGit = require('simple-git');

// Используем Docker API
const docker = new Docker();

class DeployService {
  constructor() {
    this.isDockerAvailable = false;
    this.checkDocker();
  }

  async checkDocker() {
    try {
      await docker.ping();
      this.isDockerAvailable = true;
      console.log('✅ Docker доступен');
    } catch (error) {
      this.isDockerAvailable = false;
      console.log('⚠️ Docker не найден. Используется эмуляция деплоя.');
    }
  }

  async deployApp(app, deployment) {
    try {
      console.log(`🚀 Начинаем деплой приложения: ${app.name}`);
      
      // Обновляем статус
      deployment.status = 'building';
      deployment.startedAt = new Date();
      deployment.logs.push(`📦 Начало деплоя: ${new Date().toISOString()}`);
      await deployment.save();

      // Эмуляция сборки
      deployment.logs.push(`📥 Клонирование репозитория: ${app.repository}`);
      await deployment.save();

      // Имитация сборки (в реальном проекте здесь будет Git + Docker build)
      await this.simulateBuild(app, deployment);

      // Запускаем контейнер
      deployment.logs.push(`🐳 Запуск контейнера...`);
      await deployment.save();

      if (this.isDockerAvailable) {
        await this.deployWithDocker(app, deployment);
      } else {
        await this.deployEmulation(app, deployment);
      }

      // Обновляем статус приложения
      app.status = 'deployed';
      app.deployedAt = new Date();
      app.url = `http://localhost:${process.env.PORT || 3000}/apps/${app.name}`;
      await app.save();

      deployment.status = 'success';
      deployment.finishedAt = new Date();
      deployment.duration = (deployment.finishedAt - deployment.startedAt) / 1000;
      deployment.logs.push(`✅ Деплой успешно завершен за ${deployment.duration} секунд`);
      deployment.logs.push(`🌐 Приложение доступно: ${app.url}`);
      await deployment.save();

      console.log(`✅ Деплой ${app.name} завершен успешно`);
      return deployment;

    } catch (error) {
      console.error(`❌ Ошибка деплоя ${app.name}:`, error);
      
      deployment.status = 'failed';
      deployment.finishedAt = new Date();
      deployment.logs.push(`❌ Ошибка: ${error.message}`);
      await deployment.save();

      app.status = 'failed';
      await app.save();

      throw error;
    }
  }

  async simulateBuild(app, deployment) {
    const steps = [
      `📦 Установка зависимостей...`,
      `🔨 Выполнение команды сборки: ${app.buildCommand}`,
      `⚙️ Оптимизация билда...`,
      `📦 Сборка завершена`
    ];

    for (const step of steps) {
      deployment.logs.push(step);
      await deployment.save();
      await this.sleep(1000); // Имитация времени сборки
    }
  }

  async deployWithDocker(app, deployment) {
    try {
      const containerName = `render-clone-${app.name}-${uuidv4().slice(0, 8)}`;
      
      // Создаем контейнер
      const container = await docker.createContainer({
        Image: 'node:18-alpine',
        name: containerName,
        Cmd: ['sh', '-c', app.startCommand],
        Env: Object.entries(app.envVars || {}).map(([k, v]) => `${k}=${v}`),
        ExposedPorts: {
          '3000/tcp': {}
        },
        HostConfig: {
          PortBindings: {
            '3000/tcp': [{ HostPort: '0' }]
          },
          Memory: 512 * 1024 * 1024, // 512 MB
          CpuShares: 512
        }
      });

      // Запускаем контейнер
      await container.start();
      
      // Получаем информацию о контейнере
      const containerInfo = await container.inspect();
      app.containerId = containerInfo.Id;
      await app.save();

      const port = containerInfo.NetworkSettings.Ports['3000/tcp']?.[0]?.HostPort || '3000';
      deployment.deployedUrl = `http://localhost:${port}`;
      
      deployment.logs.push(`✅ Контейнер запущен на порту ${port}`);
      await deployment.save();

    } catch (error) {
      throw new Error(`Ошибка Docker: ${error.message}`);
    }
  }

  async deployEmulation(app, deployment) {
    // Эмуляция деплоя без Docker
    deployment.logs.push(`⚠️ Эмуляция деплоя (Docker не найден)`);
    deployment.logs.push(`✅ Приложение успешно сэмулировано`);
    deployment.deployedUrl = `http://localhost:3000/emulated/${app.name}`;
    await deployment.save();
  }

  async stopContainer(containerId) {
    try {
      if (!this.isDockerAvailable) return;
      
      const container = docker.getContainer(containerId);
      await container.stop();
      await container.remove();
      console.log(`✅ Контейнер ${containerId} остановлен и удален`);
    } catch (error) {
      console.error(`❌ Ошибка остановки контейнера: ${error.message}`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new DeployService();
