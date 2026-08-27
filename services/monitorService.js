const os = require('os');
const osUtils = require('os-utils');

class MonitorService {
  constructor() {
    this.stats = {
      cpu: 0,
      memory: 0,
      uptime: 0,
      processes: []
    };
  }

  startMonitoring(storage) {
    setInterval(() => {
      // CPU
      osUtils.cpuUsage((cpu) => {
        this.stats.cpu = Math.round(cpu * 100);
      });
      
      // Memory
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      this.stats.memory = Math.round(((totalMem - freeMem) / totalMem) * 100);
      
      // Uptime
      this.stats.uptime = Math.floor(os.uptime() / 60); // minutes
      
      // Сохраняем в storage
      if (storage) {
        storage.resources = {
          cpu: this.stats.cpu,
          memory: this.stats.memory,
          uptime: this.stats.uptime
        };
      }
      
    }, 5000); // Каждые 5 секунд
  }

  getStats() {
    return this.stats;
  }
}

module.exports = new MonitorService();
