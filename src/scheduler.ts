import * as cron from 'node-cron';
import { ClaudeAgent } from './agent';
import { ClaudeGroup, ScheduleTask, ScheduleConfig } from './types';
import { ScheduleStrategy } from './strategies/ScheduleStrategy';
import { HourlyStrategy } from './strategies/HourlyStrategy';
import { CustomStrategy } from './strategies/CustomStrategy';

export class TaskScheduler {
  private agents: Map<string, ClaudeAgent> = new Map();
  private scheduledTasks: ScheduleTask[] = [];
  private strategy: ScheduleStrategy;
  private scheduleConfig: ScheduleConfig;
  
  constructor(groups: ClaudeGroup[], scheduleConfig: ScheduleConfig) {
    // 为每个组创建独立的代理实例
    groups.forEach(group => {
      this.agents.set(group.id, new ClaudeAgent(group));
    });
    
    this.scheduleConfig = scheduleConfig;
    // 根据配置创建相应的调度策略
    this.strategy = this.createStrategy(scheduleConfig);
  }
  
  private createStrategy(config: ScheduleConfig): ScheduleStrategy {
    const intervalMinutes = config.intervalMinutes || 60;
    
    if (config.mode === 'custom') {
      return new CustomStrategy(
        config.customStartHour!,
        config.customEndHour!,
        config.customWeekdays!,
        intervalMinutes
      );
    }
    
    return new HourlyStrategy(intervalMinutes);
  }
  
  start(): void {
    console.log('[SCHEDULER] Starting task scheduler...');
    
    // 首次启动立即发送保活消息
    this.sendInitialKeepAliveMessages().catch(error => {
      console.error('[SCHEDULER] Failed to send initial keep-alive messages:', error);
    });
    
    // 每分钟检查是否需要执行任务
    cron.schedule('* * * * *', () => {
      this.checkAndExecuteTasks().catch(error => {
        console.error('[SCHEDULER] Error in checkAndExecuteTasks:', error);
      });
    }, { timezone: process.env.TZ || 'Asia/Shanghai' });
    
    // 根据配置的间隔时间生成 cron 表达式
    const intervalMinutes = this.scheduleConfig.intervalMinutes || 60;
    let cronExpression: string;
    let scheduleDescription: string;
    
    if (intervalMinutes < 60) {
      // 小于60分钟，使用分钟间隔
      cronExpression = `*/${intervalMinutes} * * * *`;
      scheduleDescription = `every ${intervalMinutes} minutes`;
    } else if (intervalMinutes === 60) {
      // 每小时
      cronExpression = '0 * * * *';
      scheduleDescription = 'every hour';
    } else {
      // 大于60分钟，转换为小时间隔
      const hours = Math.floor(intervalMinutes / 60);
      if (intervalMinutes % 60 === 0) {
        // 整小时间隔
        cronExpression = `0 */${hours} * * *`;
        scheduleDescription = `every ${hours} hour(s)`;
      } else {
        // 非整小时，仍使用分钟间隔（cron 会自动处理）
        cronExpression = `*/${intervalMinutes} * * * *`;
        scheduleDescription = `every ${intervalMinutes} minutes`;
      }
    }
    
    console.log(`[SCHEDULER] Task scheduling configured: ${scheduleDescription} (${cronExpression})`);
    
    // 按配置的间隔安排下一批任务
    cron.schedule(cronExpression, () => {
      try {
        console.log(`[SCHEDULER] Interval scheduling trigger at ${new Date().toLocaleString()} (${scheduleDescription})`);
        this.scheduleNextHourTasks();
      } catch (error) {
        console.error('[SCHEDULER] Error in scheduleNextHourTasks:', error);
      }
    }, { timezone: process.env.TZ || 'Asia/Shanghai' });
    
    // 初始化：为当前时段安排任务
    try {
      this.scheduleNextHourTasks();
      console.log('[SCHEDULER] Initial task scheduling completed');
    } catch (error) {
      console.error('[SCHEDULER] Failed to schedule initial tasks:', error);
    }
  }
  
