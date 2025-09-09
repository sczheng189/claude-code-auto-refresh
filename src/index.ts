import { loadConfig } from './config';
import { TaskScheduler } from './scheduler';

async function main() {
  console.log('Claude Code Auto Refresh Agent Starting...');
  
  try {
    // 加载配置
    const config = loadConfig();
    console.log(`Initialized with ${config.groups.length} Claude groups`);
    
    // 创建任务调度器
    const scheduler = new TaskScheduler(config.groups, config.schedule);
    
    // 启动调度器
    scheduler.start();
    
    console.log('Agent is running. Press Ctrl+C to stop.');
    
    // 每2小时输出一次当前调度状态，减少日志冗余
    setInterval(() => {
      const tasks = scheduler.getScheduledTasks();
      console.log(`[MONITOR] Scheduled tasks: ${tasks.length}`);
      if (tasks.length > 0) {
        tasks.forEach(task => {
          console.log(`  - ${task.groupId}: ${task.scheduledTime.toLocaleString()}`);
        });
      }
    }, 2 * 60 * 60 * 1000);
    
    // 保持进程运行
    process.on('SIGINT', () => {
      console.log('\nShutting down gracefully...');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start agent:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});