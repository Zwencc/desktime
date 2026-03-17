// Minimal typings for the subset of lunar-javascript DeskTime uses.
declare module 'lunar-javascript' {
  export interface Lunar {
    getMonthInChinese(): string
    getDayInChinese(): string
    getJieQi(): string
    getFestivals(): string[]
    getYearShengXiao(): string
    getYearInGanZhi(): string
  }

  export interface Solar {
    getLunar(): Lunar
    getFestivals(): string[]
  }

  export const Solar: {
    fromDate(date: Date): Solar
  }

  export interface Holiday {
    getName(): string
    isWork(): boolean
    getTarget(): string
  }

  export const HolidayUtil: {
    getHoliday(ymd: string): Holiday | null
  }
}