  private scheduleNextHourTasks(): void {
    const now = new Date();
    
    // 清理过期的任务
    const cutoffTime = new Date(now.getTime() - 5 * 60 * 1000); // 5分钟前
    this.scheduledTasks = this.scheduledTasks.filter(task => task.scheduledTime > cutoffTime);
    
    // 计算下一个调度周期的时间
    const nextScheduleTime = this.strategy.getNextScheduleTime(now);
    if (!nextScheduleTime) {
      console.log('[SCHEDULER] No valid next schedule time found');
      return;
    }
    
    // 检查是否已为此调度周期创建任务（10分钟时间窗口）
    const tasksForSameSchedule = this.scheduledTasks.filter(task => {
      const timeDiff = Math.abs(task.scheduledTime.getTime() - nextScheduleTime.getTime());
      return timeDiff <= 10 * 60 * 1000; // 10分钟内认为是同一调度周期
    });
    
    if (tasksForSameSchedule.length > 0) {
      console.log(`[SCHEDULER] Tasks already scheduled for ${nextScheduleTime.toLocaleString()}, skipping (existing: ${tasksForSameSchedule.length})`);
      return;
    }
    
    // 使用策略生成新任务
    const newTasks = this.strategy.scheduleNextHourTasks(this.agents, this.scheduledTasks);
    this.scheduledTasks.push(...newTasks);
    
    console.log(`[SCHEDULER] Created ${newTasks.length} new tasks for ${nextScheduleTime.toLocaleString()}`);
  }
  
  private async checkAndExecuteTasks(): Promise<void> {
    const now = new Date();
    const tasksToExecute = this.scheduledTasks.filter(task =>
      task.scheduledTime <= now && this.strategy.shouldExecuteTask(task)
    );
    
    if (tasksToExecute.length === 0) {
      return;
    }
    
    console.log(`[SCHEDULER] Executing ${tasksToExecute.length} scheduled tasks at ${now.toLocaleString()}`);
    
    try {
      // 并行执行所有到期的任务
      const promises = tasksToExecute.map(async (task) => {
        const agent = this.agents.get(task.groupId);
        if (agent) {
          try {
            console.log(`[SCHEDULER] Executing task ${task.id} for ${task.groupId}`);
            const success = await agent.sendKeepAliveMessage();
            if (!success) {
              console.warn(`[SCHEDULER] Task ${task.id} returned false, but will be marked as completed`);
            }
          } catch (error) {
            console.error(`[SCHEDULER] Failed to execute task ${task.id}:`, error);
            // 即使失败也移除任务，避免重复执行失败的任务
          }
        } else {
          console.error(`[SCHEDULER] No agent found for task ${task.id} with groupId ${task.groupId}`);
        }
      });
      
      await Promise.all(promises);
    } catch (error) {
      console.error('[SCHEDULER] Critical error during task execution:', error);
    } finally {
      // 无论执行成功还是失败，都移除已处理的任务，防止死循环
      this.scheduledTasks = this.scheduledTasks.filter(task =>
        !tasksToExecute.includes(task)
      );
      
      console.log(`[SCHEDULER] Completed ${tasksToExecute.length} tasks. Remaining tasks: ${this.scheduledTasks.length}`);
    }
  }
  
  private async sendInitialKeepAliveMessages(): Promise<void> {
    console.log('Sending initial keep-alive messages for all groups...');
    
    const promises = Array.from(this.agents.entries()).map(async ([groupId, agent]) => {
      try {
        console.log(`[INITIAL] Sending keep-alive message for ${groupId}...`);
        await agent.sendKeepAliveMessage();
      } catch (error) {
        console.error(`[INITIAL] Failed to send keep-alive message for ${groupId}:`, error);
      }
    });
    
    await Promise.all(promises);
    console.log('Initial keep-alive messages completed.');
  }
  
  getScheduledTasks(): ScheduleTask[] {
    return [...this.scheduledTasks];
  }
}
