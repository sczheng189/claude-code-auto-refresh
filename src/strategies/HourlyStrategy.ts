import { ScheduleStrategy } from './ScheduleStrategy';
import { ClaudeAgent } from '../agent';
import { ScheduleTask } from '../types';

export class HourlyStrategy implements ScheduleStrategy {
  private intervalMinutes: number;

  constructor(intervalMinutes: number = 60) {
    this.intervalMinutes = intervalMinutes;
  }

  scheduleNextHourTasks(agents: Map<string, ClaudeAgent>, _currentTasks: ScheduleTask[]): ScheduleTask[] {
    const now = new Date();
    
    // 基于间隔计算下次执行时间
    const nextTime = new Date(now.getTime() + this.intervalMinutes * 60 * 1000);
    
    console.log(`Scheduling tasks for ${nextTime.toLocaleString()} (${this.intervalMinutes} min interval)`);
    
    const newTasks: ScheduleTask[] = [];
    
    agents.forEach((agent, groupId) => {
      const randomMinutes = Math.floor(Math.random() * 5) + 1; // 1-5分钟
      const scheduledTime = new Date(nextTime.getTime() + randomMinutes * 60 * 1000);
      
      // 确保任务时间不会在过去
      if (scheduledTime <= now) {
        scheduledTime.setTime(now.getTime() + (this.intervalMinutes + randomMinutes) * 60 * 1000);
      }
      
      const task: ScheduleTask = {
        id: `${groupId}_${scheduledTime.getTime()}_${Math.random().toString(36).substring(2, 8)}`,
        groupId,
        scheduledTime
      };
      
      newTasks.push(task);
      console.log(`Scheduled task for ${groupId} at ${scheduledTime.toLocaleString()}`);
    });
    
    return newTasks;
  }
  
  shouldExecuteTask(_task: ScheduleTask): boolean {
    return true;
  }
  
  getNextScheduleTime(currentTime: Date): Date | null {
    return new Date(currentTime.getTime() + this.intervalMinutes * 60 * 1000);
  }
}