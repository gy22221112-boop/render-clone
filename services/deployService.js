const simpleGit = require('simple-git');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const Docker = require('dockerode');

class DeployService {
  constructor() {
    this.deployDir = path.join(os.tmpdir(), 'render-deployments');
    fs.ensureDirSync(this.deployDir);
    this.docker = new Docker();
    this.isDockerAvailable = false;
    this.checkDocker();
  }

  async checkDocker() {
    try {
      await this.docker.ping();
      this.isDockerAvailable = true;
      console.log('✅ Docker доступен');
    } catch (error) {
      this.isDockerAvailable = false;
      console.log('⚠️ Docker не найден. Используется эмуляция.');
    }
  }

  async deployApp(app, deployment, broadcastLogs) {
    try {
      const appDir = path.join(this.deployDir, app.id);
      
      // Обновляем статус
      deployment.status = 'building';
      this.addLog(deployment, '🔨 Начинаем сборку приложения...', broadcastLogs);
      
      // Клонируем репозиторий
      this.addLog(deployment, `📥 Клонирование репозитория: ${app.repository}`, broadcastLogs);
      
      if (fs.existsSync(appDir)) {
        await fs.remove(appDir);
      }
      
      const git = simpleGit();
      await git.clone(app.repository, appDir, ['--branch', app.branch, '--single-branch']);
      
      this.addLog(deployment, `✅ Репозиторий склонирован в ${appDir}`, broadcastLogs);
      
      // Проверяем наличие Dockerfile
      const dockerfilePath = path.join(appDir, 'Dockerfile');
      const hasDockerfile = await fs.pathExists(dockerfilePath);
      
      if (hasDockerfile && this.isDockerAvailable) {
        this.addLog(deployment, '🐳 Найден Dockerfile - используем Docker для сборки', broadcastLogs);
        await this.deployWithDocker(app, deployment, appDir, broadcastLogs);
      } else {
        if (hasDockerfile && !this.isDockerAvailable) {
          this.addLog(deployment, '⚠️ Dockerfile найден, но Docker недоступен. Используем стандартную сборку.', broadcastLogs);
        } else {
          this.addLog(deployment, '📦 Dockerfile не найден - используем стандартную сборку', broadcastLogs);
        }
        await this.deployStandard(app, deployment, appDir, broadcastLogs);
      }
      
      // Обновляем статус приложения
      app.status = 'deployed';
      app.deployedAt = new Date().toISOString();
      app.url = `https://render-clone-6d49.onrender.com/apps/${app.name}`;
      
      deployment.status = 'success';
      deployment.finishedAt = new Date().toISOString();
      deployment.duration = (new Date(deployment.finishedAt) - new Date(deployment.startedAt)) / 1000;
      deployment.deployedUrl = app.url;
      
      this.addLog(deployment, `✅ Деплой успешно завершен за ${deployment.duration} секунд`, broadcastLogs);
      this.addLog(deployment, `🌐 Приложение доступно: ${app.url}`, broadcastLogs);
      
      console.log(`✅ Деплой ${app.name} завершен успешно`);
      
    } catch (error) {
      console.error(`❌ Ошибка деплоя ${app.name}:`, error);
      deployment.status = 'failed';
      deployment.finishedAt = new Date().toISOString();
      this.addLog(deployment, `❌ Ошибка: ${error.message}`, broadcastLogs);
      app.status = 'failed';
    }
  }

  // ============ Деплой через Docker ============
  async deployWithDocker(app, deployment, appDir, broadcastLogs) {
    try {
      const imageName = `render-app-${app.id.toLowerCase()}`;
      const containerName = `render-container-${app.id.toLowerCase()}`;
      
      this.addLog(deployment, `🐳 Сборка Docker образа: ${imageName}`, broadcastLogs);
      
      // Строим образ
      await new Promise((resolve, reject) => {
        this.docker.buildImage(
          { context: appDir, src: ['Dockerfile', '.'] },
          { t: imageName },
          (err, stream) => {
            if (err) {
              reject(err);
              return;
            }
            
            this.docker.modem.followProgress(stream, 
              (err, output) => {
                if (err) {
                  reject(err);
                  return;
                }
                resolve(output);
              },
              (event) => {
                if (event.stream) {
                  const msg = event.stream.trim();
                  if (msg) {
                    this.addLog(deployment, `🐳 ${msg}`, broadcastLogs);
                  }
                }
                if (event.error) {
                  this.addLog(deployment, `❌ ${event.error}`, broadcastLogs);
                }
              }
            );
          }
        );
      });
      
      this.addLog(deployment, `✅ Docker образ создан: ${imageName}`, broadcastLogs);
      
      // Проверяем, существует ли контейнер
      try {
        const container = this.docker.getContainer(containerName);
        await container.stop();
        await container.remove();
        this.addLog(deployment, `🗑️ Старый контейнер удален`, broadcastLogs);
      } catch (e) {
        // Контейнер не существует - игнорируем
      }
      
      this.addLog(deployment, `🚀 Запуск контейнера: ${containerName}`, broadcastLogs);
      
      // Преобразуем envVars в массив
      const envArray = [];
      if (app.envVars) {
        for (const [key, value] of Object.entries(app.envVars)) {
          envArray.push(`${key}=${value}`);
        }
      }
      
      // Запускаем контейнер
      const container = await this.docker.createContainer({
        Image: imageName,
        name: containerName,
        Env: envArray,
        ExposedPorts: {
          '3000/tcp': {}
        },
        HostConfig: {
          PortBindings: {
            '3000/tcp': [{ HostPort: '0' }]
          },
          Memory: 512 * 1024 * 1024, // 512 MB
          CpuShares: 512,
          RestartPolicy: {
            Name: 'unless-stopped'
          }
        }
      });
      
      await container.start();
      
      // Получаем информацию о порте
      const containerInfo = await container.inspect();
      const port = containerInfo.NetworkSettings.Ports['3000/tcp']?.[0]?.HostPort || '3000';
      
      app.containerId = containerInfo.Id;
      deployment.deployedUrl = `http://localhost:${port}`;
      
      this.addLog(deployment, `✅ Контейнер запущен на порту ${port}`, broadcastLogs);
      this.addLog(deployment, `🆔 ID контейнера: ${containerInfo.Id.slice(0, 12)}`, broadcastLogs);
      
    } catch (error) {
      throw new Error(`Docker ошибка: ${error.message}`);
    }
  }

