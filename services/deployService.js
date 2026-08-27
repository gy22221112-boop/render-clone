const simpleGit = require('simple-git');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

class DeployService {
  constructor() {
    this.deployDir = path.join(os.tmpdir(), 'render-deployments');
    fs.ensureDirSync(this.deployDir);
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
      
      // Устанавливаем зависимости в зависимости от языка
      await this.installDependencies(app, deployment, appDir, broadcastLogs);
      
      // Собираем приложение
      await this.buildApp(app, deployment, appDir, broadcastLogs);
      
      // Запускаем приложение (имитация)
      this.addLog(deployment, `🚀 Запуск приложения: ${app.startCommand}`, broadcastLogs);
      
      // Обновляем статус
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

  async installDependencies(app, deployment, appDir, broadcastLogs) {
    const commands = {
      nodejs: 'npm install',
      python: 'pip install -r requirements.txt',
      go: 'go mod download',
      ruby: 'bundle install'
    };

    const command = commands[app.language] || commands.nodejs;
    this.addLog(deployment, `📦 Установка зависимостей: ${command}`, broadcastLogs);
    
    return new Promise((resolve) => {
      exec(command, { cwd: appDir }, (error, stdout, stderr) => {
        if (stdout) this.addLog(deployment, stdout, broadcastLogs);
        if (stderr) this.addLog(deployment, stderr, broadcastLogs);
        if (error) {
          this.addLog(deployment, `⚠️ Ошибка установки зависимостей: ${error.message}`, broadcastLogs);
        }
        resolve();
      });
    });
  }

  async buildApp(app, deployment, appDir, broadcastLogs) {
    if (app.buildCommand) {
      this.addLog(deployment, `🔨 Сборка: ${app.buildCommand}`, broadcastLogs);
      
      return new Promise((resolve) => {
        exec(app.buildCommand, { cwd: appDir }, (error, stdout, stderr) => {
          if (stdout) this.addLog(deployment, stdout, broadcastLogs);
          if (stderr) this.addLog(deployment, stderr, broadcastLogs);
          if (error) {
            this.addLog(deployment, `⚠️ Ошибка сборки: ${error.message}`, broadcastLogs);
          }
          resolve();
        });
      });
    }
  }

  addLog(deployment, message, broadcastLogs) {
    deployment.logs.push(message);
    if (broadcastLogs) {
      broadcastLogs(deployment.id, message);
    }
  }
}

module.exports = new DeployService();
