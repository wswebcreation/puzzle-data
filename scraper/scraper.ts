import { browser, $ } from '@wdio/globals'
import { join } from 'path'

describe('Should store all images', () => {
    it('should login with valid credentials', async () => {
        const url = 'https://queensgame.vercel.app/level/'
        // Start url
        for (let i =537; i <= 585; i++) {
            if ([4, 7, 9, 13, 14, 18, 19, 20].includes(i)) {
                continue
            }

            await browser.url(`${url}${i}`)
            await browser.pause(250)
            const board = await $('div.board')
            await board.waitForDisplayed()
            const level = i.toString().padStart(3, '0')

            console.log("level = ", level)
            // now store the image in a file
            await browser.saveElement(board, level, {actualFolder: join(process.cwd(), './images/done/')})
        }
        
    })
})

