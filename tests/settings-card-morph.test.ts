import { describe, expect, it } from 'vitest'
import { settingsCardMorphStyle, settingsPageZoomStyle, settingsCardPageStyle, type CardRect } from '../src/components/settings-card-morph'

const page: CardRect = { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 }

describe('settings card expansion origins', () => {
  it('uses the narrow appearance card and wide preview row as different outlines', () => {
    const appearance = settingsCardMorphStyle(page, {
      left: 202, top: 330, right: 368, bottom: 510, width: 166, height: 180,
    }, 'appearance')
    const preview = settingsCardMorphStyle(page, {
      left: 38, top: 610, right: 352, bottom: 681, width: 314, height: 71,
    }, 'preview')
    expect(appearance).toMatchObject({
      '--morph-left': '202px', '--morph-right': '22px',
      '--morph-top': '330px', '--morph-bottom': '334px',
      '--morph-radius': '19px', '--morph-fill': '#f3f8f7',
    })
    expect(preview).toMatchObject({
      '--morph-left': '38px', '--morph-right': '38px',
      '--morph-top': '610px', '--morph-bottom': '163px',
      '--morph-radius': '15px', '--morph-fill': '#ffffff',
    })
  })

  it('clips a partly visible card to the screen and rejects a card wholly below it', () => {
    expect(settingsCardMorphStyle(page, {
      left: 38, top: 700, right: 352, bottom: 900, width: 314, height: 200,
    }, 'about')?.['--morph-bottom']).toBe('0px')
    expect(settingsCardMorphStyle(page, {
      left: 38, top: 900, right: 352, bottom: 971, width: 314, height: 71,
    }, 'about')).toBe(null)
  })
})

describe('settings full-page zoom origins', () => {
  it('fits a phone-shaped miniature inside either the small tile or wide row', () => {
    const tile = settingsPageZoomStyle(page, {
      left: 202, top: 330, right: 368, bottom: 510, width: 166, height: 180,
    }, 'appearance')!
    const row = settingsPageZoomStyle(page, {
      left: 38, top: 610, right: 352, bottom: 681, width: 314, height: 71,
    }, 'preview')!
    const tileScale = Number(tile['--zoom-scale'])
    const rowScale = Number(row['--zoom-scale'])
    expect(tileScale).toBeCloseTo(180 / 844)
    expect(parseFloat(tile['--zoom-x']) + page.width * tileScale / 2).toBeCloseTo(285)
    expect(parseFloat(tile['--zoom-y']) + page.height * tileScale / 2).toBeCloseTo(420)
    expect(parseFloat(tile['--zoom-radius']) * tileScale).toBeCloseTo(Math.min(19, page.width * tileScale * .18))
    expect(rowScale).toBeCloseTo(71 / 844)
    expect(parseFloat(row['--zoom-x']) + page.width * rowScale / 2).toBeCloseTo(195)
    expect(parseFloat(row['--zoom-y']) + page.height * rowScale / 2).toBeCloseTo(645.5)
    expect((page.width * rowScale) / (page.height * rowScale)).toBeCloseTo(page.width / page.height)
  })

  it('limits the origin to the visible viewport and rejects offscreen items', () => {
    const visible = settingsPageZoomStyle(page, {
      left: 38, top: 700, right: 352, bottom: 900, width: 314, height: 200,
    }, 'about')!
    expect(Number(visible['--zoom-scale'])).toBeCloseTo(144 / 844)
    expect(settingsPageZoomStyle(page, {
      left: 38, top: 900, right: 352, bottom: 971, width: 314, height: 71,
    }, 'about')).toBe(null)
  })
})

describe('settings card-to-page origins', () => {
  it('uses the actual card outline with a uniformly scaled page filling it', () => {
    const tile = settingsCardPageStyle(page, {
      left: 202, top: 330, right: 368, bottom: 510, width: 166, height: 180,
    }, 'appearance')!
    const row = settingsCardPageStyle(page, {
      left: 38, top: 610, right: 352, bottom: 681, width: 314, height: 71,
    }, 'preview')!
    expect(tile).toMatchObject({ '--morph-left': '202px', '--morph-top': '330px', '--morph-radius': '19px' })
    expect(Number(tile['--zoom-scale'])).toBeCloseTo(166 / 390)
    expect(row).toMatchObject({ '--morph-left': '38px', '--morph-top': '610px', '--morph-radius': '15px' })
    expect(Number(row['--zoom-scale'])).toBeCloseTo(314 / 390)
    expect(parseFloat(row['--zoom-x']) + page.width * Number(row['--zoom-scale']) / 2).toBeCloseTo(195)
    expect(parseFloat(row['--zoom-y'])).toBeCloseTo(610)
  })

  it('falls back when the source card is not visible', () => {
    expect(settingsCardPageStyle(page, {
      left: 38, top: 900, right: 352, bottom: 971, width: 314, height: 71,
    }, 'about')).toBe(null)
  })
})

describe('calendar plus import origins', () => {
  const plus: CardRect = { left: 324, top: 0, right: 368, bottom: 44, width: 44, height: 44 }

  it('uses the plus hit target for all three non-slide geometries', () => {
    const card = settingsCardMorphStyle(page, plus, 'import')!
    const zoom = settingsPageZoomStyle(page, plus, 'import')!
    const shape = settingsCardPageStyle(page, plus, 'import')!
    expect(card).toMatchObject({ '--morph-left':'324px', '--morph-right':'22px', '--morph-radius':'22px', '--morph-fill':'#f6f8fc' })
    expect(Number(zoom['--zoom-scale'])).toBeCloseTo(44 / 844)
    expect(parseFloat(zoom['--zoom-x']) + 390 * Number(zoom['--zoom-scale']) / 2).toBeCloseTo(346)
    expect(shape['--morph-left']).toBe(card['--morph-left'])
    expect(Number(shape['--zoom-scale'])).toBeCloseTo(44 / 390)
    expect(settingsCardPageStyle(page, { ...plus, top:900, bottom:944 }, 'import')).toBeNull()
  })
})
