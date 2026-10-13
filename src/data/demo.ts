import type { Schedule, Period } from '../domain/schedule'
export const demoPeriods: Period[] = [
  ['08:30','09:15'],['09:20','10:05'],['10:25','11:10'],['11:15','12:00'],
  ['13:30','14:15'],['14:20','15:05'],['15:25','16:10'],['16:15','17:00'],
  ['17:05','17:50'],['18:30','19:15'],['19:20','20:05'],['20:15','21:00'],
  ['21:05','21:50'],
].map(([start,end], i) => ({ section: i + 1, start, end }))
const weeks = Array.from({ length: 16 }, (_, i) => i + 1)
export const demoSchedule: Schedule = {
  version: 1,
  semester: { id:'demo-2026-autumn', name:'2026 秋季学期', monday:'2026-08-31', weeks:20, campus:'雁栖湖校区', confirmed:false },
  courses: [
    { id:'math', name:'矩阵分析', teacher:'示例教师 · 陈老师', isDegreeCourse:true, exam:'闭卷笔试', color:'blue', origin:'demo' },
    { id:'english', name:'硕士学位英语', teacher:'示例教师 · 李老师', isDegreeCourse:true, exam:'闭卷笔试', color:'teal', origin:'demo' },
    { id:'ml', name:'机器学习', teacher:'示例教师 · 王老师', isDegreeCourse:true, exam:'开卷考试', color:'purple', origin:'demo' },
    { id:'politics', name:'新时代中国特色社会主义理论与实践', teacher:'示例教师 · 张老师', isDegreeCourse:false, exam:'课程论文', color:'apricot', origin:'demo' },
    { id:'science', name:'科学计算', teacher:'示例教师 · 周老师', isDegreeCourse:true, exam:'闭卷笔试', color:'blue', origin:'demo' },
    { id:'writing', name:'学术道德与学术写作规范', teacher:'示例教师 · 刘老师', isDegreeCourse:false, exam:'读书报告', color:'teal', origin:'demo' },
  ],
  meetings: [
    { id:'m1', courseId:'math', day:1, sections:[1,2], weeks, location:'教一楼 201' },
    { id:'m2', courseId:'english', day:2, sections:[3,4], weeks, location:'教二楼 105' },
    { id:'m3', courseId:'ml', day:3, sections:[1,2,3], weeks, location:'教一楼 208' },
    { id:'m4', courseId:'politics', day:4, sections:[5,6,7], weeks:weeks.slice(0,12), location:'教一楼 101' },
    { id:'m5', courseId:'math', day:5, sections:[3,4], weeks, location:'教一楼 201' },
    { id:'m6', courseId:'science', day:1, sections:[5,6,7], weeks:weeks.filter(n=>n%2===1), location:'教二楼 203' },
    { id:'m7', courseId:'ml', day:2, sections:[7,8], weeks, location:'教一楼 208' },
    { id:'m8', courseId:'writing', day:3, sections:[5,6], weeks:weeks.slice(0,8), location:'教一楼 107' },
    { id:'m9', courseId:'english', day:5, sections:[7,8], weeks, location:'教二楼 105' },
    { id:'m10', courseId:'writing', day:4, sections:[9,10], weeks:[1,3,5,7], location:'教一楼 107' },
  ], periods:demoPeriods,
}
export type Scenario = 'normal' | 'dense' | 'conflict' | 'empty'
export function makeDemo(scenario: Scenario): Schedule {
  const value = JSON.parse(JSON.stringify(demoSchedule)) as Schedule
  if (scenario === 'empty') { value.courses = []; value.meetings = [] }
  if (scenario === 'conflict') value.meetings.push({ id:'conflict-1', courseId:'writing', day:1, sections:[2,3], weeks, location:'教二楼 302' })
  if (scenario === 'dense') {
    for (let day = 1; day <= 7; day++) for (const start of [1,5,9]) {
      if (!value.meetings.some(m => m.day === day && m.sections.some(s => s >= start && s <= start + 2))) value.meetings.push({ id:`dense-${day}-${start}`, courseId:value.courses[(day+start)%6].id, day, sections:[start,start+1], weeks, location:'教一楼 209' })
    }
  }
  return value
}
