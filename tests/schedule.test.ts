import { describe, expect, it } from 'vitest'
import { chinaDate, compactNumbers, dateAt, hasTileConflict, layoutTiles, parseNumbers, teachingWeek, tilesForWeek } from '../src/domain/schedule'
import { demoPeriods, makeDemo } from '../src/data/demo'
import { buildScheduleFromUcasImport, createUcasCourseMetaExtractionScript, createUcasExtractionScript, detailOriginForCoursePage, isUcasCourseDetailUrl, isUcasCourseSiteUrl, isUcasCourseUrl, mergeUcasCourseMetadata, mergeUcasImportedCourses, UCAS_COURSE_ALTERNATE_DETAIL_ORIGIN, UCAS_COURSE_DETAIL_ORIGIN, UCAS_COURSE_MAIN_URL, UCAS_IMPORT_KIND, UCAS_IMPORT_VERSION, UCAS_PERSON_SCHEDULE_URL, UCAS_SEP_LOGIN_URL, UCAS_SELECTED_COURSE_URL, validateUcasCourseMeta, validateUcasDetailLinks, validateUcasImportPayload } from '../src/import/ucas'

describe('周次和节次', () => {
  it('保留范围、跳周和单双周', () => {
    expect(parseNumbers('第1-8、10、12周', 20)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 10, 12])
    expect(parseNumbers('1-8周(单)', 20)).toEqual([1, 3, 5, 7])
    expect(parseNumbers('2-8（双）', 20)).toEqual([2, 4, 6, 8])
    expect(parseNumbers('第1、2、5节', 12)).toEqual([1, 2, 5])
  })
  it('拒绝越界、倒序和不可识别的输入', () => {
    for (const input of ['0', '21', '8-1', '1-4abc', '', '1,,2', '1-8单双']) expect(() => parseNumbers(input, 20)).toThrow()
  })
  it('周次显示不把间断范围连在一起', () => expect(compactNumbers([1, 2, 4, 6, 7, 8])).toBe('1–2、4、6–8'))
})

describe('日期按中国时区计算', () => {
  it('开学前不伪造本周课表', () => expect(teachingWeek('2026-09-07', new Date('2026-09-06T18:00:00+08:00'))).toBe(0))
  it('教学周在中国周一零点切换', () => {
    expect(teachingWeek('2026-09-07', new Date('2026-09-13T15:59:59Z'))).toBe(1)
    expect(teachingWeek('2026-09-07', new Date('2026-09-13T16:00:00Z'))).toBe(2)
  })
  it('跨年日期正确', () => expect(chinaDate(dateAt('2026-12-28', 2, 1))).toBe('2027-01-04'))
})

describe('课表展示不能漏课', () => {
  it('单周课程不会出现在双周', () => {
    expect(tilesForWeek(makeDemo('normal'), 1).some(t => t.course.id === 'science')).toBe(true)
    expect(tilesForWeek(makeDemo('normal'), 2).some(t => t.course.id === 'science')).toBe(false)
  })
  it('同一门课多个安排分别保留', () => expect(tilesForWeek(makeDemo('normal'), 1).filter(t => t.course.id === 'math')).toHaveLength(2))
  it('不连续节次不占用中间空白', () => {
    const data = makeDemo('normal'); data.meetings = [{ ...data.meetings[0], sections: [1, 2, 5] }]
    expect(tilesForWeek(data, 1).map(t => [t.start, t.end])).toEqual([[1, 2], [5, 5]])
  })
  it('同名课程不显示为冲突，其他课程仍保留冲突提示', () => {
    const data = makeDemo('normal')
    const sameName = { ...data.courses.find(course => course.id === 'math')!, id: 'math-other' }
    data.courses.push(sameName); data.meetings.push({ id: 'math-other-meeting', courseId: 'math-other', day: 1, sections: [1, 2], weeks: [1], location: '教一楼 201' })
    const group = layoutTiles(tilesForWeek(data, 1)).find(item => item.day === 1 && item.start === 1)!
    expect(hasTileConflict(group.tiles)).toBe(false)
    const different = { ...data.courses.find(course => course.id === 'writing')!, id: 'different-name', name: '另一门课程' }
    data.courses.push(different); data.meetings.push({ id: 'different-meeting', courseId: 'different-name', day: 1, sections: [1, 2], weeks: [1], location: '教二楼 302' })
    expect(hasTileConflict(layoutTiles(tilesForWeek(data, 1)).find(item => item.day === 1 && item.start === 1)!.tiles)).toBe(true)
  })
})

