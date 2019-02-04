const puppeteer = require('puppeteer');
const $ = require('cheerio');
const url = 'https://students.sbschools.org/genesis/parents?gohome=true';

var email = '10013096@sbstudents.org';
var pass = 'Tint@%79';
var url2 = encodeURI('https://students.sbschools.org/genesis/j_security_check?j_username='+email+'&j_password='+pass);

function func(){
    eval("header_goToTab('studentdata&tab2=gradebook','studentid=10013096');");
}


(async () => {
    const browser = await puppeteer.launch({
        headless: false, // launch headful mode
        slowMo: 250, // slow down puppeteer script so that it's easier to follow visually
      });
    const page = await browser.newPage();
    
    page.on('request', request => {
      if (request.resourceType() === 'image')
        request.abort();
      else
        request.continue();
  });

    await page.goto(url, {waitUntil: 'networkidle2'});
    await page.goto(url2, {waitUntil: 'networkidle2'});
    await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook");
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    const html = await page.content();
    await page.screenshot({path: 'examples.png'});
  
    await $('.list', html).find("tbody").each(function() {
        console.log($(this).find(".categorytab").text());
    });

    await browser.close();

  })();
  

/*puppeteer
  .launch()
  .then(function(browser){
    return browser.newPage();
  })
  .then(function(page) {
    return page.goto().then(function() {
        return page.goto(url2).then(function() {
            //page.find(".headerCategoryTabSelected").click();
            page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook")
            //console.log(page.content())
            page.waitForNavigation({ waitUntil: 'networkidle0' })
            
            return page.content();
        });
    });
  })
  .then(function(html) {
    //console.log(html);
    page.screenshot({path: 'examples.png'});

  })
  .catch(function(err) {
    //handle error
  });*/

  