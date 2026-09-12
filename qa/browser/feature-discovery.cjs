const { chromium } = require('../../ui/node_modules/playwright');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/solver.json');
(async () => {
 const browser = await chromium.launch({headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:900}});
 let aiRequests=0;
 await page.route('**/api/evaluate', route=>route.fulfill({json:fixture.default}));
 await page.route('**/api/explain', route=>{aiRequests++;return route.abort();});
 await page.goto('http://127.0.0.1:3124');
 await page.getByRole('button',{name:'Ask Myla',exact:true}).first().waitFor();
 await page.waitForFunction(()=>document.querySelector('.hardware-canvas')?.dataset.bounds && !document.querySelector('.layout-results-toolbar button')?.disabled);
 await page.screenshot({path:'/tmp/discovery-desktop.png'});
 await page.getByRole('button',{name:'Ask Myla',exact:true}).first().click();
 await page.getByRole('dialog').waitFor();
 assert.equal(await page.getByRole('dialog').locator('details[open]').count(),1,'Local notes should be visible immediately');
 assert.match(await page.getByRole('dialog').innerText(),/Myla/);
 assert.equal(aiRequests,0,'Opening Myla must not send an AI request');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Show graphs & details',exact:true}).click();
 assert.equal(await page.locator('.results-technical').getAttribute('open'),'');
 await page.locator('[data-tour="chart-levels"]').scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/discovery-graphs.png'});
 await page.getByRole('button',{name:'Hide graphs & details',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:'/tmp/discovery-mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,'mobile horizontal overflow');
 console.log('PASS: Myla opens without AI request, graphs exposed with one click, mobile has no horizontal overflow. Screenshots in /tmp/discovery-*.png. Solver responses mocked.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