describe('国科大作息', () => {
  it('使用截图中的 13 节上课时间', () => expect(demoPeriods).toEqual([
    { section: 1, start: '08:30', end: '09:15' }, { section: 2, start: '09:20', end: '10:05' }, { section: 3, start: '10:25', end: '11:10' }, { section: 4, start: '11:15', end: '12:00' },
    { section: 5, start: '13:30', end: '14:15' }, { section: 6, start: '14:20', end: '15:05' }, { section: 7, start: '15:25', end: '16:10' }, { section: 8, start: '16:15', end: '17:00' },
    { section: 9, start: '17:05', end: '17:50' }, { section: 10, start: '18:30', end: '19:15' }, { section: 11, start: '19:20', end: '20:05' }, { section: 12, start: '20:15', end: '21:00' }, { section: 13, start: '21:05', end: '21:50' },
  ]))
})

describe('选修课程元数据导入', () => {
  const completePayload = { kind: UCAS_IMPORT_KIND, version: UCAS_IMPORT_VERSION, status: 'complete' as const, courses: [{ name: '数值分析', teacher: '张老师', meetings: [{ day: 1, sections: [2, 1, 2], weeks: [1, 2, 3], location: '教一楼 201' }] }], failures: ['一门课程读取失败'] }

  it('验证安排并保留失败清单', () => {
    const result = validateUcasImportPayload(completePayload)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.courses[0].meetings[0].sections).toEqual([1, 2])
    expect(result.value.failures).toContain('一门课程读取失败')
  })
  it('只允许精确的 UCAS 来源', () => {
    expect(isUcasCourseUrl(UCAS_COURSE_MAIN_URL)).toBe(true)
    expect(isUcasCourseUrl(UCAS_PERSON_SCHEDULE_URL)).toBe(true)
    expect(isUcasCourseUrl('https://xkgodj.ucas.ac.cn/course/personSchedule')).toBe(true)
    expect(isUcasCourseUrl(UCAS_SELECTED_COURSE_URL)).toBe(true)
    expect(isUcasCourseUrl(UCAS_SEP_LOGIN_URL)).toBe(false)
    expect(isUcasCourseUrl(`${UCAS_COURSE_DETAIL_ORIGIN}/course/termSchedule`)).toBe(false)
    expect(isUcasCourseUrl('https://jwxk.ucas.ac.cn.evil.example/courseManage/main')).toBe(false)
    expect(isUcasCourseDetailUrl(`${UCAS_COURSE_DETAIL_ORIGIN}/course/coursetime/314218`)).toBe(true)
    expect(isUcasCourseDetailUrl(`${UCAS_COURSE_ALTERNATE_DETAIL_ORIGIN}/course/coursetime/314218`)).toBe(true)
    expect(detailOriginForCoursePage('https://xkgodj.ucas.ac.cn/course/personSchedule')).toBe(UCAS_COURSE_ALTERNATE_DETAIL_ORIGIN)
    expect(detailOriginForCoursePage(UCAS_PERSON_SCHEDULE_URL)).toBe(UCAS_COURSE_DETAIL_ORIGIN)
    expect(isUcasCourseSiteUrl('https://xkgo.ucas.ac.cn:3000/#/course/personSchedule')).toBe(true)
    expect(isUcasCourseSiteUrl('https://xkgo.ucas.ac.cn:3000/courseManage/new-term-route')).toBe(true)
    expect(isUcasCourseSiteUrl('https://xkgodj.ucas.ac.cn/courseManage/new-term-route')).toBe(true)
    expect(isUcasCourseSiteUrl('https://xkgodj.ucas.ac.cn.evil.example/course/personSchedule')).toBe(false)
    expect(isUcasCourseSiteUrl('https://xkgo.ucas.ac.cn.evil.example:3000/course/personSchedule')).toBe(false)
    expect(isUcasCourseSiteUrl(UCAS_SEP_LOGIN_URL)).toBe(false)
  })
  it('严格校验课程详情链接并去重', () => {
    const detailUrl = `${UCAS_COURSE_DETAIL_ORIGIN}/course/coursetime/314218`
    expect(validateUcasDetailLinks([{ url: detailUrl, label: '自然语言处理' }, { url: detailUrl, label: '重复' }, { url: 'https://evil.example/course/coursetime/314218', label: '错误' }])).toEqual([{ url: detailUrl, label: '自然语言处理' }])
    expect(validateUcasDetailLinks([{ url: `${UCAS_COURSE_ALTERNATE_DETAIL_ORIGIN}/course/coursetime/314218`, label: '新教务详情' }])).toEqual([{ url: `${UCAS_COURSE_ALTERNATE_DETAIL_ORIGIN}/course/coursetime/314218`, label: '新教务详情' }])
  })
  it('合并同一课程多个上课安排，并优先真实地点', () => {
    const courses = mergeUcasImportedCourses([
      { name: '自然语言处理', teacher: '教师待确认', meetings: [{ day: 1, sections: [5, 6, 7], weeks: [2, 3], location: '地点待确认' }] },
      { name: '自然语言处理', teacher: '王老师', meetings: [{ day: 3, sections: [1, 2], weeks: [4, 5], location: '教二楼105' }] },
      { name: '自然语言处理', teacher: '王老师', meetings: [{ day: 1, sections: [5, 6, 7], weeks: [2, 3], location: '教二楼104' }] },
    ])
    expect(courses[0].teacher).toBe('王老师')
    expect(courses[0].meetings).toHaveLength(2)
    expect(courses[0].meetings[0].location).toBe('教二楼104')
  })
  it('按代码区分同名课程，代码缺失时只在名称唯一时合并', () => {
    const input = [{ name: '生成式模型与科学智能', code: 'CODE-A', teacher: '教师待确认', meetings: [{ day: 1, sections: [1], weeks: [1], location: '教一楼101' }] }]
    const merged = mergeUcasCourseMetadata(input, [
      { name: '生成式模型与科学智能', code: 'CODE-A', teacher: '甲老师', isDegreeCourse: true, exam: '闭卷笔试' },
      { name: '生成式模型与科学智能', code: 'CODE-B', teacher: '乙老师', isDegreeCourse: false, exam: '课程论文' },
    ])
    expect(merged).toHaveLength(2)
    expect(merged.find(course => course.code === 'CODE-A')).toMatchObject({ teacher: '甲老师', isDegreeCourse: true, exam: '闭卷笔试' })
    expect(merged.find(course => course.code === 'CODE-B')).toMatchObject({ teacher: '乙老师', isDegreeCourse: false, exam: '课程论文', meetings: [] })
  })
  it('详情缺少课程代码时，名称唯一才回填选修表元数据', () => {
    const merged = mergeUcasCourseMetadata([
      { name: '自然语言处理', teacher: '教师待确认', meetings: [{ day: 1, sections: [5], weeks: [1], location: '教二楼104' }] },
    ], [{ name: '自然语言处理', code: '180080608120PX003H', teacher: '甲老师', isDegreeCourse: true, exam: '闭卷笔试' }])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ code: '180080608120PX003H', teacher: '甲老师', isDegreeCourse: true, exam: '闭卷笔试' })
  })
  it('解析学位课的真假值和缺失项目', () => {
    expect(validateUcasCourseMeta([{ name: 'A', teacher: '教师待确认', isDegreeCourse: '否' }, { name: 'B', isDegreeCourse: true }])).toEqual([{ name: 'A', isDegreeCourse: false }, { name: 'B', isDegreeCourse: true }])
  })
  it('保存课程元数据到离线课表', () => {
    const result = validateUcasImportPayload(completePayload)
    if (!result.ok) throw new Error(result.message)
    const value = mergeUcasCourseMetadata(result.value.courses, [{ name: '数值分析', teacher: '张老师', isDegreeCourse: true, exam: '闭卷笔试' }, { name: '没有安排的选修课', teacher: '李老师', isDegreeCourse: false, exam: '课程论文' }])
    const schedule = buildScheduleFromUcasImport({ courses: value, failures: [] }, { monday: '2026-08-31', semesterName: '2026 秋季学期', semesterWeeks: 20, campus: '雁栖湖校区', now: new Date('2026-09-01T00:00:00Z') })
    expect(schedule.courses).toHaveLength(2)
    expect(schedule.courses[0]).toMatchObject({ isDegreeCourse: true, exam: '闭卷笔试' })
    expect(schedule.courses[1]).toMatchObject({ isDegreeCourse: false, teacher: '李老师' })
  })
  it('脚本包含新的选修页面入口且不含旧跨站表格链路', () => {
    const meta = createUcasCourseMetaExtractionScript()
    const personal = createUcasExtractionScript()
    expect(() => new Function(meta)).not.toThrow()
    expect(meta).toContain('/courseManage/selectedCourse')
    expect(meta).toContain('course-meta')
    expect(meta).not.toContain('termSchedule')
    expect(personal).not.toContain('termSchedule')
  })
})