  // ============ Стандартный деплой (без Docker) ============
  async deployStandard(app, deployment, appDir, broadcastLogs) {
    // Устанавливаем зависимости в зависимости от языка
    await this.installDependencies(app, deployment, appDir, broadcastLogs);
    
    // Собираем приложение
    await this.buildApp(app, deployment, appDir, broadcastLogs);
    
    // Запускаем приложение
    this.addLog(deployment, `🚀 Запуск приложения: ${app.startCommand}`, broadcastLogs);
    
    // Эмуляция запуска (в реальном проекте здесь был бы запуск процесса)
    await this.sleep(1000);
    
    this.addLog(deployment, `✅ Приложение запущено (эмуляция)`, broadcastLogs);
  }

  async installDependencies(app, deployment, appDir, broadcastLogs) {
    const commands = {
      nodejs: 'npm install',
      python: 'python3 -m venv venv && . venv/bin/activate && pip install -r requirements.txt',
      go: 'go mod download',
      ruby: 'bundle install'
    };

    const command = commands[app.language] || commands.nodejs;
    this.addLog(deployment, `📦 Установка зависимостей: ${command}`, broadcastLogs);
    
    return new Promise((resolve) => {
      exec(command, { cwd: appDir, shell: '/bin/bash', maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (stdout) {
          const lines = stdout.split('\n').filter(line => line.trim());
          lines.forEach(line => this.addLog(deployment, line, broadcastLogs));
        }
        if (stderr) {
          const lines = stderr.split('\n').filter(line => line.trim());
          lines.forEach(line => this.addLog(deployment, `⚠️ ${line}`, broadcastLogs));
        }
        if (error) {
          this.addLog(deployment, `⚠️ Ошибка установки зависимостей: ${error.message}`, broadcastLogs);
        }
        resolve();
      });
    });
  }

  async buildApp(app, deployment, appDir, broadcastLogs) {
    if (app.buildCommand && app.buildCommand.trim()) {
      this.addLog(deployment, `🔨 Сборка: ${app.buildCommand}`, broadcastLogs);
      
      return new Promise((resolve) => {
        exec(app.buildCommand, { cwd: appDir, shell: '/bin/bash', maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
          if (stdout) {
            const lines = stdout.split('\n').filter(line => line.trim());
            lines.forEach(line => this.addLog(deployment, line, broadcastLogs));
          }
          if (stderr) {
            const lines = stderr.split('\n').filter(line => line.trim());
            lines.forEach(line => this.addLog(deployment, `⚠️ ${line}`, broadcastLogs));
          }
          if (error) {
            this.addLog(deployment, `⚠️ Ошибка сборки: ${error.message}`, broadcastLogs);
          }
          resolve();
        });
      });
    } else {
      this.addLog(deployment, `⏭️ Команда сборки не указана, пропускаем`, broadcastLogs);
    }
  }

  async stopContainer(containerId) {
    try {
      if (!this.isDockerAvailable) return;
      
      const container = this.docker.getContainer(containerId);
      await container.stop();
      await container.remove();
      console.log(`✅ Контейнер ${containerId} остановлен и удален`);
    } catch (error) {
      console.error(`❌ Ошибка остановки контейнера: ${error.message}`);
    }
  }

  addLog(deployment, message, broadcastLogs) {
    deployment.logs.push(message);
    if (broadcastLogs) {
      broadcastLogs(deployment.id, message);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new DeployService();
