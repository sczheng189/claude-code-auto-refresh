import { ScheduleStrategy } from './ScheduleStrategy';
import { ClaudeAgent } from '../agent';
import { ScheduleTask } from '../types';

export class CustomStrategy implements ScheduleStrategy {
  private startHour: number;
  private endHour: number;
  private weekdays: number[];
  private intervalMinutes: number;
  
  constructor(startHour: number, endHour: number, weekdays: number[], intervalMinutes: number = 60) {
    this.startHour = startHour;
    this.endHour = endHour;
    this.weekdays = weekdays;
    this.intervalMinutes = intervalMinutes;
  }
  
  scheduleNextHourTasks(agents: Map<string, ClaudeAgent>, _currentTasks: ScheduleTask[]): ScheduleTask[] {
    const now = new Date();
    
    // 基于间隔计算下次执行时间
    let nextTime = new Date(now.getTime() + this.intervalMinutes * 60 * 1000);
    
    // 寻找下一个合适的工作时间
    let attempts = 0;
    const maxAttempts = 14; // 最多检查两周
    
    while (attempts < maxAttempts) {
      const nextHour = nextTime.getHours();
      const nextWeekday = nextTime.getDay();
      
      // 检查是否在工作时间和工作日
      if (this.isWorkingHour(nextHour) && this.weekdays.includes(nextWeekday)) {
        break; // 找到合适的时间
      }
      
      // 如果不在工作时间，跳到下一个工作时段开始
      if (!this.isWorkingHour(nextHour)) {
        nextTime = this.getNextWorkingHourStart(nextTime);
      } else if (!this.weekdays.includes(nextWeekday)) {
        // 如果不在工作日，跳到下一天
        nextTime.setDate(nextTime.getDate() + 1);
        nextTime.setHours(this.startHour, 0, 0, 0);
      }
      
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      console.log('Unable to find valid working time within 2 weeks, skipping task scheduling');
      return [];
    }

    console.log(`Scheduling tasks for ${nextTime.toLocaleString()} (custom mode, ${this.intervalMinutes} min interval)`);
    
    const newTasks: ScheduleTask[] = [];
    
    agents.forEach((agent, groupId) => {
      const randomMinutes = Math.floor(Math.random() * 5) + 1; // 1-5分钟
      const scheduledTime = new Date(nextTime.getTime() + randomMinutes * 60 * 1000);
      
      const task: ScheduleTask = {
        id: `${groupId}_${scheduledTime.getTime()}_${Math.random().toString(36).substring(2, 8)}`,
        groupId,
        scheduledTime
      };
      
      newTasks.push(task);
      console.log(`Scheduled task for ${groupId} at ${scheduledTime.toLocaleString()} (custom mode)`);
    });
    
    return newTasks;
  }
  
  shouldExecuteTask(_task: ScheduleTask): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    const currentWeekday = now.getDay();
    
    if (!this.isWorkingHour(currentHour)) {
      console.log(`Skipping task execution (outside working hours ${this.startHour}:00-${this.endHour}:00, current: ${currentHour}:00)`);
      return false;
    }
    
    if (!this.weekdays.includes(currentWeekday)) {
      console.log(`Skipping task execution (not a working day, current: ${currentWeekday}, allowed: ${this.weekdays.join(',')})`);
      return false;
    }
    
    return true;
  }
  
  getNextScheduleTime(currentTime: Date): Date | null {
    const nextTime = new Date(currentTime.getTime() + this.intervalMinutes * 60 * 1000);
    
    let attempts = 0;
    const maxAttempts = 14;
    
    while (attempts < maxAttempts) {
      const nextHour = nextTime.getHours();
      const nextWeekday = nextTime.getDay();
      
      if (this.isWorkingHour(nextHour) && this.weekdays.includes(nextWeekday)) {
        return nextTime;
      }
      
      if (!this.isWorkingHour(nextHour)) {
        const adjustedTime = this.getNextWorkingHourStart(nextTime);
        nextTime.setTime(adjustedTime.getTime());
      } else if (!this.weekdays.includes(nextWeekday)) {
        nextTime.setDate(nextTime.getDate() + 1);
        nextTime.setHours(this.startHour, 0, 0, 0);
      }
      
      attempts++;
    }
    
    return null;
  }
  
  private isWorkingHour(hour: number): boolean {
    // 处理完整小时格式，如9:00-18:00
    // startHour=9, endHour=18 表示 9:00 到 18:00（不包含18:00）
    if (this.startHour <= this.endHour) {
      // 正常情况：9:00-18:00 
      return hour >= this.startHour && hour < this.endHour;
    } else {
      // 跨天情况：22:00-6:00
      return hour >= this.startHour || hour < this.endHour;
    }
  }

  private getNextWorkingHourStart(currentTime: Date): Date {
    const nextTime = new Date(currentTime);
    const currentHour = currentTime.getHours();
    
    if (this.startHour <= this.endHour) {
      // 正常情况：如果当前时间在工作时间之前，设置为开始时间
      // 如果在工作时间之后，设置为第二天的开始时间
      if (currentHour < this.startHour) {
        nextTime.setHours(this.startHour, 0, 0, 0);
      } else {
        nextTime.setDate(nextTime.getDate() + 1);
        nextTime.setHours(this.startHour, 0, 0, 0);
      }
    } else {
      // 跨天情况：22:00-6:00
      if (currentHour < this.endHour) {
        // 如果在凌晨时段（如3:00），但不在工作时间内，跳到晚上开始时间
        nextTime.setHours(this.startHour, 0, 0, 0);
      } else if (currentHour < this.startHour) {
        // 如果在白天（如14:00），跳到晚上开始时间
        nextTime.setHours(this.startHour, 0, 0, 0);
      } else {
        // 如果已经在晚上工作时间之后，跳到第二天晚上
        nextTime.setDate(nextTime.getDate() + 1);
        nextTime.setHours(this.startHour, 0, 0, 0);
      }
    }
    
    return nextTime;
  }
}
