import { describe, expect, it, vi } from 'vitest'
import { createGlassNavigation, glassSpring, flowLandingDeformation, flowImpactReady, flowImpactProgress, flowBrakeReady, flowBrakeFrame, flowWallReady, flowWallFrame, flowWallOrigin, FLOW_BRAKE_OVERSHOOT, FLOW_LANDING_REBOUND_DURATION, FLOW_LANDING_DURATION } from '../src/components/glass-navigation.js'
import { hopLandingSquash, landingInertiaFrame, hopInertiaStart, hopWallStart, HOP_TRAVEL_DURATION, HOP_LANDING_COMPRESS_DURATION, HOP_SQUASH_DURATION, HOP_SQUASH_REBOUND_DURATION } from '../src/components/glass-hop.js'

vi.mock('../src/components/glass-lens.js', () => ({
  installGlassLens:() => ({setClarity:vi.fn(),setStrength:vi.fn(),destroy:vi.fn()})
}))
vi.mock('../src/components/glass-touch-light.js', () => ({
  createGlassTouchLight:() => ({configure:vi.fn(),suspend:vi.fn(),destroy:vi.fn()})
}))

function fixture(reducedMotion = false, count = 3) {
  let now = 0, id = 0
  const frames = new Map<number, FrameRequestCallback>()
  const style = () => {
    const values = new Map<string, string>()
    return {setProperty:(key:string,value:string) => values.set(key,value),removeProperty:(key:string) => values.delete(key),getPropertyValue:(key:string) => values.get(key) || '',transform:''}
  }
  const classes = new Set<string>()
  const root = Object.assign(new EventTarget(), {
    style:style(),dataset:{},hasAttribute:() => false,
    classList:{add:(...keys:string[]) => keys.forEach(key => classes.add(key)),remove:(...keys:string[]) => keys.forEach(key => classes.delete(key)),toggle:(key:string,on:boolean) => on ? classes.add(key) : classes.delete(key)}
  })
  const indicator = {style:style(),firstElementChild:{style:style()}}
  const light = {style:style()}
  const bar = {clientWidth:308,clientHeight:56,contains:() => true,getBoundingClientRect:() => ({left:40,top:600,bottom:656,width:308})}
  const buttons = Array.from({length:count},(_,index) => ({dataset:{navIndex:String(index)},style:style(),closest:() => buttons[index]}))
  const media = Object.assign(new EventTarget(), {matches:false})
  const win = Object.assign(new EventTarget(), {performance:{now:() => now},matchMedia:() => media,
    requestAnimationFrame:(callback:FrameRequestCallback) => {frames.set(++id,callback);return id},cancelAnimationFrame:(key:number) => frames.delete(key)})
  const doc = Object.assign(new EventTarget(), {defaultView:win,hidden:false})
  Object.assign(root, {ownerDocument:doc,querySelector:(selector:string) => ({'.glass-bar':bar,'.glass-selection':indicator,'.glass-light':light}[selector] || {}),querySelectorAll:() => buttons})
  let config = {activeIndex:0,navMotion:'flow',clarity:100,reducedMotion,qElastic:true}
  const select = vi.fn()
  const controller = createGlassNavigation(root, config, select)
  const state = () => ({time:now,position:Number(/translate3d\(([-\d.]+)%/.exec(indicator.style.transform)?.[1]) / 100,
    stretch:Number(indicator.style.getPropertyValue('--glass-stretch')),squeeze:Number(indicator.style.getPropertyValue('--glass-squeeze')),
    shift:parseFloat(indicator.style.getPropertyValue('--glass-flow-impact-x')) || 0})
  const step = (dt = 16) => {
    now += dt
    const callbacks = [...frames.values()];frames.clear()
    callbacks.forEach(callback => callback(now))
    return state()
  }
  const event = (node:EventTarget,type:string,props = {}) => {
    const value = new Event(type,{cancelable:true})
    Object.entries(props).forEach(([key,entry]) => Object.defineProperty(value,key,{value:entry}))
    node.dispatchEvent(value)
  }
  const click = (index:number) => event(root,'click',{target:buttons[index],detail:0})
  const configure = (next:Partial<typeof config>) => {config = {...config,...next};controller.configure(config)}
  const wallApproach = (destination:number, dt = 16) => {
    let spring = {value:state().position,velocity:0}
    for (let i = 0;i < 100;i++) {
      spring = glassSpring(spring.value,spring.velocity,destination,dt)
      step(dt)
      if (flowWallReady(false,spring.value,spring.velocity,destination,count)) return state()
    }
    throw new Error('Flow did not reach wall handoff')
  }
  const arrive = (destination:number) => {
    if (destination === 0 || destination === count-1) return wallApproach(destination)
    for (let i = 0;i < 100;i++) {
      const limit = destination === 0 || destination === count-1 ? .5/(300/count) : .1
      if (Math.abs(state().position - destination) <= limit) return state()
      step()
    }
    throw new Error('Flow did not visually arrive')
  }
  const bounds = () => {
    const s = state(),origin = parseFloat(indicator.style.getPropertyValue('--hop-origin'))/100
    const left = s.position+(1-s.stretch)*origin+s.shift/100
    return {left,right:left+s.stretch,center:left+s.stretch/2}
  }
  return {root,indicator,win,doc,controller,frames,select,step,state,event,click,configure,arrive,wallApproach,bounds,classes}
}

describe('Q elastic navigation switch', () => {
  it('immediately clears unpressed flow optics without moving the selector or changing its material', () => {
    const f = fixture()
    expect(f.classes.has('is-flow-shadow-disabled')).toBe(false)
    f.click(1)
    for (let i = 0;i < 10;i++) f.step()
    const position = f.state().position
    expect(Number(f.root.style.getPropertyValue('--glass-press'))).toBeGreaterThan(.5)
    const material = f.root.style.getPropertyValue('--glass-material-progress')
    f.configure({qElastic:false})
    expect(f.classes.has('is-flow-shadow-disabled')).toBe(true)
    expect(f.state().position).toBe(position)
    expect(f.root.style.getPropertyValue('--glass-press')).toBe('0.0000')
    expect(f.root.style.getPropertyValue('--glass-material-progress')).toBe(material)
    f.configure({qElastic:true})
    expect(f.classes.has('is-flow-shadow-disabled')).toBe(false)
    f.configure({qElastic:false,navMotion:'hop'})
    expect(f.classes.has('is-flow-shadow-disabled')).toBe(false)
    f.configure({navMotion:'flow'})
    expect(f.classes.has('is-flow-shadow-disabled')).toBe(true)
    f.controller.destroy()
    expect(f.classes.has('is-flow-shadow-disabled')).toBe(false)
  })
  it.each([3,4])('disables interior overshoot and both wall collisions in %s-tab flow', count => {
    const f = fixture(false,count)
    f.configure({qElastic:false})
    for (const destination of [1,count-1,1,0]) {
      const start = f.state().position
      f.click(destination)
      for (let i = 0;i < 80;i++) {
        const state = f.step()
        expect(state.position).toBeGreaterThanOrEqual(Math.min(start,destination))
        expect(state.position).toBeLessThanOrEqual(Math.max(start,destination))
        // No travel deformation or arrival response at any frame when off.
        expect(state.stretch).toBe(1)
        expect(state.squeeze).toBe(1)
        expect(state.shift).toBe(0)
        expect(f.root.style.getPropertyValue('--glass-press')).toBe('0.0000')
      }
      expect(f.state()).toMatchObject({position:destination,stretch:1,squeeze:1})
      expect(f.frames.size).toBe(0)
    }
    expect(f.select).toHaveBeenCalledTimes(4)
    f.controller.destroy()
  })
  it('cancels an ongoing flow impact without jumping, then restores the next impact when reenabled', () => {
    const f = fixture()
    f.click(2);f.arrive(2)
    for (let i = 0;i < 9;i++) f.step()
    expect(f.state().squeeze).toBeGreaterThan(1.14)
    const position = f.state().position
    f.configure({qElastic:false})
    expect(f.state().position).toBe(position)
    expect(f.state().stretch).toBe(1)
    expect(f.state().squeeze).toBe(1)
    for (let i = 0;i < 60;i++) f.step()
    f.configure({qElastic:true})
    f.click(1);f.arrive(1)
    f.step(HOP_LANDING_COMPRESS_DURATION)
    expect(f.state().position).toBeLessThan(.945)
    f.controller.destroy()
    expect(f.frames.size).toBe(0)
  })
  it('disabling an interior brake keeps its rendered position and removes the new inertia clock', () => {
    const f = fixture()
    f.click(1);f.arrive(1)
    for (let i = 0;i < 4;i++) f.step()
    const position = f.state().position
    f.configure({qElastic:false})
    expect(f.state().position).toBe(position)
    for (let i = 0;i < 80;i++) f.step()
    expect(f.state()).toMatchObject({position:1,stretch:1,squeeze:1})
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
  it('removes travel deformation immediately without resetting position, pressure or glass material', () => {
    const f = fixture()
    f.event(f.root,'pointerdown',{pointerId:1,clientX:194,clientY:628,button:0})
    for (let i = 0;i < 10;i++) f.step()
    expect(f.state().stretch).toBeGreaterThan(1)
    expect(f.state().squeeze).toBeLessThan(1)
    const before = f.state()
    const pressure = f.root.style.getPropertyValue('--glass-press')
    const material = f.root.style.getPropertyValue('--glass-material-progress')
    expect(Number(pressure)).toBeGreaterThan(.9)
    f.configure({qElastic:false})
    expect(f.state()).toMatchObject({position:before.position,stretch:1,squeeze:1})
    expect(f.root.style.getPropertyValue('--glass-press')).toBe(pressure)
    expect(f.root.style.getPropertyValue('--glass-material-progress')).toBe(material)
    for (let i = 0;i < 10;i++) expect(f.step()).toMatchObject({stretch:1,squeeze:1})
    f.configure({qElastic:true})
    for (let i = 0;i < 10;i++) f.step()
    expect(f.state().stretch).toBeGreaterThan(1)
    expect(f.state().squeeze).toBeLessThan(1)
    f.controller.destroy()
  })
  it('retains finger-following and press optics without resizing during a fast drag when off', () => {
    const f = fixture()
    f.configure({qElastic:false})
    f.event(f.root,'pointerdown',{pointerId:1,clientX:94,clientY:628,button:0})
    for (let i = 0;i < 10;i++) f.step()
    f.event(f.doc,'pointermove',{pointerId:1,clientX:144,clientY:628})
    f.step()
    f.event(f.doc,'pointermove',{pointerId:1,clientX:234,clientY:628})
    expect(f.step()).toMatchObject({position:1.4,stretch:1,squeeze:1})
    expect(Number(f.root.style.getPropertyValue('--glass-press'))).toBeGreaterThan(.9)
    f.event(f.doc,'pointerup',{pointerId:1})
    for (let i = 0;i < 80;i++) {
      expect(f.step()).toMatchObject({stretch:1,squeeze:1})
      expect(f.root.style.getPropertyValue('--glass-press')).toBe('0.0000')
    }
    expect(f.state().position).toBe(1)
    expect(f.select).toHaveBeenCalledWith(1)
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
  it('keeps hop flight, hold and selection but skips the landing compression and recovery', () => {
    const f = fixture()
    f.configure({navMotion:'hop',qElastic:false})
    f.click(1)
    expect(f.step(HOP_TRAVEL_DURATION/2)).toMatchObject({position:.5,stretch:1.12,squeeze:1.38})
    expect(f.step(HOP_TRAVEL_DURATION/2)).toMatchObject({position:1,stretch:1,squeeze:1})
    expect(f.frames.size).toBe(0)
    f.event(f.root,'pointerdown',{pointerId:1,clientX:194,clientY:628,button:0})
    expect(f.step(160)).toMatchObject({position:1,stretch:1.12,squeeze:1.38})
    f.event(f.doc,'pointerup',{pointerId:1})
    f.step(160)
    expect(f.state()).toMatchObject({position:1,stretch:1,squeeze:1})
    expect(f.frames.size).toBe(0)
    expect(f.select).toHaveBeenCalledWith(1)
    f.controller.destroy()
  })
  it('cancels hop squash immediately and restores the next landing without restarting the flight', () => {
    const f = fixture()
    f.configure({navMotion:'hop'})
    f.click(1);f.step(hopInertiaStart(0,1,HOP_TRAVEL_DURATION)+HOP_LANDING_COMPRESS_DURATION)
    expect(f.state()).toMatchObject({position:1.06,stretch:1.12,squeeze:.85})
    f.configure({qElastic:false})
    expect(f.state()).toMatchObject({position:1.06,stretch:1,squeeze:1})
    f.step(160)
    expect(f.state()).toMatchObject({position:1,stretch:1,squeeze:1})
    expect(f.frames.size).toBe(0)
    f.click(2);f.step(120)
    const before = f.state()
    f.configure({qElastic:true})
    expect(f.state()).toEqual(before)
    f.step(80);f.step(hopWallStart(1,2,HOP_TRAVEL_DURATION,100)+HOP_LANDING_COMPRESS_DURATION-(120+80))
    expect(f.state()).toMatchObject({position:2,stretch:1.12,squeeze:.85})
    f.controller.destroy()
    expect(f.frames.size).toBe(0)
  })
  it('respects reduced motion regardless of the Q elastic choice', () => {
    const f = fixture(true)
    for (const mode of ['flow','hop']) for (const enabled of [false,true]) {
      f.configure({navMotion:mode,qElastic:enabled})
      f.click(1)
      f.step()
      expect(f.state()).toMatchObject({position:1,stretch:1,squeeze:1})
      expect(f.frames.size).toBe(0)
    }
    f.controller.destroy()
  })
})

describe('hop continuous inertial landing', () => {
  it.each([60,90,120])('passes interior tabs in both directions without parking first at %sHz', hz => {
    for (const count of [3,4]) for (const [source,destination] of [[0,1],[count-1,1]]) {
      const f = fixture(false,count),dt = 1000/hz,direction = Math.sign(destination-source)
      f.configure({navMotion:'hop',activeIndex:source});f.controller.suspend()
      f.click(destination)
      const samples = [f.state()]
      for (let i = 0;i < 100;i++) samples.push(f.step(dt))
      const crossing = samples.findIndex(s => (s.position-destination)*direction >= 0)
      expect(crossing).toBeGreaterThan(0)
      expect((samples[crossing].position-samples[crossing-1].position)*direction).toBeGreaterThan(.00001)
      expect((samples[crossing+1].position-samples[crossing].position)*direction).toBeGreaterThan(.00001)
      expect(Math.max(...samples.map(s => (s.position-destination)*direction))).toBeGreaterThan(.059)
      expect(Math.max(...samples.map(s => (s.position-destination)*direction))).toBeLessThanOrEqual(.060001)
      expect(samples.every(s => s.shift === 0)).toBe(true)
      expect(samples.some(s => s.stretch > 1.11 && s.squeeze < .86)).toBe(true)
      expect(f.indicator.style.getPropertyValue('--hop-origin')).toBe('50% 50%')
      expect(f.state()).toMatchObject({position:destination,stretch:1,squeeze:1})
      expect(f.frames.size).toBe(0)
      f.controller.destroy()
    }
  })
  it('uses the same incoming-velocity curve as flow, with the flight clock retained', () => {
    const f = fixture()
    f.configure({navMotion:'hop'})
    const handoff = hopInertiaStart(0,1,HOP_TRAVEL_DURATION),t = handoff/HOP_TRAVEL_DURATION
    const from = t*t*(3-2*t),velocity = 6*t*(1-t)/HOP_TRAVEL_DURATION
    f.click(1);f.step(handoff)
    expect(f.state().position).toBeCloseTo(from,10)
    expect(f.state().position).toBeLessThan(1)
    for (let age = 8;age <= HOP_SQUASH_DURATION;age += 8) {
      f.step(8)
      const expected = landingInertiaFrame(from,velocity,1,1,age,.06,HOP_SQUASH_REBOUND_DURATION)
      expect(f.state().position).toBeCloseTo(expected.value,10)
      if (age <= HOP_LANDING_COMPRESS_DURATION) expect(expected).toEqual(flowBrakeFrame(from,velocity,1,1,age))
    }
    f.step(HOP_SQUASH_DURATION % 8)
    expect(f.state()).toMatchObject({position:1,stretch:1,squeeze:1})
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
  it('does not restart an inertial recovery when the target is clicked or acknowledged again', () => {
    const control = fixture(),f = fixture()
    for (const instance of [control,f]) {
      instance.configure({navMotion:'hop'})
      instance.click(1);instance.step(400)
    }
    const before = f.state()
    f.configure({activeIndex:1});f.click(1)
    expect(f.state()).toEqual(before)
    for (let i = 0;i < 50;i++) expect(f.step()).toEqual(control.step())
    f.controller.destroy();control.controller.destroy()
  })
  it('preserves visible position and shape when reversing during an inertial landing', () => {
    const f = fixture()
    f.configure({navMotion:'hop'})
    f.click(1);f.step(400)
    const before = f.state(),origin = f.indicator.style.getPropertyValue('--hop-origin')
    f.click(0)
    expect(f.state()).toEqual(before)
    expect(f.indicator.style.getPropertyValue('--hop-origin')).toBe(origin)
    for (let i = 0;i < 80;i++) f.step()
    expect(f.state()).toMatchObject({position:0,stretch:1,squeeze:1})
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
  it('never adds an inertial move when releasing a stationary hold', () => {
    const f = fixture()
    f.configure({navMotion:'hop'})
    f.event(f.root,'pointerdown',{pointerId:1,clientX:194,clientY:628,button:0})
    f.step(500)
    expect(f.state().position).toBe(1)
    f.event(f.doc,'pointerup',{pointerId:1})
    for (let i = 0;i < 50;i++) expect(f.step().position).toBe(1)
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
  it.each([0,2])('starts the edge squash on the first late arrival frame at tab %s without a new wait', destination => {
    const f = fixture()
    f.configure({navMotion:'hop',activeIndex:1});f.controller.suspend()
    f.click(destination);f.step(336)
    expect(f.state().position).toBe(destination)
    expect(f.state().squeeze).toBeLessThan(.999)
    expect(f.indicator.style.getPropertyValue('--hop-origin')).toBe(`${destination === 0 ? 0 : 100}% 50%`)
    f.step(364)
    expect(f.state()).toMatchObject({position:destination,stretch:1,squeeze:1})
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
  it.each([60,90,120])('starts edge compression before parking at the wall at %sHz', hz => {
    for (const destination of [0,2]) {
      const f = fixture(),dt = 1000/hz
      f.configure({navMotion:'hop',activeIndex:1});f.controller.suspend()
      f.click(destination)
      const contact = hopWallStart(1,destination,HOP_TRAVEL_DURATION,100)
      f.step(contact+dt/2)
      expect(f.state().stretch).toBeGreaterThan(1)
      expect(f.state().squeeze).toBeLessThan(1)
      expect(f.state().time).toBeLessThan(HOP_TRAVEL_DURATION+dt)
      f.controller.destroy()
    }
  })
  it('finishes all clocks after one delayed frame instead of starting a late landing', () => {
    for (const destination of [1,2]) {
      const f = fixture()
      f.configure({navMotion:'hop'})
      f.click(destination);f.step(1000)
      expect(f.state()).toMatchObject({position:destination,stretch:1,squeeze:1})
      expect(f.frames.size).toBe(0)
      f.controller.destroy()
    }
  })
})

describe('flow continuous wall approach', () => {
  it('recovers faster with lighter wall and brake shapes while hop keeps its own clock', () => {
    expect(FLOW_LANDING_REBOUND_DURATION).toBe(125)
    expect(FLOW_LANDING_DURATION).toBe(250)
    expect(flowLandingDeformation(1,0,-1)).toEqual({stretch:.88,squeeze:1.15,shift:0,origin:0})
    expect(flowLandingDeformation(1,1,1)).toEqual({stretch:1.035,squeeze:1.018,shift:0,origin:50})
    expect(flowImpactProgress(FLOW_LANDING_DURATION,0)).toBeCloseTo(0)
    expect(flowBrakeFrame(.95,.001,1,1,FLOW_LANDING_DURATION)).toEqual({value:1,velocity:0})
    expect(hopLandingSquash(FLOW_LANDING_DURATION)).toBeCloseTo(0)
  })
  it('reuses the brake gate and velocity curve, with the overshoot absorbed by the wall', () => {
    expect(flowWallReady(false,.09,-.002,0)).toBe(true)
    expect(flowWallReady(false,1.91,.002,2)).toBe(true)
    expect(flowWallReady(true,.09,-.002,0)).toBe(false)
    expect(flowWallReady(false,.09,.002,0)).toBe(false)
    expect(flowWallReady(false,.09,-.02,0)).toBe(false)
    expect(flowWallReady(false,0,0,0)).toBe(false)
    expect(flowWallReady(false,.91,.002,1)).toBe(false)
    for (const [from,target,direction] of [[.09,0,-1],[1.91,2,1]]) {
      expect(flowWallFrame(from,direction*.002,target,direction,0)).toEqual({value:from,velocity:direction*.002})
      for (let elapsed = 0;elapsed <= 500;elapsed++) {
        const original = flowBrakeFrame(from,direction*.002,target,direction,elapsed)
        const wall = flowWallFrame(from,direction*.002,target,direction,elapsed)
        expect(wall.value).toBe(Math.max(0,Math.min(2,original.value)))
      }
      expect(flowWallFrame(from,direction*.002,target,direction,FLOW_LANDING_DURATION)).toEqual({value:target,velocity:0})
    }
    expect(flowWallOrigin(.09,.09,0,50)).toBe(50)
    expect(flowWallOrigin(.09,.045,0,50)).toBe(25)
    expect(flowWallOrigin(.09,0,0,50)).toBe(0)
    expect(flowWallOrigin(1.91,1.955,2,50)).toBeCloseTo(75)
    expect(flowWallOrigin(1.91,2,2,50)).toBe(100)
  })
  it.each([60,90,120])('continuously joins both walls from the incoming shape/velocity at %sHz', hz => {
    for (const count of [3,4]) for (const destination of [0,count-1]) {
      const f = fixture(false,count),dt = 1000/hz,source = destination === 0 ? count-1 : 0,direction = Math.sign(destination-source)
      f.configure({activeIndex:source});f.controller.suspend();f.click(destination)
      let spring = {value:source,velocity:0},start = -1,from = 0,velocity = 0,startStretch = 1,startSqueeze = 1,startOrigin = 50
      const centers:number[] = []
      let maxHeight = 0
      for (let i = 0;i < 150;i++) {
        const oldOrigin = parseFloat(f.indicator.style.getPropertyValue('--hop-origin'))
        spring = glassSpring(spring.value,spring.velocity,destination,dt)
        const s = f.step(dt)
        if (start < 0) {
          expect(s.position).toBeCloseTo(spring.value,10)
          if (flowWallReady(false,spring.value,spring.velocity,destination,count)) {
            start = s.time;from = spring.value;velocity = spring.velocity
            startStretch = s.stretch;startSqueeze = s.squeeze;startOrigin = oldOrigin
            expect(Math.abs(s.position-destination)).toBeGreaterThan(.01)
            expect(parseFloat(f.indicator.style.getPropertyValue('--hop-origin'))).toBe(startOrigin)
          }
        }
        if (start >= 0 && s.time-start <= FLOW_LANDING_DURATION) {
          const age = s.time-start,amount = flowImpactProgress(age,destination,count),shape = flowLandingDeformation(amount,destination,direction,count)
          expect(s.position).toBeCloseTo(flowWallFrame(from,velocity,destination,direction,age,count).value,10)
          const remainder = age >= HOP_LANDING_COMPRESS_DURATION ? 0 : 1-amount
          expect(s.stretch).toBeCloseTo((1+(startStretch-1)*remainder)*shape.stretch,3)
          expect(s.squeeze).toBeCloseTo((1+(startSqueeze-1)*remainder)*shape.squeeze,3)
          expect(parseFloat(f.indicator.style.getPropertyValue('--hop-origin'))).toBeCloseTo(flowWallOrigin(from,s.position,destination,startOrigin),8)
          const b = f.bounds()
          expect(b.left).toBeGreaterThanOrEqual(-.0001)
          expect(b.right).toBeLessThanOrEqual(count+.0001)
          expect(s.shift).toBe(0)
          centers.push(b.center)
          maxHeight = Math.max(maxHeight,s.squeeze)
        }
      }
      const crossing = centers.findIndex(center => (center-(destination+.5))*direction >= 0)
      expect(crossing).toBeGreaterThan(0)
      expect((centers[crossing]-centers[crossing-1])*direction).toBeGreaterThan(.000001)
      expect((centers[crossing+1]-centers[crossing])*direction).toBeGreaterThan(.000001)
      expect(maxHeight).toBeGreaterThan(1.148)
      expect(f.state()).toMatchObject({position:destination,stretch:1,squeeze:1})
      expect(f.frames.size).toBe(0)
      f.controller.destroy()
    }
  })
  it.each([0,2])('does not restart the wall clock on repeat activation of tab %s', destination => {
    const control = fixture(),f = fixture()
    for (const instance of [control,f]) {
      instance.configure({activeIndex:1});instance.controller.suspend()
      instance.click(destination);instance.wallApproach(destination);instance.step(80)
    }
    const before = f.state()
    f.click(destination);f.configure({activeIndex:destination})
    expect(f.state()).toEqual(before)
    for (let i = 0;i < 60;i++) {
      expect(f.step()).toEqual(control.step())
      expect(f.bounds()).toEqual(control.bounds())
    }
    f.controller.destroy();control.controller.destroy()
  })
  it('keeps the visible pivot/shape on a rapid reversal during the wall approach', () => {
    const f = fixture()
    f.configure({activeIndex:1});f.controller.suspend()
    f.click(0);f.wallApproach(0);f.step()
    const before = f.state(),bounds = f.bounds(),origin = f.indicator.style.getPropertyValue('--hop-origin')
    f.click(2)
    expect(f.state()).toEqual(before)
    f.step(0)
    for (const key of ['left','right','center'] as const) expect(f.bounds()[key]).toBeCloseTo(bounds[key],10)
    expect(f.indicator.style.getPropertyValue('--hop-origin')).toBe(origin)
    for (let i = 0;i < 120;i++) f.step()
    expect(f.state()).toMatchObject({position:2,stretch:1,squeeze:1})
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
})

describe('flow directional impact', () => {
  it('preserves incoming position and velocity, passes the target once and settles after recovery', () => {
    for (const direction of [-1,1]) {
      const from = 1-direction*.09,velocity = direction*.002
      const start = flowBrakeFrame(from,velocity,1,direction,0)
      expect(start.value).toBe(from);expect(start.velocity).toBeCloseTo(velocity,12)
      let previous = from
      for (let elapsed = 1;elapsed <= HOP_LANDING_COMPRESS_DURATION;elapsed++) {
        const state = flowBrakeFrame(from,velocity,1,direction,elapsed)
        expect((state.value-previous)*direction).toBeGreaterThanOrEqual(-.00000001)
        expect((state.value-1)*direction).toBeLessThanOrEqual(FLOW_BRAKE_OVERSHOOT+.00000001)
        previous = state.value
      }
      expect(flowBrakeFrame(from,velocity,1,direction,HOP_LANDING_COMPRESS_DURATION).value).toBeCloseTo(1+direction*FLOW_BRAKE_OVERSHOOT)
      expect(flowBrakeFrame(from,velocity,1,direction,HOP_LANDING_COMPRESS_DURATION).velocity).toBe(0)
      expect(flowBrakeFrame(from,velocity,1,direction,FLOW_LANDING_DURATION)).toEqual({value:1,velocity:0})
      expect(flowBrakeFrame(from,velocity,1,direction,10000)).toEqual({value:1,velocity:0})
    }
  })
  it('only starts an incoming interior brake before arrival, not at rest, on a hold or a fast reversal', () => {
    expect(flowBrakeReady(false,.91,.002,1)).toBe(true)
    expect(flowBrakeReady(false,1.09,-.002,1)).toBe(true)
    expect(flowBrakeReady(false,.8,.002,1)).toBe(false)
    expect(flowBrakeReady(false,1,0,1)).toBe(false)
    expect(flowBrakeReady(true,.95,.001,1)).toBe(false)
    expect(flowBrakeReady(false,.95,-.001,1)).toBe(false)
    expect(flowBrakeReady(false,.95,.02,1)).toBe(false)
    expect(flowBrakeReady(false,.09,-.002,0)).toBe(false)
    expect(flowBrakeReady(false,1.91,.002,2)).toBe(false)
  })
  it('does not add a new inertial movement after holding an already-arrived interior tab', () => {
    const f = fixture()
    f.event(f.root,'pointerdown',{pointerId:1,clientX:194,clientY:628,button:0})
    for (let i = 0;i < 60;i++) f.step()
    expect(f.state().position).toBe(1)
    f.event(f.doc,'pointerup',{pointerId:1})
    for (let i = 0;i < 60;i++) expect(f.step().position).toBe(1)
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
  it('repeated activation of the current brake does not restart its position or clock', () => {
    const f = fixture()
    f.click(1);f.arrive(1)
    for (let i = 0;i < 11;i++) f.step()
    const before = f.state()
    f.configure({activeIndex:1});f.click(1)
    expect(f.state()).toEqual(before)
    let previous = before.position
    for (let i = 0;i < 45;i++) {
      const next = f.step()
      expect(next.position).toBeLessThanOrEqual(previous+.00001)
      previous = next.position
    }
    expect(f.state()).toMatchObject({position:1,stretch:1,squeeze:1})
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
  it('pressing the current moving tab settles smoothly without a second overshoot on release', () => {
    const f = fixture()
    f.click(1);f.arrive(1)
    for (let i = 0;i < 12;i++) f.step()
    f.configure({activeIndex:1})
    const before = f.state()
    f.event(f.root,'pointerdown',{pointerId:1,clientX:194,clientY:628,button:0})
    expect(f.state()).toEqual(before)
    for (let i = 0;i < 30;i++) f.step()
    f.event(f.doc,'pointerup',{pointerId:1})
    for (let i = 0;i < 60;i++) expect(f.step().position).toBe(1)
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
  it('softly accelerates braking onset while preserving wall and all recovery samples', () => {
    for (const count of [3,4]) {
      for (let elapsed = 0;elapsed <= 500;elapsed++) {
        for (let interior = 1;interior < count - 1;interior++) {
          const brake = flowImpactProgress(elapsed,interior,count),old = hopLandingSquash(elapsed,FLOW_LANDING_REBOUND_DURATION)
          if (elapsed > 0 && elapsed < HOP_LANDING_COMPRESS_DURATION) {
            expect(brake).toBeGreaterThan(old)
            expect(brake).toBeLessThan(flowImpactProgress(elapsed,0,count))
          } else expect(brake).toBe(old)
        }
        for (const wall of [0,count - 1]) {
          const impact = flowImpactProgress(elapsed,wall,count)
          expect(impact).toBeGreaterThanOrEqual(0)
          expect(impact).toBeLessThanOrEqual(1)
          const expected = elapsed <= HOP_LANDING_COMPRESS_DURATION ? Math.sin(Math.PI * (elapsed / HOP_LANDING_COMPRESS_DURATION) / 2) : hopLandingSquash(elapsed,FLOW_LANDING_REBOUND_DURATION)
          expect(impact).toBe(expected)
        }
      }
    }
  })
  it.each([60,90,120])('starts braking before reaching the target without a second face translation at %sHz', hz => {
    for (const [source,direction] of [[0,1],[2,-1]]) {
      const f = fixture(),dt = 1000 / hz
      f.configure({activeIndex:source});f.controller.suspend()
      f.click(1)
      for (let i = 0;i < 100 && Math.abs(f.state().position - 1) > .1;i++) f.step(dt)
      const before = f.state()
      expect((before.position-1)*direction).toBeLessThan(0)
      const next = f.step(dt)
      expect((next.position-before.position)*direction).toBeGreaterThan(0)
      expect(next.shift).toBe(0)
      f.controller.destroy()
    }
  })
  it.each([60,90,120])('already elongates while approaching the wall instead of starting after parking at %sHz', hz => {
    for (const destination of [0,2]) {
      const f = fixture(),dt = 1000 / hz
      f.configure({activeIndex:1});f.controller.suspend()
      f.click(destination)
      for (let i = 0;i < 100 && Math.abs(f.state().position - destination) * 100 > .5;i++) f.step(dt)
      expect(f.state().squeeze).toBeGreaterThan(1.04)
      const next = f.step(dt)
      expect(next.squeeze).toBeGreaterThan(1.04)
      expect(next.stretch).toBeLessThan(.99)
      f.controller.destroy()
    }
  })
  it('starts at visual arrival but ignores holds and fast target crossings', () => {
    expect(flowImpactReady(false,.996,.0001,1,100)).toBe(true)
    expect(flowImpactReady(false,.99,.0001,1,100)).toBe(false)
    expect(flowImpactReady(true,1,0,1,100)).toBe(false)
    expect(flowImpactReady(false,1,.002,1,100)).toBe(false)
    expect(flowImpactReady(false,1,0,1,100)).toBe(true)
  })
  it.each([[0,1,1],[3,2,-1],[1,3,1],[2,0,-1]])('adapts to four tabs, from %s to %s', (source,destination,direction) => {
    const f = fixture(false,4)
    f.configure({activeIndex:source});f.controller.suspend()
    f.click(destination)
    f.arrive(destination)
    for (let i = 0;i < 11;i++) f.step()
    const expected = flowLandingDeformation(flowImpactProgress(176,destination,4),destination,direction,4)
    expect(f.state().stretch).toBeCloseTo(expected.stretch,3)
    expect(f.state().squeeze).toBeCloseTo(expected.squeeze,3)
    expect(f.state().shift).toBeCloseTo(expected.shift,3)
    expect(f.indicator.style.getPropertyValue('--hop-origin')).toBe(`${expected.origin}% 50%`)
    f.controller.destroy()
  })
  it.each([60,90,120])('joins the original spring velocity continuously into inertial braking at %sHz', hz => {
    const f = fixture(),dt = 1000 / hz
    f.click(1)
    let original = {value:0,velocity:0},arrival = -1,from = 0,velocity = 0,startStretch = 1,startSqueeze = 1,peak = 0
    for (let elapsed = 0;elapsed < 1200;elapsed += dt) {
      original = glassSpring(original.value,original.velocity,1,dt)
      const state = f.step(dt)
      if (arrival < 0) {
        expect(state.position).toBeCloseTo(original.value,10)
        if (flowBrakeReady(false,original.value,original.velocity,1)) {
          arrival = state.time;from = state.position;velocity = original.velocity
          startStretch = state.stretch;startSqueeze = state.squeeze
        }
      }
      if (arrival >= 0) {
        const age = state.time-arrival,amount = flowImpactProgress(age,1),shape = flowLandingDeformation(amount,1,1)
        expect(state.position).toBeCloseTo(flowBrakeFrame(from,velocity,1,1,age).value,10)
        const remaining = age >= HOP_LANDING_COMPRESS_DURATION ? 0 : 1-amount
        expect(state.stretch).toBeCloseTo((1+(startStretch-1)*remaining)*shape.stretch,3)
        expect(state.squeeze).toBeCloseTo((1+(startSqueeze-1)*remaining)*shape.squeeze,3)
        expect(state.shift).toBe(0)
        peak = Math.max(peak,state.position-1)
      }
    }
    expect(arrival).toBeGreaterThan(0)
    expect(peak).toBeGreaterThan(FLOW_BRAKE_OVERSHOOT*.98)
    expect(peak).toBeLessThanOrEqual(FLOW_BRAKE_OVERSHOOT+.00001)
    expect(f.state()).toMatchObject({position:1,stretch:1,squeeze:1,shift:0})
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
  it('does not collide while held and grows vertically on release with the wall edge pinned', () => {
    const f = fixture()
    f.event(f.root,'pointerdown',{pointerId:1,clientX:294,clientY:628,button:0})
    for (let i = 0;i < 40;i++) f.step()
    expect(f.state().position).toBe(2)
    expect(f.state().squeeze).toBeGreaterThan(.95)
    f.event(f.doc,'pointerup',{pointerId:1})
    expect(f.step()).toMatchObject({position:2,stretch:1,squeeze:1})
    for (let i = 0;i < 9;i++) f.step()
    expect(f.state().stretch).toBeLessThan(.89)
    expect(f.state().squeeze).toBeGreaterThan(1.14)
    expect(f.state().shift).toBe(0)
    expect(f.indicator.style.getPropertyValue('--hop-origin')).toBe('100% 50%')
    expect(f.select).toHaveBeenCalledWith(2)
    f.controller.destroy()
  })
  it.each([[0,1],[2,-1]])('brakes towards the incoming direction from tab %s', (source,direction) => {
    const f = fixture()
    f.configure({activeIndex:source});f.controller.suspend()
    f.click(1)
    f.arrive(1)
    expect(f.state().shift).toBe(0)
    f.step(HOP_LANDING_COMPRESS_DURATION)
    const state = f.state()
    const overshoot = (state.position-1)*100
    expect(overshoot * direction).toBeGreaterThan(5.9)
    expect(state.stretch).toBeGreaterThan(1.034)
    expect(state.squeeze).toBeGreaterThanOrEqual(1)
    // Relative to the unchanged tab, the leading edge extends and the trailing
    // edge retracts. This is not a symmetrical horizontal squash or stretch.
    const leftChange = overshoot - (state.stretch - 1) * 50
    const rightChange = overshoot + (state.stretch - 1) * 50
    expect(leftChange * direction).toBeGreaterThan(0)
    expect(rightChange * direction).toBeGreaterThan(0)
    for (let i = 0;i < 40;i++) f.step()
    expect(f.state()).toMatchObject({position:1,stretch:1,squeeze:1,shift:0})
    f.controller.destroy()
  })
  it.each([0,2])('collides at edge tab %s by narrowing and growing taller, never crossing its wall', destination => {
    const f = fixture()
    f.configure({activeIndex:1});f.controller.suspend()
    f.click(destination)
    f.arrive(destination)
    for (let i = 0;i < 9;i++) f.step()
    expect(f.state().stretch).toBeLessThan(.89)
    expect(f.state().squeeze).toBeGreaterThan(1.14)
    expect(f.state().shift).toBe(0)
    expect(f.indicator.style.getPropertyValue('--hop-origin')).toBe(`${destination === 0 ? 0 : 100}% 50%`)
    f.controller.destroy()
  })
  it('preserves the visible shape on retarget and does not restart for parent acknowledgement', () => {
    const f = fixture()
    f.click(1)
    f.arrive(1)
    for (let i = 0;i < 11;i++) f.step()
    const before = f.state()
    f.configure({activeIndex:1})
    expect(f.state()).toEqual(before)
    f.click(2)
    expect(f.state()).toEqual(before)
    const interrupted = f.step()
    expect(Math.abs(interrupted.squeeze - before.squeeze)).toBeLessThan(.03)
    expect(Math.abs(interrupted.shift - before.shift)).toBeLessThan(1)
    for (let i = 0;i < 70;i++) f.step()
    expect(f.state()).toMatchObject({position:2,stretch:1,squeeze:1})
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
  it('skips landing for a same-tab tap and for reduced motion', () => {
    for (const reduced of [false,true]) {
      const f = fixture(reduced)
      f.click(reduced ? 1 : 0)
      for (let i = 0;i < 70;i++) {
        expect(f.step()).toMatchObject({position:reduced ? 1 : 0,stretch:1,squeeze:1})
      }
      expect(f.frames.size).toBe(0)
      f.controller.destroy()
    }
  })
  it('returns a cancelled drag to the active tab and lands once without selecting another page', () => {
    const f = fixture()
    f.configure({activeIndex:1})
    for (let i = 0;i < 70;i++) f.step()
    f.event(f.root,'pointerdown',{pointerId:1,clientX:194,clientY:628,button:0})
    f.step()
    f.event(f.doc,'pointermove',{pointerId:1,clientX:294,clientY:628})
    f.step()
    expect(f.state().position).toBe(2)
    f.event(f.doc,'pointercancel',{pointerId:1})
    let position = 1
    for (let i = 0;i < 70;i++) position = Math.min(position,f.step().position)
    expect(position).toBeLessThan(.941)
    expect(f.state()).toMatchObject({position:1,stretch:1,squeeze:1})
    expect(f.select).not.toHaveBeenCalled()
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
  it('immediately clears an in-progress landing when reduced motion is enabled', () => {
    const f = fixture()
    f.configure({activeIndex:1})
    f.arrive(1)
    f.step(HOP_LANDING_COMPRESS_DURATION)
    expect(f.state().position).toBeGreaterThan(1.059)
    f.configure({reducedMotion:true})
    expect(f.state()).toMatchObject({position:1,stretch:1,squeeze:1})
    expect(f.frames.size).toBe(0)
    f.controller.destroy()
  })
  it('cancels landing on suspension and cleans up on mode switch or destruction', () => {
    const f = fixture()
    f.click(1)
    f.arrive(1)
    f.step(HOP_LANDING_COMPRESS_DURATION)
    expect(f.state().position).toBeGreaterThan(1.055)
    f.controller.suspend()
    expect(f.state()).toMatchObject({position:0,stretch:1,squeeze:1})
    expect(f.frames.size).toBe(0)
    f.configure({navMotion:'hop'})
    f.click(1)
    f.step()
    f.controller.destroy()
    expect(f.frames.size).toBe(0)
    expect(f.indicator.style.getPropertyValue('--hop-origin')).toBe('')
    expect(f.indicator.style.getPropertyValue('--glass-flow-impact-x')).toBe('')
  })
})
